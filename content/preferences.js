/* global Zotero, Services, document, window, ChromeUtils */

var GroupLinkedFilesPrefs = {
	get glf() {
		return Zotero.GroupLinkedFiles;
	},

	_initialized: false,
	_currentID: null,

	NAMING_TEXT_FIELDS: {
		"glf-naming-template": "template",
		"glf-naming-separator": "authorSeparator",
		"glf-naming-etal": "etAl",
	},
	NAMING_CHECKBOXES: {
		"glf-naming-transliterate": "transliterate",
		"glf-naming-lowercase": "lowercase",
	},

	$(id) {
		return document.getElementById(id);
	},

	init() {
		if (this._initialized) {
			return;
		}
		this._initialized = true;
		this.styleOnce();

		this.$("glf-config").addEventListener("command", () => {
			this._currentID = this.$("glf-config").value;
			this.renderDetail(true);
		});
		this.$("glf-add").addEventListener("command", () => this.addConfig());
		this.$("glf-remove").addEventListener("command", () => this.removeConfig());
		this.$("glf-group").addEventListener("command", () => this.onGroupChange());
		this.$("glf-choose").addEventListener("command", () => this.chooseFolder());
		this.$("glf-check").addEventListener("command", () => this.refreshStatus(true));
		this.$("glf-mode").addEventListener("command", () => this.onModeChange());
		for (let [id, key] of [["glf-webdav-server", "server"], ["glf-webdav-path", "path"],
			["glf-webdav-user", "user"]]) {
			this.$(id).addEventListener("change", () => this.onWebDAVField(key, this.$(id).value));
		}
		this.$("glf-webdav-save").addEventListener("command", () => this.saveAndTest());
		this.$("glf-webdav-password").addEventListener("keypress", (event) => {
			if (event.key == "Enter") {
				this.saveAndTest();
			}
		});
		this.$("glf-webdav-browse").addEventListener("command", () => this.browseWebDAV());
		this.$("glf-download-all").addEventListener("command", () => this.downloadAll());

		this.$("glf-naming-enabled").addEventListener("command", () => {
			this.updateNaming({ enabled: this.$("glf-naming-enabled").checked });
		});
		for (let [id, key] of Object.entries(this.NAMING_CHECKBOXES)) {
			this.$(id).addEventListener("command", () => {
				this.updateNaming({ [key]: this.$(id).checked });
			});
		}
		for (let [id, key] of Object.entries(this.NAMING_TEXT_FIELDS)) {
			this.$(id).addEventListener("input", () => {
				this.updateNaming({ [key]: this.$(id).value });
			});
		}
		this.$("glf-naming-max").addEventListener("input", () => {
			let n = parseInt(this.$("glf-naming-max").value);
			if (n >= 1) {
				this.updateNaming({ maxAuthors: n });
			}
		});

		let configs = this.glf.getConfigs();
		this._currentID = configs.length ? configs[0].id : null;
		this.renderConfigList();
		this.renderDetail(false);
	},

	styleOnce() {
		for (let label of document.querySelectorAll("#glf-prefs .glf-label")) {
			label.style.marginTop = "10px";
		}
		let configRow = document.querySelector(".glf-config-row");
		configRow.style.gap = "6px";
		let configList = this.$("glf-config");
		configList.style.flex = "1";
		configList.style.minWidth = "0";
		let input = this.$("glf-base");
		input.style.flex = "1";
		input.style.minWidth = "0";
		for (let el of document.querySelectorAll("#glf-prefs .glf-help")) {
			el.style.margin = "6px 0";
			el.style.opacity = "0.85";
		}
		this.$("glf-same-folder").style.color = "var(--accent-orange, #c45a00)";
		Object.assign(document.querySelector(".glf-webdav-grid").style, {
			display: "grid",
			gridTemplateColumns: "max-content 1fr max-content",
			alignItems: "center",
			columnGap: "10px",
			rowGap: "6px",
			margin: "8px 0 4px",
		});
		for (let id of ["glf-webdav-server", "glf-webdav-path", "glf-webdav-user",
			"glf-webdav-password"]) {
			this.$(id).style.minWidth = "0";
		}
		for (let id of ["glf-webdav-result", "glf-download-progress"]) {
			Object.assign(this.$(id).style, { margin: "4px 0", transition: "opacity 120ms ease-out" });
		}
		this.$("glf-download-progress").style.marginInlineStart = "8px";
		let grid = document.querySelector(".glf-naming-grid");
		Object.assign(grid.style, {
			display: "grid",
			gridTemplateColumns: "max-content 1fr",
			alignItems: "center",
			columnGap: "12px",
			rowGap: "6px",
			margin: "6px 0 4px",
		});
		for (let el of document.querySelectorAll(".glf-naming-grid .glf-short")) {
			el.style.width = "8em";
		}
		document.l10n.setAttributes(this.$("glf-naming-help"), "glf-prefs-naming-help",
			{ tokens: "{authors}, {year}, {title}" });
		for (let id of ["glf-naming-preview", "glf-status"]) {
			Object.assign(this.$(id).style, {
				whiteSpace: "pre-wrap",
				fontFamily: "inherit",
				margin: "2px 0 8px",
				transition: "opacity 120ms ease-out",
			});
		}
		// The form below belongs to the link selected above: set it off with a rule
		Object.assign(this.$("glf-detail").style, {
			transition: "opacity 120ms ease-out",
			borderInlineStart: "2px solid color-mix(in srgb, currentColor 18%, transparent)",
			paddingInlineStart: "14px",
			marginInlineStart: "2px",
			marginTop: "4px",
		});
	},

	get current() {
		return this._currentID ? this.glf.getConfigByID(this._currentID) : null;
	},

	_groupName(config) {
		if (!config || !config.groupID) {
			return this.glf.l10n("glf-prefs-config-nogroup");
		}
		let group = Zotero.Groups.get(config.groupID);
		return group ? group.name : `#${config.groupID}`;
	},

	_folderName(config) {
		if (config.mode == "webdav") {
			let segments = String(config.webdav.path || "").split("/").filter(Boolean);
			return "WebDAV: " + (segments.length ? segments[segments.length - 1] : "/");
		}
		let path = this.glf.normalizePath(config.basePath);
		if (!path) {
			return this.glf.l10n("glf-prefs-config-nofolder");
		}
		return path.split(/[\\/]/).filter(Boolean).pop() || path;
	},

	/** The list of group links at the top */
	renderConfigList() {
		let configs = this.glf.getConfigs();
		if (this._currentID && !configs.some(c => c.id == this._currentID)) {
			this._currentID = configs.length ? configs[0].id : null;
		}
		let popup = this.$("glf-config-popup");
		popup.replaceChildren();
		for (let config of configs) {
			let item = document.createXULElement("menuitem");
			item.setAttribute("value", config.id);
			item.setAttribute("label", `${this._groupName(config)}  ·  ${this._folderName(config)}`);
			popup.append(item);
		}
		let has = configs.length > 0;
		this.$("glf-config").hidden = !has;
		this.$("glf-remove").hidden = !has;
		this.$("glf-empty").hidden = has;
		this.$("glf-detail").hidden = !has;
		if (has) {
			this.$("glf-config").value = this._currentID;
		}
	},

	/** The form for the selected group link */
	renderDetail(fade) {
		let config = this.current;
		if (!config) {
			return;
		}
		let detail = this.$("glf-detail");
		if (fade) {
			detail.style.opacity = "0.3";
		}
		this.populateGroups(config);
		this.$("glf-base").value = config.basePath || "";
		this.updateSameFolderWarning(config);
		this.$("glf-mode").value = config.mode;
		this.$("glf-webdav-server").value = config.webdav.server || "";
		this.$("glf-webdav-path").value = config.webdav.path || "";
		this.$("glf-webdav-user").value = config.webdav.user || "";
		this.$("glf-webdav-password").value = "";
		this.$("glf-webdav-result").textContent = "";
		this.$("glf-download-progress").textContent = "";
		this.updateModeVisibility(config);
		this.glf.getPassword(config).then((password) => {
			if (this._currentID == config.id) {
				this.$("glf-webdav-password").placeholder = password ? "••••••••" : "";
			}
		});

		let naming = this.glf.namingFromConfig(config.naming);
		this.$("glf-naming-enabled").checked = naming.enabled;
		for (let [id, key] of Object.entries(this.NAMING_CHECKBOXES)) {
			this.$(id).checked = naming[key];
		}
		for (let [id, key] of Object.entries(this.NAMING_TEXT_FIELDS)) {
			this.$(id).value = config.naming[key] ?? "";
		}
		this.$("glf-naming-max").value = String(naming.maxAuthors);
		this.updatePreview();
		this.refreshStatus(false);
		if (fade) {
			window.requestAnimationFrame(() => {
				detail.style.opacity = "1";
			});
		}
	},

	/** Group dropdown: groups not linked yet, plus this link's own group */
	populateGroups(config) {
		let popup = this.$("glf-group-popup");
		popup.replaceChildren();
		let none = document.createXULElement("menuitem");
		none.setAttribute("value", "0");
		none.setAttribute("data-l10n-id", "glf-prefs-group-none");
		popup.append(none);

		let usedElsewhere = new Set(this.glf.getConfigs()
			.filter(c => c.id != config.id && c.groupID)
			.map(c => c.groupID));
		let groups = Zotero.Groups.getAll()
			.filter(g => !usedElsewhere.has(g.id))
			.sort((a, b) => a.name.localeCompare(b.name));
		let found = false;
		for (let group of groups) {
			let item = document.createXULElement("menuitem");
			item.setAttribute("value", String(group.id));
			item.setAttribute("label", group.name);
			popup.append(item);
			if (group.id == config.groupID) {
				found = true;
			}
		}
		// Linked group not synced on this computer (yet): keep it visible
		if (config.groupID && !found) {
			let item = document.createXULElement("menuitem");
			item.setAttribute("value", String(config.groupID));
			item.setAttribute("label", `#${config.groupID}`);
			popup.append(item);
		}
		this.$("glf-group").value = String(config.groupID || 0);
	},

	updateModeVisibility(config) {
		let webdav = config.mode == "webdav";
		this.$("glf-folder-box").hidden = webdav;
		this.$("glf-webdav-box").hidden = !webdav;
		this.$("glf-download-all").hidden = !webdav;
	},

	onModeChange() {
		let config = this.current;
		if (!config) {
			return;
		}
		config = this.glf.updateConfig(config.id, { mode: this.$("glf-mode").value });
		this.updateModeVisibility(config);
		this.renderConfigList();
		this.refreshStatus(false);
	},

	onWebDAVField(key, value) {
		let config = this.current;
		if (!config) {
			return;
		}
		value = value.trim();
		if (key == "path") {
			value = value.split("/").map(s => s.trim()).filter(Boolean).join("/");
		}
		this.glf.updateConfig(config.id, { webdav: { [key]: value } });
		this.renderConfigList();
		this.refreshStatus(false);
	},

	_showResult(text, ok) {
		let el = this.$("glf-webdav-result");
		el.textContent = text;
		el.style.color = ok ? "" : "var(--accent-red, #c00)";
	},

	_errorText(e) {
		return e && e.l10nId ? this.glf.l10n(e.l10nId, e.l10nArgs) : String(e && e.message || e);
	},

	/** Save the typed password (if any) and try to list the folder */
	async saveAndTest() {
		let config = this.current;
		if (!config) {
			return;
		}
		// Pick up fields the user typed into without leaving them
		for (let [id, key] of [["glf-webdav-server", "server"], ["glf-webdav-path", "path"],
			["glf-webdav-user", "user"]]) {
			if (this.$(id).value.trim() != (config.webdav[key] || "")) {
				this.onWebDAVField(key, this.$(id).value);
			}
		}
		config = this.current;
		let field = this.$("glf-webdav-password");
		let typed = field.value;
		let button = this.$("glf-webdav-save");
		button.disabled = true;
		this._showResult("…", true);
		try {
			let result = await this.glf.testWebDAV(config, typed || null);
			if (typed) {
				await this.glf.setPassword(config, typed);
				field.value = "";
				field.placeholder = "••••••••";
			}
			this._showResult(this.glf.l10n("glf-prefs-webdav-ok", { files: result.files }), true);
			this.refreshStatus(false);
		}
		catch (e) {
			this._showResult(this._errorText(e), false);
		}
		finally {
			button.disabled = false;
		}
	},

	/** Walk the server's folders with simple list dialogs */
	async browseWebDAV() {
		let config = this.current;
		if (!config) {
			return;
		}
		let typed = this.$("glf-webdav-password").value || null;
		let path = String(config.webdav.path || "").split("/").filter(Boolean);
		while (true) {
			let subfolders;
			try {
				subfolders = await this.glf.webdavSubfolders(config, path.join("/"), typed);
			}
			catch (e) {
				if (path.length) {
					// Configured folder gone or not readable: start at the top
					path = [];
					continue;
				}
				this._showResult(this._errorText(e), false);
				return;
			}
			let shown = "/" + path.join("/");
			let options = [this.glf.l10n("glf-prefs-webdav-browse-use", { path: shown })];
			if (path.length) {
				options.push(this.glf.l10n("glf-prefs-webdav-browse-up"));
			}
			let offset = options.length;
			options.push(...subfolders.map(name => "📁 " + name));
			let selected = { value: 0 };
			let ok = Services.prompt.select(window, this.glf.l10n("glf-name"),
				this.glf.l10n("glf-prefs-webdav-browse-title"), options, selected);
			if (!ok) {
				return;
			}
			if (selected.value == 0) {
				this.$("glf-webdav-path").value = path.join("/");
				this.onWebDAVField("path", path.join("/"));
				this.saveAndTest();
				return;
			}
			if (path.length && selected.value == 1) {
				path.pop();
				continue;
			}
			path.push(subfolders[selected.value - offset]);
		}
	},

	async downloadAll() {
		let config = this.current;
		if (!config) {
			return;
		}
		let button = this.$("glf-download-all");
		let label = this.$("glf-download-progress");
		button.disabled = true;
		try {
			let { downloaded, failed } = await this.glf.downloadAll(config, (done, total) => {
				label.textContent = this.glf.l10n("glf-prefs-download-progress", { done, total });
			});
			label.textContent = this.glf.l10n("glf-prefs-download-done", { count: downloaded })
				+ (failed.length ? " · " + this.glf.l10n("glf-check-errors", { list: failed.join(", ") }) : "");
		}
		catch (e) {
			label.textContent = this._errorText(e);
		}
		finally {
			button.disabled = false;
			this.refreshStatus(false);
		}
	},

	updateSameFolderWarning(config) {
		let path = this.glf.normalizePath(config.basePath);
		let same = !!path && this.glf.getConfigs().some(c => c.id != config.id
			&& this.glf.normalizePath(c.basePath) == path);
		this.$("glf-same-folder").hidden = !same;
	},

	addConfig() {
		let used = new Set(this.glf.getConfigs().map(c => c.groupID));
		let free = Zotero.Groups.getAll()
			.filter(g => !used.has(g.id))
			.sort((a, b) => a.name.localeCompare(b.name));
		let config = this.glf.addConfig({ groupID: free.length ? free[0].id : 0 });
		this._currentID = config.id;
		this.renderConfigList();
		this.renderDetail(true);
	},

	removeConfig() {
		let config = this.current;
		if (!config) {
			return;
		}
		let ok = Services.prompt.confirm(
			window,
			this.glf.l10n("glf-name"),
			this.glf.l10n("glf-prefs-remove-confirm", { name: this._groupName(config) })
		);
		if (!ok) {
			return;
		}
		this.glf.removeConfig(config.id);
		this._currentID = null;
		this.renderConfigList();
		this.renderDetail(true);
	},

	onGroupChange() {
		let config = this.current;
		if (!config) {
			return;
		}
		let groupID = parseInt(this.$("glf-group").value) || 0;
		this.glf.updateConfig(config.id, { groupID });
		this.renderConfigList();
		this.refreshStatus(false);
	},

	async chooseFolder() {
		let config = this.current;
		if (!config) {
			return;
		}
		let { FilePicker } = ChromeUtils.importESModule(
			"chrome://zotero/content/modules/filePicker.mjs"
		);
		let fp = new FilePicker();
		fp.init(window, this.glf.l10n("glf-prefs-folder"), fp.modeGetFolder);
		let current = this.glf.normalizePath(config.basePath);
		if (current) {
			fp.displayDirectory = current;
		}
		if (await fp.show() != fp.returnOK) {
			return;
		}
		let path = fp.file;
		if (path && typeof path == "object") {
			path = path.path;
		}
		config = this.glf.updateConfig(config.id, { basePath: path });
		this.$("glf-base").value = path;
		this.updateSameFolderWarning(config);
		this.renderConfigList();
		this.refreshStatus(false);
	},

	updateNaming(patch) {
		let config = this.current;
		if (!config) {
			return;
		}
		this.glf.updateConfig(config.id, { naming: patch });
		this.updatePreview();
	},

	updatePreview() {
		let config = this.current;
		if (!config) {
			return;
		}
		let s = this.glf.namingFromConfig(config.naming);
		for (let id of ["glf-naming-template", "glf-naming-separator", "glf-naming-etal",
			"glf-naming-max", "glf-naming-transliterate", "glf-naming-lowercase"]) {
			this.$(id).disabled = !s.enabled;
		}
		let samples = [
			{ lastNames: ["Müller"], year: "1987", title: "Die Magnetschwebebahn" },
			{ lastNames: ["Müller", "Schmidt"], year: "1990", title: "Transrapid" },
			{ lastNames: ["Weber", "Braun", "Klein"], year: "2004", title: "Emsland" },
			{ lastNames: ["Fischer"], year: "", title: "Ohne Datum" },
		];
		let fmt = p => this.glf.formatBaseName(p, s);
		let label = p => `${p.lastNames.join(", ")} ${p.year ? "(" + p.year + ")" : ""}`.trim();
		let lines = samples.map(p => `${label(p)}  →  ${fmt(p)}.pdf`);
		lines.splice(1, 0, `${label(samples[0])}, 2.  →  ${fmt(samples[0])}a.pdf`);
		let preview = this.$("glf-naming-preview");
		preview.textContent = lines.join("\n");
		preview.style.opacity = s.enabled ? "0.85" : "0.4";
	},

	async refreshStatus(publish) {
		let config = this.current;
		let status = this.$("glf-status");
		let button = this.$("glf-check");
		if (!config) {
			status.textContent = "";
			return;
		}
		let id = config.id;
		status.style.opacity = "0.5";
		button.disabled = true;
		try {
			let { lines } = await this.glf.describeStatus({ publish, configID: id });
			// Ignore results for a link that is no longer selected
			if (this._currentID == id) {
				status.textContent = lines.join("\n");
			}
		}
		catch (e) {
			Zotero.logError(e);
			status.textContent = String(e.message || e);
		}
		finally {
			status.style.opacity = "1";
			button.disabled = false;
		}
	},
};

// Depending on the Zotero version, this script runs before or after the pane's markup
// is inserted, and in the window or in a sandbox. Inline handlers can't see this scope,
// so wire everything up from here.
if (document.getElementById("glf-prefs")) {
	GroupLinkedFilesPrefs.init();
}
else {
	let onLoad = (event) => {
		if (event.target && event.target.id == "glf-prefs") {
			document.removeEventListener("load", onLoad, true);
			GroupLinkedFilesPrefs.init();
		}
	};
	document.addEventListener("load", onLoad, true);
}
