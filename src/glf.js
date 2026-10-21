/* global Zotero, Services, IOUtils, PathUtils, ChromeUtils */
/*
 * Group Linked Files – keep one Zotero group's attachment files in a shared folder
 * (e.g. a synced HU-Box/Seafile library) instead of Zotero Storage, while they still
 * open in Zotero's own reader.
 *
 * How it works
 *   - Attachments in the group are ordinary *stored-file* attachments. Their filename
 *     (synced by Zotero's free data sync) is the link: <shared folder>/<filename>.
 *   - When Zotero can't find a stored file locally, the plugin resolves it to the
 *     shared folder instead (getFilePath / getFilePathAsync).
 *   - Zotero file syncing is switched off for this one group, so no PDF is uploaded.
 *   - New files added to the group in Zotero are copied into the shared folder.
 *
 * Guardrails: the plugin itself never renames, moves or deletes anything in the shared
 * folder, and it stops Zotero from doing so (rename, delete file, rotate/delete pages,
 * moving annotations into the PDF). The only write to the shared folder is copying a
 * new file in, and that never overwrites an existing file.
 */

var GroupLinkedFiles = {
	id: null,
	version: null,
	rootURI: null,

	PREF: "extensions.group-linked-files.",
	FTL: "group-linked-files.ftl",
	NOTIFIER_NAME: "groupLinkedFiles",
	PUBLISH_INTERVAL_MS: 10 * 60 * 1000,

	_active: false,
	_patches: [],
	_originals: {},
	_windows: new Map(),
	_notifierID: null,
	_timers: null,
	_publishTimeout: null,
	_publishInterval: null,
	_publishing: null,
	_paneID: null,
	_lastNotice: 0,
	_l10nObj: null,

	init({ id, version, rootURI, timers } = {}) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		this._timers = timers
			|| ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
		this._patches = [];
		this._originals = {};
		this._windows = new Map();
	},

	log(msg) {
		Zotero.debug("Group Linked Files: " + msg);
	},

	// ------------------------------------------------------------------ settings

	DEFAULT_NAMING: {
		enabled: true,
		template: "{authors}_{year}",
		authorSeparator: "-",
		etAl: "ua",
		maxAuthors: 2,
		noYear: "oJ",
		noAuthor: "oA",
		transliterate: true,
		lowercase: true,
	},

	getPref(name) {
		return Zotero.Prefs.get(this.PREF + name, true);
	},

	setPref(name, value) {
		Zotero.Prefs.set(this.PREF + name, value, true);
	},

	/**
	 * Group links, one per group: [{ id, groupID, basePath, naming }]. Stored as JSON in
	 * extensions.group-linked-files.groups on each computer (the folder path differs per
	 * computer anyway).
	 */
	getConfigs() {
		let raw = this.getPref("groups");
		if (typeof raw != "string" || !raw.trim()) {
			raw = "[]";
		}
		if (this._configCache && this._configCache.raw === raw) {
			return this._configCache.list;
		}
		let list;
		try {
			list = JSON.parse(raw);
		}
		catch (e) {
			Zotero.logError(e);
			list = [];
		}
		if (!Array.isArray(list)) {
			list = [];
		}
		list = list.filter(c => c && typeof c == "object").map(c => this._normalizeConfig(c));
		this._configCache = { raw, list };
		return list;
	},

	_normalizeConfig(c) {
		let naming = (c.naming && typeof c.naming == "object") ? c.naming : {};
		return {
			id: typeof c.id == "string" && c.id ? c.id : Math.random().toString(36).slice(2, 10),
			groupID: parseInt(c.groupID) > 0 ? parseInt(c.groupID) : 0,
			basePath: typeof c.basePath == "string" ? c.basePath : "",
			naming: { ...this.DEFAULT_NAMING, ...naming },
		};
	},

	setConfigs(list) {
		this.setPref("groups", JSON.stringify(list.map(c => this._normalizeConfig(c))));
		this._configCache = null;
	},

	getConfigByID(id) {
		return this.getConfigs().find(c => c.id == id) || null;
	},

	addConfig(partial = {}) {
		let config = this._normalizeConfig(partial);
		this.setConfigs([...this.getConfigs(), config]);
		return config;
	},

	/** Merge a patch into one group link (naming is merged key by key) */
	updateConfig(id, patch) {
		let list = this.getConfigs().map(c => (c.id != id ? c : this._normalizeConfig({
			...c,
			...patch,
			naming: { ...c.naming, ...(patch.naming || {}) },
		})));
		this.setConfigs(list);
		return this.getConfigByID(id);
	},

	removeConfig(id) {
		this.setConfigs(this.getConfigs().filter(c => c.id != id));
	},

	/** Local library ID of a group link, or null if the group isn't on this computer */
	getLibraryIDForConfig(config) {
		if (!config || !config.groupID) {
			return null;
		}
		return Zotero.Groups.getLibraryIDFromGroupID(config.groupID) || null;
	},

	/** Group link for a local library ID, or null */
	getConfig(libraryID) {
		if (!libraryID) {
			return null;
		}
		for (let config of this.getConfigs()) {
			if (config.groupID && this.getLibraryIDForConfig(config) === libraryID) {
				return config;
			}
		}
		return null;
	},

	/** Group links whose group exists on this computer, with their libraryID */
	getActiveConfigs() {
		return this.getConfigs()
			.map(c => ({ ...c, libraryID: this.getLibraryIDForConfig(c) }))
			.filter(c => c.libraryID);
	},

	normalizePath(path) {
		if (typeof path != "string" || !path.trim()) {
			return null;
		}
		try {
			return PathUtils.normalize(path.trim());
		}
		catch (e) {
			return null;
		}
	},

	/** Normalized shared folder of the library's group link on this computer, or null */
	getBasePath(libraryID) {
		let config = this.getConfig(libraryID);
		return config ? this.normalizePath(config.basePath) : null;
	},

	isManagedLibrary(libraryID) {
		return !!this.getConfig(libraryID);
	},

	/** A stored-file attachment in a linked group whose shared folder is set */
	isManagedItem(item) {
		try {
			return !!item
				&& item.isAttachment()
				&& item.isStoredFileAttachment()
				&& !(item.isEmbeddedImageAttachment && item.isEmbeddedImageAttachment())
				&& !!this.getBasePath(item.libraryID);
		}
		catch (e) {
			return false;
		}
	},

	/**
	 * Before 0.3 there was one group: groupID, basePath and naming.* prefs.
	 * Turn those into the first group link.
	 */
	migrateLegacyPrefs() {
		let groupID = parseInt(this.getPref("groupID"));
		if (!(groupID > 0) || this.getConfigs().length) {
			return false;
		}
		let naming = {};
		for (let key of Object.keys(this.DEFAULT_NAMING)) {
			let value = this.getPref("naming." + key);
			if (value !== undefined) {
				naming[key] = value;
			}
		}
		this.setConfigs([{ groupID, basePath: this.getPref("basePath") || "", naming }]);
		for (let name of ["groupID", "basePath", ...Object.keys(this.DEFAULT_NAMING).map(k => "naming." + k)]) {
			try {
				Zotero.Prefs.clear(this.PREF + name, true);
			}
			catch (e) {}
		}
		this.log(`migrated settings for group ${groupID}`);
		return true;
	},

	isValidSharedFilename(name) {
		return typeof name == "string"
			&& name.length > 0
			&& name != "."
			&& name != ".."
			&& !/[/\\]/.test(name)
			&& !name.startsWith(".zotero");
	},

	/** <shared folder>/<attachment filename>, or null */
	getSharedPath(item) {
		if (!this.isManagedItem(item)) {
			return null;
		}
		let name = item.attachmentFilename;
		if (!this.isValidSharedFilename(name)) {
			return null;
		}
		return PathUtils.join(this.getBasePath(item.libraryID), name);
	},

	/** Path of the attachment in Zotero's own storage folder (may not exist) */
	getLocalPath(item) {
		return PathUtils.join(
			Zotero.Attachments.getStorageDirectory(item).path,
			item.attachmentFilename
		);
	},

	/**
	 * The same filename can be stored in two Unicode forms (e.g. "ü" as one character
	 * on Windows, or "u" + combining mark as macOS often writes it). Windows doesn't
	 * treat them as the same name, so try both.
	 */
	_nameVariants(name) {
		return [...new Set([name, name.normalize("NFC"), name.normalize("NFD")])];
	},

	/** Candidate paths in the shared folder for this attachment, most likely first */
	getSharedCandidates(item) {
		let path = this.getSharedPath(item);
		if (!path) {
			return [];
		}
		let base = this.getBasePath(item.libraryID);
		return this._nameVariants(PathUtils.filename(path)).map(n => PathUtils.join(base, n));
	},

	/** Existing path of this attachment's file in the shared folder, or null */
	async findSharedFile(item) {
		for (let path of this.getSharedCandidates(item)) {
			if (await IOUtils.exists(path)) {
				return path;
			}
		}
		return null;
	},

	findSharedFileSync(item) {
		for (let path of this.getSharedCandidates(item)) {
			if (this._existsSync(path)) {
				return path;
			}
		}
		return null;
	},

	/** True if a file with this attachment's name exists in the shared folder */
	async isPublished(item) {
		return !!(await this.findSharedFile(item));
	},

	_comparablePath(path) {
		let p = PathUtils.normalize(path);
		// macOS and Windows file systems are usually case-insensitive
		return (Zotero.isMac || Zotero.isWin) ? p.toLowerCase() : p;
	},

	/** True if path is a file directly inside the library's shared folder (flat layout) */
	isInBase(path, libraryID) {
		let base = this.getBasePath(libraryID);
		if (!base || !path) {
			return false;
		}
		try {
			return this._comparablePath(PathUtils.parent(path)) == this._comparablePath(base);
		}
		catch (e) {
			return false;
		}
	},

	_existsSync(path) {
		try {
			return Zotero.File.pathToFile(path).exists();
		}
		catch (e) {
			return false;
		}
	},

	// ------------------------------------------------------------------ lifecycle

	async startup() {
		this._active = true;
		try {
			this.migrateLegacyPrefs();
		}
		catch (e) {
			Zotero.logError(e);
		}
		this.installPatches();
		Zotero.GroupLinkedFiles = this;
		await this.registerPrefPane();

		this._notifierID = Zotero.Notifier.registerObserver(
			{ notify: (...args) => this._onNotify(...args) },
			["item"],
			this.NOTIFIER_NAME
		);
		for (let win of Zotero.getMainWindows()) {
			this.addToWindow(win);
		}
		this._publishInterval = this._timers.setInterval(() => {
			this.publishPending().catch(e => Zotero.logError(e));
		}, this.PUBLISH_INTERVAL_MS);
		this.schedulePublish(30 * 1000);
		this.log(`started (version ${this.version})`);
	},

	shutdown() {
		this._active = false;
		if (this._publishTimeout) {
			this._timers.clearTimeout(this._publishTimeout);
			this._publishTimeout = null;
		}
		if (this._publishInterval) {
			this._timers.clearInterval(this._publishInterval);
			this._publishInterval = null;
		}
		if (this._notifierID) {
			Zotero.Notifier.unregisterObserver(this._notifierID);
			this._notifierID = null;
		}
		for (let win of [...this._windows.keys()]) {
			this.removeFromWindow(win);
		}
		if (this._paneID && Zotero.PreferencePanes.unregister) {
			try {
				Zotero.PreferencePanes.unregister(this._paneID);
			}
			catch (e) {}
		}
		this._paneID = null;
		this.removePatches();
		if (Zotero.GroupLinkedFiles === this) {
			delete Zotero.GroupLinkedFiles;
		}
		this.log("shut down");
	},

	// ------------------------------------------------------------------ patches

	/**
	 * Replace obj[name] with a wrapper. Wrappers check this._active, so if another
	 * plugin wrapped the same function after us and we can't cleanly restore, our
	 * wrapper just passes through.
	 */
	_patch(obj, name, makeWrapper) {
		let original = obj[name];
		if (typeof original != "function") {
			throw new Error(`Cannot patch ${name}: not a function`);
		}
		let hadOwn = Object.prototype.hasOwnProperty.call(obj, name);
		let wrapper = makeWrapper(original);
		obj[name] = wrapper;
		this._patches.push({ obj, name, original, hadOwn, wrapper });
		return original;
	},

	removePatches() {
		for (let p of this._patches.reverse()) {
			if (p.obj[p.name] !== p.wrapper) {
				this.log(`${p.name} was wrapped again by someone else -- leaving inactive wrapper`);
				continue;
			}
			if (p.hadOwn) {
				p.obj[p.name] = p.original;
			}
			else {
				delete p.obj[p.name];
			}
		}
		this._patches = [];
		this._originals = {};
	},

	installPatches() {
		let self = this;
		let ItemProto = Zotero.Item.prototype;

		// 1. Resolve missing stored files to the shared folder (sync variant)
		this._patch(ItemProto, "getFilePath", orig => function (...args) {
			let path = orig.apply(this, args);
			if (!self._active || !path) {
				return path;
			}
			try {
				if (!self.isManagedItem(this) || self._existsSync(path)) {
					return path;
				}
				let shared = self.findSharedFileSync(this);
				if (shared) {
					return shared;
				}
			}
			catch (e) {
				Zotero.logError(e);
			}
			return path;
		});

		// 2. Same for the async variant (used by the reader, PDF worker, full-text, ...)
		this._patch(ItemProto, "getFilePathAsync", orig => async function (...args) {
			let path = await orig.apply(this, args);
			if (!self._active || path) {
				return path;
			}
			try {
				if (!self.isManagedItem(this)) {
					return path;
				}
				let shared = await self.findSharedFile(this);
				if (shared) {
					if (typeof this._updateAttachmentStates == "function") {
						this._updateAttachmentStates(true);
					}
					return shared;
				}
			}
			catch (e) {
				Zotero.logError(e);
			}
			return path;
		});

		// 3. Guardrail: never rename a file that exists in the shared folder
		this._originals.renameAttachmentFile = this._patch(
			ItemProto, "renameAttachmentFile", orig => async function (...args) {
				if (self._active && self.isManagedItem(this) && await self.isPublished(this)) {
					self.log(`blocked rename of ${this.libraryKey}`);
					self.notifyBlocked("rename");
					return -2;
				}
				return orig.apply(this, args);
			}
		);

		// 4. Guardrail: never delete a file that exists in the shared folder
		this._patch(ItemProto, "deleteAttachmentFile", orig => async function (...args) {
			if (self._active && self.isManagedItem(this) && await self.isPublished(this)) {
				self.log(`blocked file deletion for ${this.libraryKey}`);
				self.notifyBlocked("delete");
				return false;
			}
			return orig.apply(this, args);
		});

		// 5. Zotero file syncing off for the configured group only
		let Local = Zotero.Sync && Zotero.Sync.Storage && Zotero.Sync.Storage.Local;
		if (Local && typeof Local.getEnabledForLibrary == "function") {
			this._patch(Local, "getEnabledForLibrary", orig => function (libraryID, ...rest) {
				if (self._active && self.isManagedLibrary(libraryID)) {
					return false;
				}
				return orig.call(this, libraryID, ...rest);
			});
		}
		else {
			Zotero.logError("Group Linked Files: Zotero.Sync.Storage.Local.getEnabledForLibrary "
				+ "not found -- file sync could not be switched off for the group");
		}

		// 6. Full-text: Zotero writes its PDF text cache next to a stored file. Keep that
		//    cache in Zotero's local storage folder instead of the shared folder.
		let FT = Zotero.Fulltext || Zotero.FullText;
		if (FT && typeof FT.indexPDF == "function") {
			this._patch(FT, "indexPDF", orig => async function (filePath, itemID, ...rest) {
				let item = null;
				try {
					item = self._active && filePath ? await Zotero.Items.getAsync(itemID) : null;
				}
				catch (e) {}
				if (item && self.isManagedItem(item) && self.isInBase(filePath, item.libraryID)) {
					try {
						let dir = Zotero.Attachments.getStorageDirectory(item).path;
						await Zotero.File.createDirectoryIfMissingAsync(dir);
						filePath = PathUtils.join(dir, PathUtils.filename(filePath));
					}
					catch (e) {
						Zotero.logError(e);
						// Never let the cache end up in the shared folder
						return false;
					}
				}
				return orig.call(this, filePath, itemID, ...rest);
			});
		}

		// 7. Guardrail: Zotero never writes into a shared PDF
		let W = Zotero.PDFWorker;
		if (W) {
			for (let name of ["rotatePages", "deletePages"]) {
				if (typeof W[name] != "function") {
					continue;
				}
				this._patch(W, name, orig => async function (itemID, ...rest) {
					if (self._active && self._isManagedID(itemID)) {
						self.log(`blocked ${name} for item ${itemID}`);
						self.notifyBlocked("modify");
						return 0;
					}
					return orig.call(this, itemID, ...rest);
				});
			}
			if (typeof W.import == "function") {
				this._patch(W, "import", orig => async function (itemID, isPriority, password, transfer, ...rest) {
					if (self._active && transfer && self._isManagedID(itemID)) {
						self.log(`blocked annotation transfer into file for item ${itemID}`);
						self.notifyBlocked("modify");
						return false;
					}
					return orig.call(this, itemID, isPriority, password, transfer, ...rest);
				});
			}
		}
	},

	_isManagedID(itemID) {
		try {
			return this.isManagedItem(Zotero.Items.get(itemID));
		}
		catch (e) {
			return false;
		}
	},

	// ------------------------------------------------------------------ notices

	l10n(id, args) {
		try {
			if (!this._l10nObj) {
				let win = Zotero.getMainWindow();
				this._l10nObj = new win.Localization([this.FTL], true);
			}
			return this._l10nObj.formatValueSync(id, args) || id;
		}
		catch (e) {
			return id;
		}
	},

	notify(title, text, timeout = 8000) {
		try {
			let pw = new Zotero.ProgressWindow();
			pw.changeHeadline(title);
			pw.addDescription(text);
			pw.show();
			pw.startCloseTimer(timeout);
		}
		catch (e) {
			this.log(`${title}: ${text}`);
		}
	},

	notifyBlocked(kind) {
		let now = Date.now();
		if (now - this._lastNotice < 8000) {
			return;
		}
		this._lastNotice = now;
		this.notify(this.l10n("glf-blocked-title"), this.l10n("glf-blocked-" + kind), 10000);
	},

	// ------------------------------------------------------------------ attach

	_mimeByExtension: {
		pdf: "application/pdf",
		epub: "application/epub+zip",
		html: "text/html",
		htm: "text/html",
		txt: "text/plain",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
	},

	async _contentType(path) {
		let ext = (PathUtils.filename(path).match(/\.([^.]+)$/) || [])[1];
		if (ext && this._mimeByExtension[ext.toLowerCase()]) {
			return this._mimeByExtension[ext.toLowerCase()];
		}
		try {
			return (await Zotero.MIME.getMIMETypeFromFile(path)) || "application/octet-stream";
		}
		catch (e) {
			return "application/octet-stream";
		}
	},

	/** Other attachments in the library that already point to this filename */
	async findAttachmentsByFilename(libraryID, filename) {
		let lib = Zotero.Libraries.get(libraryID);
		if (lib && lib.waitForDataLoad) {
			await lib.waitForDataLoad("item");
		}
		let items = await Zotero.Items.getAll(libraryID, false, false);
		return items.filter(item => item.isAttachment()
			&& item.isStoredFileAttachment()
			&& item.attachmentFilename == filename);
	},

	/**
	 * Attach a file that is already in the shared folder to a parent item, without
	 * copying it. Creates a normal stored-file attachment whose filename is the link.
	 */
	async attachSharedFile(parentItem, filePath) {
		if (!parentItem || !parentItem.isRegularItem()
				|| !this.isManagedLibrary(parentItem.libraryID)) {
			throw this._error("glf-error-not-group");
		}
		let base = this.getBasePath(parentItem.libraryID);
		if (!base || !(await IOUtils.exists(base))) {
			throw this._error("glf-error-no-folder");
		}
		if (!this.isInBase(filePath, parentItem.libraryID)) {
			throw this._error("glf-error-not-in-folder");
		}
		let name = PathUtils.filename(filePath);
		if (!this.isValidSharedFilename(name) || Zotero.File.getValidFileName(name) !== name) {
			throw this._error("glf-error-invalid-name");
		}
		if (!(await IOUtils.exists(filePath))) {
			throw this._error("glf-error-file-missing");
		}
		let contentType = await this._contentType(filePath);
		let item = new Zotero.Item("attachment");
		item.libraryID = parentItem.libraryID;
		item.parentKey = parentItem.key;
		item.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
		item.attachmentContentType = contentType;
		item.attachmentPath = "storage:" + name;
		item.setField("title", contentType == "application/pdf" ? "PDF" : name);
		await item.saveTx();
		this.log(`attached ${name} to ${parentItem.libraryKey} as ${item.libraryKey}`);
		return item;
	},

	_error(l10nId, args) {
		let e = new Error(l10nId);
		e.l10nId = l10nId;
		e.l10nArgs = args;
		return e;
	},

	// ------------------------------------------------------------------ publish

	_onNotify(event, type, ids) {
		if (!this._active || !["add", "modify"].includes(event)) {
			return;
		}
		let relevant = ids.some((id) => {
			let item = Zotero.Items.get(id);
			return item && item.isAttachment() && this.isManagedLibrary(item.libraryID);
		});
		if (relevant) {
			let delay = (parseInt(this.getPref("publishDelaySeconds")) || 0) * 1000;
			this.schedulePublish(delay + 5000);
		}
	},

	schedulePublish(delayMs) {
		if (this._publishTimeout) {
			this._timers.clearTimeout(this._publishTimeout);
		}
		this._publishTimeout = this._timers.setTimeout(() => {
			this._publishTimeout = null;
			this.publishPending().catch(e => Zotero.logError(e));
		}, delayMs);
	},

	/**
	 * Copy files that exist in this computer's Zotero storage but not yet in the shared
	 * folder (i.e. files someone added to the group in Zotero) into the shared folder.
	 * Never overwrites: if the name is taken by a different file, the new attachment
	 * gets a unique name first.
	 */
	publishPending({ force = false, libraryID = null } = {}) {
		// Runs one after another, never in parallel
		let run = (this._publishing || Promise.resolve())
			.catch(() => {})
			.then(() => this._publish(force, libraryID));
		this._publishing = run;
		run.finally(() => {
			if (this._publishing === run) {
				this._publishing = null;
			}
		}).catch(() => {});
		return run;
	},

	async _getLibraryItems(libraryID) {
		let lib = Zotero.Libraries.get(libraryID);
		if (lib && lib.waitForDataLoad) {
			await lib.waitForDataLoad("item");
		}
		return Zotero.Items.getAll(libraryID, false, false);
	},

	/** Publish pending files for every linked group (or just one library) */
	async _publish(force, onlyLibraryID = null) {
		let result = {
			published: [], renamed: [], waiting: 0, errors: [], baseMissing: false, missingBases: []
		};
		if (!this._active) {
			return result;
		}
		for (let config of this.getActiveConfigs()) {
			if (onlyLibraryID && config.libraryID != onlyLibraryID) {
				continue;
			}
			let r = await this._publishLibrary(config.libraryID, force);
			result.published.push(...r.published);
			result.renamed.push(...r.renamed);
			result.errors.push(...r.errors);
			result.waiting += r.waiting;
			if (r.baseMissing) {
				result.baseMissing = true;
				result.missingBases.push(config.basePath);
			}
		}
		return result;
	},

	async _publishLibrary(libraryID, force) {
		let result = {
			published: [], renamed: [], waiting: 0, errors: [], baseMissing: false
		};
		let base = this.getBasePath(libraryID);
		if (!this._active || !base) {
			return result;
		}
		// If the shared folder isn't there (not synced, drive missing), do nothing
		if (!(await IOUtils.exists(base))) {
			result.baseMissing = true;
			return result;
		}
		let delayMs = force
			? 0
			: Math.max(0, (parseInt(this.getPref("publishDelaySeconds")) || 0) * 1000);
		let naming = this.getNamingSettings(libraryID);
		let attachments = (await this._getLibraryItems(libraryID))
			.filter(item => this.isManagedItem(item))
			// Oldest first, so the earlier item gets "Name_1987" and later ones "…a", "…b"
			.sort((a, b) => this._olderFirst(a, b));
		let names = await this._buildNameIndex(base, attachments);

		for (let item of attachments) {
			let name = item.attachmentFilename;
			if (!this.isValidSharedFilename(name)) {
				continue;
			}
			let dir = Zotero.Attachments.getStorageDirectory(item).path;
			let local = PathUtils.join(dir, name);
			if (!(await IOUtils.exists(local))) {
				continue;
			}
			try {
				let shared = await this.findSharedFile(item);
				if (shared && await this._sameFile(local, shared)) {
					continue; // already in the shared folder
				}
				if (delayMs) {
					let modified = Zotero.Date.sqlToDate(item.dateModified, true);
					let stat = await IOUtils.stat(local);
					let last = Math.max(modified ? modified.getTime() : 0, stat.lastModified || 0);
					// Standalone files wait longer: "Retrieve Metadata" may still add a parent
					let wait = item.parentItemID ? delayMs : delayMs * 10;
					if (Date.now() - last < wait) {
						result.waiting++;
						continue;
					}
				}
				let desired = this._desiredFilename(item, name, naming, names);
				if (desired != name) {
					let renamed = await this._originals.renameAttachmentFile.call(
						item, desired, { overwrite: false, unique: false }
					);
					if (renamed !== true) {
						result.errors.push({ name, error: "rename failed: " + renamed });
						continue;
					}
					let newName = item.attachmentFilename;
					result.renamed.push({ from: name, to: newName });
					names.moveAttachment(item.id, name, newName);
					name = newName;
					local = PathUtils.join(dir, name);
				}
				await IOUtils.copy(local, PathUtils.join(base, name), { noOverwrite: true });
				names.addFile(name);
				result.published.push(name);
				this.log(`copied ${name} to shared folder`);
			}
			catch (e) {
				Zotero.logError(e);
				result.errors.push({ name, error: String(e && e.message || e) });
			}
		}
		return result;
	},

	/**
	 * Which names are taken: files in the shared folder, and filenames of the group's
	 * attachments (also ones whose file isn't on this computer). Compared with
	 * matchKey(), so "Müller_1987.pdf" and "mueller_1987.pdf" count as the same name.
	 */
	async _buildNameIndex(base, attachments) {
		let files = new Set();
		for (let path of await IOUtils.getChildren(base)) {
			files.add(this.matchKey(PathUtils.filename(path)));
		}
		let byName = new Map();
		let add = (key, id) => {
			if (!byName.has(key)) {
				byName.set(key, new Set());
			}
			byName.get(key).add(id);
		};
		for (let item of attachments) {
			add(this.matchKey(item.attachmentFilename || ""), item.id);
		}
		return {
			isTaken: (key, itemID) => files.has(key)
				|| [...(byName.get(key) || [])].some(id => id != itemID),
			addFile: name => files.add(this.matchKey(name)),
			moveAttachment: (itemID, from, to) => {
				let set = byName.get(this.matchKey(from));
				if (set) {
					set.delete(itemID);
				}
				add(this.matchKey(to), itemID);
			},
		};
	},

	/** Name a new file should get before it's copied into the shared folder */
	_desiredFilename(item, currentName, naming, names) {
		let isTaken = key => names.isTaken(key, item.id);
		let ext = this._extension(currentName);
		let base = null;
		if (naming.enabled && item.parentItemID) {
			let parent = Zotero.Items.get(item.parentItemID);
			if (parent && parent.isRegularItem()) {
				base = this.getBaseNameForItem(parent, naming);
			}
		}
		if (!base) {
			if (!isTaken(this.matchKey(currentName))) {
				return currentName;
			}
			return this._nextFreeName(this._stem(currentName), ext, isTaken, null, false);
		}
		return this._nextFreeName(base, ext, isTaken, currentName, true);
	},

	/**
	 * First free name: "Base.ext", then "Basea.ext", "Baseb.ext", … (letters) or
	 * "Base (2).ext", … If the current name already fits the scheme and is free, keep it.
	 */
	_nextFreeName(base, ext, isTaken, currentName, letters) {
		if (currentName && this._extension(currentName).toLowerCase() == ext.toLowerCase()) {
			let baseKey = this.matchKey(base);
			let curKey = this.matchKey(this._stem(currentName));
			if (curKey.startsWith(baseKey) && /^[a-z]?$/.test(curKey.slice(baseKey.length))
					&& !isTaken(this.matchKey(currentName))) {
				return currentName;
			}
		}
		let stems = [base];
		if (letters) {
			for (let c of "abcdefghijklmnopqrstuvwxyz") {
				stems.push(base + c);
			}
		}
		for (let n = 2; n < 1000; n++) {
			stems.push(`${base} (${n})`);
		}
		for (let stem of stems) {
			let name = stem + ext;
			if (!isTaken(this.matchKey(name))) {
				return name;
			}
		}
		throw new Error("No free filename for " + base + ext);
	},

	async _sameFile(a, b) {
		let [sa, sb] = await Promise.all([IOUtils.stat(a), IOUtils.stat(b)]);
		if (sa.size != sb.size) {
			return false;
		}
		let [ha, hb] = await Promise.all([
			Zotero.Utilities.Internal.md5Async(a),
			Zotero.Utilities.Internal.md5Async(b),
		]);
		return ha == hb;
	},

	/** Sort by date added, then by ID (several items can be added in the same second) */
	_olderFirst(a, b) {
		return String(a.dateAdded || "").localeCompare(String(b.dateAdded || "")) || a.id - b.id;
	},

	_extension(name) {
		let m = String(name).match(/(\.[A-Za-z0-9]{1,6})$/);
		return m && m.index > 0 ? m[1] : "";
	},

	_stem(name) {
		let ext = this._extension(name);
		return ext ? name.slice(0, -ext.length) : name;
	},

	// ------------------------------------------------------------------ naming

	/** Naming settings of a library's group link (defaults if it has none) */
	getNamingSettings(libraryID) {
		let config = this.getConfig(libraryID);
		return this.namingFromConfig(config ? config.naming : {});
	},

	/** Fill in defaults and fix types */
	namingFromConfig(naming = {}) {
		let d = this.DEFAULT_NAMING;
		let str = (key) => (typeof naming[key] == "string" ? naming[key] : d[key]);
		return {
			enabled: naming.enabled !== false,
			template: str("template").trim() || d.template,
			authorSeparator: str("authorSeparator"),
			etAl: str("etAl"),
			maxAuthors: Math.max(1, parseInt(naming.maxAuthors) || d.maxAuthors),
			noYear: str("noYear"),
			noAuthor: str("noAuthor"),
			transliterate: naming.transliterate !== false,
			lowercase: naming.lowercase !== false,
		};
	},

	_cleanPart(s) {
		return String(s || "")
			.normalize("NFC")
			// eslint-disable-next-line no-control-regex
			.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
			.replace(/\s+/g, " ")
			.trim();
	},

	/**
	 * Build a file name (without extension) from last names, year and title.
	 * Default "{authors}_{year}", umlauts replaced, lowercase:
	 * mueller_1987, mueller-schmidt_1990, weber-ua_2004.
	 */
	formatBaseName({ lastNames = [], year = "", title = "" }, s) {
		let names = lastNames.map(n => this._cleanPart(n)).filter(Boolean);
		let authors;
		if (!names.length) {
			authors = s.noAuthor;
		}
		else if (names.length <= s.maxAuthors) {
			authors = names.join(s.authorSeparator);
		}
		else {
			authors = s.etAl ? names[0] + s.authorSeparator + s.etAl : names[0];
		}
		let shortTitle = this._cleanPart(title).split(" ").slice(0, 6).join(" ").slice(0, 60);
		let out = s.template
			.replace(/\{authors\}/g, authors)
			.replace(/\{year\}/g, this._cleanPart(year) || s.noYear)
			.replace(/\{title\}/g, shortTitle);
		out = this._cleanPart(out).replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 150) || s.noAuthor;
		if (s.transliterate) {
			out = this.transliterate(out);
		}
		if (s.lowercase) {
			out = out.toLowerCase();
		}
		return out;
	},

	/** ä → ae, ö → oe, ü → ue, ß → ss; other accents dropped (é → e) */
	transliterate(s) {
		return String(s)
			.normalize("NFC")
			.replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
			.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
			.replace(/ẞ/g, "SS").replace(/ß/g, "ss")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.normalize("NFC");
	},

	/** Last names (authors, else editors, else anyone), year and title of an item */
	getNameParts(item) {
		let creators = item.getCreators();
		let primary = Zotero.CreatorTypes.getPrimaryIDForType(item.itemTypeID);
		let editor = Zotero.CreatorTypes.getID("editor");
		let pick = creators.filter(c => c.creatorTypeID == primary);
		if (!pick.length) {
			pick = creators.filter(c => c.creatorTypeID == editor);
		}
		if (!pick.length) {
			pick = creators;
		}
		let year = "";
		try {
			let sql = Zotero.Date.multipartToSQL(item.getField("date", true, true) || "");
			if (/^\d{4}/.test(sql) && !sql.startsWith("0000")) {
				year = sql.substr(0, 4);
			}
		}
		catch (e) {}
		return {
			lastNames: pick.map(c => c.lastName || c.name || ""),
			year,
			title: item.getField("title") || "",
		};
	},

	getBaseNameForItem(item, settings = this.getNamingSettings(item.libraryID)) {
		return this.formatBaseName(this.getNameParts(item), settings);
	},

	/** Comparison key: case-, Unicode-form- and umlaut-insensitive (ü = ue), no spaces */
	matchKey(s) {
		return String(s)
			.normalize("NFC")
			.toLowerCase()
			.replace(/ä/g, "ae")
			.replace(/ö/g, "oe")
			.replace(/ü/g, "ue")
			.replace(/ß/g, "ss")
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/\s+/g, "");
	},

	// ------------------------------------------------------------------ link matching

	_collectionItems(collection) {
		let out = new Map();
		let walk = (c) => {
			for (let item of c.getChildItems(false)) {
				out.set(item.id, item);
			}
			for (let sub of c.getChildCollections(false)) {
				walk(sub);
			}
		};
		walk(collection);
		return [...out.values()];
	},

	/**
	 * Find files in the shared folder whose name (without extension) matches an item's
	 * scheme name, for items that have no file yet. One file per name: if several items
	 * share author and year, only the oldest one gets the file; the others are skipped.
	 */
	async findMatches({ libraryID = null, collectionID = null } = {}) {
		let collection = null;
		if (collectionID) {
			collection = Zotero.Collections.get(collectionID);
			if (!collection) {
				throw this._error("glf-error-not-group");
			}
			libraryID = collection.libraryID;
		}
		if (!libraryID || !this.isManagedLibrary(libraryID)) {
			throw this._error("glf-error-choose-library");
		}
		let base = this.getBasePath(libraryID);
		if (!base || !(await IOUtils.exists(base))) {
			throw this._error("glf-error-no-folder");
		}
		let settings = this.getNamingSettings(libraryID);
		let all = await this._getLibraryItems(libraryID);
		let linked = new Set(all
			.filter(i => i.isAttachment() && i.isFileAttachment())
			.map(i => this.matchKey(i.attachmentFilename || "")));

		let index = new Map();
		for (let path of await IOUtils.getChildren(base)) {
			let name = PathUtils.filename(path);
			if (name.startsWith(".") || linked.has(this.matchKey(name))) {
				continue;
			}
			let info;
			try {
				info = await IOUtils.stat(path);
			}
			catch (e) {
				continue;
			}
			if (info.type && info.type != "regular") {
				continue;
			}
			let key = this.matchKey(this._stem(name));
			let prev = index.get(key);
			if (!prev || (!/\.pdf$/i.test(prev) && /\.pdf$/i.test(name))) {
				index.set(key, name);
			}
		}

		let scope = collection ? this._collectionItems(collection) : all;
		let candidates = scope
			.filter(item => item.isRegularItem() && !item.deleted)
			.filter(item => !Zotero.Items.get(item.getAttachments())
				.some(a => a && a.isFileAttachment()))
			.sort((a, b) => this._olderFirst(a, b));

		let used = new Set();
		let matches = [];
		let skipped = [];
		let unmatched = [];
		for (let item of candidates) {
			let key = this.matchKey(this.getBaseNameForItem(item, settings));
			if (used.has(key)) {
				skipped.push(item);
				continue;
			}
			let file = index.get(key);
			if (!file) {
				unmatched.push(item);
				continue;
			}
			used.add(key);
			index.delete(key);
			matches.push({ item, file });
		}
		return { matches, skipped, unmatched, checked: candidates.length };
	},

	async linkMatches(matches) {
		let linked = 0;
		let errors = [];
		for (let { item, file } of matches) {
			let base = this.getBasePath(item.libraryID);
			try {
				await this.attachSharedFile(item, PathUtils.join(base, file));
				linked++;
			}
			catch (e) {
				Zotero.logError(e);
				errors.push(file);
			}
		}
		return { linked, errors };
	},

	// ------------------------------------------------------------------ status

	/** Does Zotero's server have a file for this attachment (uploaded without the plugin)? */
	async _hasFileOnZoteroServer(item) {
		try {
			let Local = Zotero.Sync && Zotero.Sync.Data && Zotero.Sync.Data.Local;
			if (!Local || !Local.getCacheObject || !item.version) {
				return false;
			}
			let json = await Local.getCacheObject("item", item.libraryID, item.key, item.version);
			return !!(json && (json.md5 || (json.data && json.data.md5)));
		}
		catch (e) {
			return false;
		}
	},

	/** Status of one group link: what's found, missing, stuck in Zotero Storage */
	async getStatus(config) {
		let libraryID = this.getLibraryIDForConfig(config);
		let basePath = config ? this.normalizePath(config.basePath) : null;
		let status = {
			configured: false,
			groupID: config ? config.groupID : 0,
			libraryID,
			groupName: null,
			basePath,
			baseExists: false,
			total: 0,
			found: 0,
			missing: [],
			stranded: [],
		};
		if (libraryID) {
			let group = Zotero.Groups.get(config.groupID);
			status.groupName = group ? group.name : null;
		}
		if (basePath) {
			status.baseExists = await IOUtils.exists(basePath);
		}
		status.configured = !!(libraryID && basePath);
		if (!status.configured) {
			return status;
		}
		for (let item of await this._getLibraryItems(libraryID)) {
			if (!this.isManagedItem(item)) {
				continue;
			}
			status.total++;
			if (await item.getFilePathAsync()) {
				status.found++;
				continue;
			}
			status.missing.push(item.attachmentFilename);
			if (await this._hasFileOnZoteroServer(item)) {
				status.stranded.push(item.attachmentFilename);
			}
		}
		return status;
	},

	// ------------------------------------------------------------------ UI

	async registerPrefPane() {
		try {
			this._paneID = await Zotero.PreferencePanes.register({
				pluginID: this.id,
				src: this.rootURI + "content/preferences.xhtml",
				scripts: [this.rootURI + "content/preferences.js"],
				label: "Group Linked Files",
				image: this.rootURI + "content/icons/icon.svg",
			});
		}
		catch (e) {
			Zotero.logError(e);
		}
	},

	openPreferences() {
		Zotero.Utilities.Internal.openPreferences(this._paneID);
	},

	addToWindow(win) {
		if (this._windows.has(win)) {
			return;
		}
		let doc = win.document;
		win.MozXULElement.insertFTLIfNeeded(this.FTL);
		let cleanups = [];
		let add = (parent, el) => {
			parent.append(el);
			cleanups.push(() => el.remove());
			return el;
		};
		let menuitem = (id, l10nId, onCommand) => {
			let el = doc.createXULElement("menuitem");
			el.id = id;
			el.setAttribute("data-l10n-id", l10nId);
			el.addEventListener("command", () => {
				Promise.resolve(onCommand()).catch(e => Zotero.logError(e));
			});
			return el;
		};

		// Item context menu: "Attach file from shared folder…"
		let itemMenu = doc.getElementById("zotero-itemmenu");
		if (itemMenu) {
			let sep = add(itemMenu, doc.createXULElement("menuseparator"));
			sep.id = "glf-itemmenu-separator";
			let attach = add(itemMenu, menuitem(
				"glf-itemmenu-attach", "glf-menu-attach", () => this.cmdAttach(win)
			));
			let onShowing = (event) => {
				if (event.target !== itemMenu) {
					return;
				}
				let show = this._attachApplies(win);
				sep.hidden = !show;
				attach.hidden = !show;
			};
			itemMenu.addEventListener("popupshowing", onShowing);
			cleanups.push(() => itemMenu.removeEventListener("popupshowing", onShowing));
		}

		// Tools menu: submenu with check / settings / report
		let tools = doc.getElementById("menu_ToolsPopup");
		if (tools) {
			let menu = add(tools, doc.createXULElement("menu"));
			menu.id = "glf-tools-menu";
			menu.setAttribute("data-l10n-id", "glf-menu-tools");
			let popup = doc.createXULElement("menupopup");
			menu.append(popup);
			popup.append(
				menuitem("glf-tools-link", "glf-menu-link", () => this.cmdLink(win, { libraryID: this._libraryForTools(win) })),
				menuitem("glf-tools-check", "glf-menu-check", () => this.cmdCheck(win)),
				doc.createXULElement("menuseparator"),
				menuitem("glf-tools-settings", "glf-menu-settings", () => this.openPreferences()),
				menuitem("glf-tools-report", "glf-menu-report", () => this.cmdReport())
			);
		}

		// Collection/library context menu: link matching files for that collection
		let collectionMenu = doc.getElementById("zotero-collectionmenu");
		if (collectionMenu) {
			let sep = add(collectionMenu, doc.createXULElement("menuseparator"));
			sep.id = "glf-collectionmenu-separator";
			let link = add(collectionMenu, menuitem(
				"glf-collectionmenu-link", "glf-menu-link-collection",
				() => this.cmdLink(win, {
					collectionID: this._selectedCollectionID(win),
					libraryID: win.ZoteroPane.getSelectedLibraryID(),
				})
			));
			let onShowing = (event) => {
				if (event.target !== collectionMenu) {
					return;
				}
				let show = false;
				try {
					show = this.isManagedLibrary(win.ZoteroPane.getSelectedLibraryID());
				}
				catch (e) {}
				sep.hidden = !show;
				link.hidden = !show;
			};
			collectionMenu.addEventListener("popupshowing", onShowing);
			cleanups.push(() => collectionMenu.removeEventListener("popupshowing", onShowing));
		}

		this._windows.set(win, () => {
			for (let fn of cleanups.reverse()) {
				try {
					fn();
				}
				catch (e) {}
			}
			let link = doc.querySelector(`link[href="${this.FTL}"]`);
			if (link) {
				link.remove();
			}
		});
	},

	removeFromWindow(win) {
		let cleanup = this._windows.get(win);
		if (cleanup) {
			cleanup();
			this._windows.delete(win);
		}
	},

	_attachApplies(win) {
		try {
			let items = win.ZoteroPane.getSelectedItems();
			return items.length == 1
				&& items[0].isRegularItem()
				&& this.isManagedLibrary(items[0].libraryID);
		}
		catch (e) {
			return false;
		}
	},

	_alert(win, text) {
		Services.prompt.alert(win, this.l10n("glf-name"), text);
	},

	async cmdAttach(win) {
		if (!this._attachApplies(win)) {
			this._alert(win, this.l10n("glf-error-not-group"));
			return;
		}
		let parent = win.ZoteroPane.getSelectedItems()[0];
		let base = this.getBasePath(parent.libraryID);
		if (!base || !(await IOUtils.exists(base))) {
			this._alert(win, this.l10n("glf-error-no-folder"));
			return;
		}
		let { FilePicker } = ChromeUtils.importESModule(
			"chrome://zotero/content/modules/filePicker.mjs"
		);
		let fp = new FilePicker();
		fp.init(win, this.l10n("glf-picker-title"), fp.modeOpen);
		fp.displayDirectory = base;
		fp.appendFilter("PDF", "*.pdf");
		fp.appendFilters(fp.filterAll);
		if (await fp.show() != fp.returnOK) {
			return;
		}
		let path = fp.file;
		if (path && typeof path == "object") {
			path = path.path;
		}
		try {
			let others = await this.findAttachmentsByFilename(
				parent.libraryID, PathUtils.filename(path)
			);
			if (others.length && !Services.prompt.confirm(
				win,
				this.l10n("glf-name"),
				this.l10n("glf-confirm-duplicate", { count: others.length })
			)) {
				return;
			}
			let item = await this.attachSharedFile(parent, path);
			this.notify(
				this.l10n("glf-name"),
				this.l10n("glf-attached", { name: item.attachmentFilename }),
				4000
			);
		}
		catch (e) {
			if (e.l10nId) {
				this._alert(win, this.l10n(e.l10nId, e.l10nArgs));
			}
			else {
				Zotero.logError(e);
				this._alert(win, this.l10n("glf-error-generic", { message: String(e.message || e) }));
			}
		}
	},

	/** Human-readable summary lines for the check command and the settings pane */
	/**
	 * Human-readable status lines for the check command and the settings pane:
	 * all group links, or just one (configID).
	 */
	async describeStatus({ publish = false, configID = null } = {}) {
		let configs = configID
			? [this.getConfigByID(configID)].filter(Boolean)
			: this.getConfigs();
		if (!configs.length) {
			return { statuses: [], lines: [this.l10n("glf-not-configured")] };
		}
		let lines = [];
		let statuses = [];
		for (let config of configs) {
			if (lines.length) {
				lines.push("", "────────", "");
			}
			let libraryID = this.getLibraryIDForConfig(config);
			let published = null;
			if (publish && libraryID) {
				published = await this.publishPending({ force: true, libraryID });
			}
			let s = await this.getStatus(config);
			statuses.push(s);
			lines.push(...this._statusLines(s, published));
		}
		return { statuses, status: statuses[0], lines };
	},

	_statusLines(s, published) {
		if (!s.groupID) {
			return [this.l10n("glf-config-no-group")];
		}
		if (!s.libraryID) {
			return [this.l10n("glf-group-not-found", { id: s.groupID })];
		}
		let lines = [this.l10n("glf-check-group", { name: s.groupName || String(s.groupID) })];
		if (!s.basePath) {
			lines.push(this.l10n("glf-check-no-folder"));
			return lines;
		}
		lines.push(s.baseExists
			? this.l10n("glf-check-folder", { path: s.basePath })
			: this.l10n("glf-check-folder-missing", { path: s.basePath }));
		lines.push(this.l10n("glf-check-counts", {
			total: s.total, found: s.found, missing: s.missing.length
		}));
		if (published) {
			if (published.published.length) {
				lines.push(this.l10n("glf-check-published", { count: published.published.length }));
			}
			if (published.renamed.length) {
				lines.push(this.l10n("glf-check-renamed", {
					list: published.renamed.map(r => `${r.from} → ${r.to}`).join(", ")
				}));
			}
			if (published.errors.length) {
				lines.push(this.l10n("glf-check-errors", {
					list: published.errors.map(r => r.name).join(", ")
				}));
			}
		}
		if (s.stranded.length) {
			lines.push("", this.l10n("glf-check-stranded", { count: s.stranded.length }));
			lines.push(...s.stranded.slice(0, 15).map(n => "  • " + n));
			if (s.stranded.length > 15) {
				lines.push(this.l10n("glf-check-more", { count: s.stranded.length - 15 }));
			}
		}
		let missing = s.missing.filter(n => !s.stranded.includes(n));
		if (missing.length) {
			let shown = missing.slice(0, 15);
			lines.push("", this.l10n("glf-check-missing-list"));
			lines.push(...shown.map(n => "  • " + n));
			if (missing.length > shown.length) {
				lines.push(this.l10n("glf-check-more", { count: missing.length - shown.length }));
			}
		}
		return lines;
	},

	/** Library for "Link Matching Files" from the Tools menu */
	_libraryForTools(win) {
		try {
			let selected = win.ZoteroPane.getSelectedLibraryID();
			if (this.isManagedLibrary(selected)) {
				return selected;
			}
		}
		catch (e) {}
		let active = this.getActiveConfigs();
		return active.length == 1 ? active[0].libraryID : null;
	},

	_selectedCollectionID(win) {
		try {
			let collection = win.ZoteroPane.getSelectedCollection();
			return collection ? collection.id : null;
		}
		catch (e) {
			return null;
		}
	},

	_itemLabel(item) {
		let title = item.getField("title") || "";
		return title.length > 60 ? title.slice(0, 57) + "…" : title;
	},

	/** "Link Matching Files…": preview, confirm, link */
	async cmdLink(win, { libraryID = null, collectionID = null } = {}) {
		let found;
		try {
			found = await this.findMatches({ libraryID, collectionID });
		}
		catch (e) {
			if (e.l10nId) {
				this._alert(win, this.l10n(e.l10nId, e.l10nArgs));
				return;
			}
			throw e;
		}
		let { matches, skipped, unmatched, checked } = found;
		let notes = [];
		if (skipped.length) {
			notes.push(this.l10n("glf-link-skipped", { count: skipped.length }));
		}
		if (!matches.length) {
			this._alert(win, [this.l10n("glf-link-none", { checked }), ...notes].join("\n\n"));
			return;
		}
		let shown = matches.slice(0, 20);
		let lines = [
			this.l10n("glf-link-found", { count: matches.length, checked }),
			"",
			...shown.map(m => `${m.file}  →  ${this._itemLabel(m.item)}`),
		];
		if (matches.length > shown.length) {
			lines.push(this.l10n("glf-check-more", { count: matches.length - shown.length }));
		}
		if (notes.length) {
			lines.push("", ...notes);
		}
		lines.push("", this.l10n("glf-link-question"));
		if (!Services.prompt.confirm(win, this.l10n("glf-name"), lines.join("\n"))) {
			return;
		}
		let { linked, errors } = await this.linkMatches(matches);
		let summary = [this.l10n("glf-link-done", { count: linked })];
		if (errors.length) {
			summary.push(this.l10n("glf-check-errors", { list: errors.join(", ") }));
		}
		if (unmatched.length) {
			summary.push(this.l10n("glf-link-unmatched", { count: unmatched.length }));
		}
		this._alert(win, summary.join("\n"));
	},

	async cmdCheck(win) {
		let { lines } = await this.describeStatus({ publish: true });
		this._alert(win, lines.join("\n"));
	},

	cmdReport() {
		let info = [
			`Plugin version: ${this.version}`,
			`Zotero version: ${Zotero.version}`,
			`Platform: ${Zotero.platform || Services.appinfo.OS}`,
			`Group links: ${this.getConfigs().length}`,
			`Groups found locally: ${this.getActiveConfigs().length}`,
			`Shared folders set: ${this.getConfigs().filter(c => this.normalizePath(c.basePath)).length}`,
		].join("\n");
		let title = "Problem: ";
		let body = "What happened?\n\n\nWhat did you expect?\n\n\n---\n" + info;
		let email = this.getPref("reportEmail");
		let url;
		if (email) {
			url = `mailto:${email}?subject=${encodeURIComponent("[Group Linked Files] " + title)}`
				+ `&body=${encodeURIComponent(body)}`;
		}
		else {
			url = `${this.getPref("reportURL")}?title=${encodeURIComponent(title)}`
				+ `&body=${encodeURIComponent(body)}`;
		}
		Zotero.launchURL(url);
	},
};

if (typeof module != "undefined") {
	module.exports = GroupLinkedFiles;
}
