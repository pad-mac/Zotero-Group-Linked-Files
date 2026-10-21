/* global Zotero, Services, IOUtils, PathUtils, ChromeUtils */
/*
 * Integration checks for Group Linked Files, run inside a real Zotero.
 * Reads its settings from prefs set by run.sh (glf-harness.out, glf-harness.dir),
 * writes a JSON report and quits Zotero.
 */

function install() {}
function uninstall() {}
function shutdown() {}

function startup() {
	// Zotero starts plugins one after another and waits for each startup(), so run the
	// checks in the background and let the plugin under test start.
	main().catch(e => Zotero.logError(e));
}

async function main() {
	await Zotero.initializationPromise;
	await Zotero.uiReadyPromise;
	let out = Services.prefs.getStringPref("glf-harness.out");
	let dir = Services.prefs.getStringPref("glf-harness.dir");
	let results = [];
	let report = { zoteroVersion: Zotero.version, results };
	try {
		await run(dir, results, report);
	}
	catch (e) {
		results.push({ name: "harness", ok: false, error: String(e && e.stack || e) });
	}
	await IOUtils.writeUTF8(out, JSON.stringify(report, null, 2));
	Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}

async function waitFor(fn, ms = 20000, label = "condition") {
	let t = Date.now();
	while (Date.now() - t < ms) {
		let v = await fn();
		if (v) {
			return v;
		}
		await Zotero.Promise.delay(200);
	}
	throw new Error("Timed out waiting for " + label);
}

function assert(cond, msg) {
	if (!cond) {
		throw new Error(msg);
	}
}

async function listDir(path) {
	let children = await IOUtils.getChildren(path);
	return children.map(p => PathUtils.filename(p)).sort();
}

async function md5(path) {
	return Zotero.Utilities.Internal.md5Async(path);
}

async function run(dir, results, report) {
	let check = async (name, fn) => {
		try {
			let detail = await fn();
			results.push({ name, ok: true, detail });
		}
		catch (e) {
			results.push({ name, ok: false, error: `${e}\n${e && e.stack || ""}` });
		}
	};

	let base = PathUtils.join(dir, "HU-Box");
	let fixtures = PathUtils.join(dir, "fixtures");
	let glf;

	await check("plugin loads and exposes itself", async () => {
		glf = await waitFor(() => Zotero.GroupLinkedFiles, 20000, "plugin startup");
		report.pluginVersion = glf.version;
		return glf.version;
	});
	if (!glf) {
		return;
	}

	// --- set up a group library like a synced one
	if (!Zotero.Users.getCurrentUserID()) {
		await Zotero.Users.setCurrentUserID(1);
	}
	if (!Zotero.Users.getName(1)) {
		await Zotero.Users.setName(1, "Tester");
	}
	let group = new Zotero.Group();
	group.id = 4711;
	group.name = "Transrapid-Team";
	group.description = "";
	group.editable = true;
	group.filesEditable = true;
	group.version = 1;
	group.archived = false;
	await group.saveTx();
	let libraryID = group.libraryID;
	let cfg;

	// run.sh starts Zotero with the old (0.2) single-group prefs; the plugin must have
	// turned them into the first group link. naming.enabled=false keeps plain filenames
	// for the basic checks; the naming scheme is tested further down.
	await check("old single-group settings are migrated", async () => {
		let configs = glf.getConfigs();
		assert(configs.length == 1, "configs: " + JSON.stringify(configs));
		cfg = configs[0];
		assert(cfg.groupID == 4711, "groupID " + cfg.groupID);
		assert(cfg.basePath == base, "basePath " + cfg.basePath);
		assert(cfg.naming.enabled === false, "naming.enabled not migrated");
		assert(Zotero.Prefs.get("extensions.group-linked-files.groupID", true) === undefined,
			"old pref left behind");
		return cfg;
	});
	if (!cfg) {
		cfg = glf.addConfig({ groupID: 4711, basePath: base, naming: { enabled: false } });
	}

	let createItem = async (authors, year, { editors = [] } = {}) => {
		let item = new Zotero.Item("book");
		item.libraryID = libraryID;
		item.setField("title", `${authors.concat(editors).join(" / ")} ${year}`);
		if (year) {
			item.setField("date", year);
		}
		item.setCreators([
			...authors.map(lastName => ({ firstName: "A.", lastName, creatorType: "author" })),
			...editors.map(lastName => ({ firstName: "E.", lastName, creatorType: "editor" })),
		]);
		await item.saveTx();
		return item;
	};

	let parent = new Zotero.Item("book");
	parent.libraryID = libraryID;
	parent.setField("title", "Die Magnetschwebebahn");
	await parent.saveTx();

	let sharedPDF = PathUtils.join(base, "Mueller - 1987 - Magnetschwebebahn.pdf");
	let sharedMD5 = await md5(sharedPDF);
	let att;

	await check("attach file from shared folder (no copy)", async () => {
		att = await glf.attachSharedFile(parent, sharedPDF);
		let p = await att.getFilePathAsync();
		assert(p == sharedPDF, "resolved to " + p);
		assert(await att.fileExists(), "fileExists false");
		let storageDir = Zotero.Attachments.getStorageDirectory(att).path;
		assert(!(await IOUtils.exists(PathUtils.join(storageDir, PathUtils.filename(sharedPDF)))),
			"file was copied into Zotero storage");
		return p;
	});

	await check("sync getFilePath resolves to the shared folder (used by double-click)", async () => {
		let p = att.getFilePath();
		assert(p == sharedPDF, "resolved to " + p);
	});

	await check("opens in Zotero's own PDF reader", async () => {
		let reader = await Zotero.Reader.open(att.id);
		assert(reader, "no reader instance");
		await reader._initPromise;
		await waitFor(() => reader._internalReader, 20000, "internal reader");
		await Promise.race([
			reader._internalReader._primaryView.initializedPromise,
			Zotero.Promise.delay(30000).then(() => {
				throw new Error("PDF view did not initialize");
			}),
		]);
		report.readerType = reader._type;
		assert(reader._type == "pdf", "reader type " + reader._type);
		return "PDF view initialized";
	});

	await check("annotation saved on the attachment (synced via data sync)", async () => {
		let json = {
			key: Zotero.DataObjectUtilities.generateKey(),
			type: "highlight",
			text: "Magnetschwebebahn",
			comment: "Testkommentar",
			color: "#ffd400",
			pageLabel: "1",
			sortIndex: "00000|000100|00072",
			position: { pageIndex: 0, rects: [[72, 715, 300, 745]] },
		};
		await Zotero.Annotations.saveFromJSON(att, json);
		let annotations = att.getAnnotations();
		assert(annotations.length == 1, "annotations: " + annotations.length);
		assert(annotations[0].annotationComment == "Testkommentar", "comment mismatch");
		assert(await md5(sharedPDF) == sharedMD5, "PDF changed");
	});

	await check("full-text index works, cache stays out of the shared folder", async () => {
		await Zotero.Fulltext.indexItems([att.id], { complete: true });
		let state = await Zotero.Fulltext.getIndexedState(att);
		assert(state == Zotero.Fulltext.INDEX_STATE_INDEXED
			|| state == Zotero.Fulltext.INDEX_STATE_PARTIAL, "index state " + state);
		let s = new Zotero.Search();
		s.libraryID = libraryID;
		s.addCondition("fulltextContent", "contains", "Magnetschwebebahn");
		let ids = await s.search();
		assert(ids.includes(att.id), "full-text search did not find attachment");
		let files = await listDir(base);
		assert(!files.some(f => f.startsWith(".zotero")), "cache in shared folder: " + files);
		return `index state ${state}`;
	});

	await check("guardrail: rename from Zotero is blocked", async () => {
		let before = await listDir(base);
		let r = await att.renameAttachmentFile("Renamed.pdf");
		assert(r === -2, "rename returned " + r);
		assert(JSON.stringify(await listDir(base)) == JSON.stringify(before), "folder changed");
		assert(att.attachmentFilename == PathUtils.filename(sharedPDF), "filename changed");
	});

	await check("guardrail: deleting the attachment file is blocked", async () => {
		let r = await att.deleteAttachmentFile();
		assert(r === false, "deleteAttachmentFile returned " + r);
		assert(await IOUtils.exists(sharedPDF), "shared file deleted");
	});

	await check("guardrail: rotating/deleting pages doesn't touch the PDF", async () => {
		await Zotero.PDFWorker.rotatePages(att.id, [0], 90, true);
		await Zotero.PDFWorker.deletePages(att.id, [0], true);
		assert(await md5(sharedPDF) == sharedMD5, "PDF changed");
	});

	await check("file sync off for the group only", async () => {
		let L = Zotero.Sync.Storage.Local;
		assert(L.getEnabledForLibrary(libraryID) === false, "group still enabled");
		let user = L.getEnabledForLibrary(Zotero.Libraries.userLibraryID);
		assert(user === !!Zotero.Prefs.get("sync.storage.enabled"), "user library changed: " + user);
		return { group: false, userLibrary: user };
	});

	let imported;
	await check("file added in Zotero is copied into the shared folder", async () => {
		imported = await Zotero.Attachments.importFromFile({
			file: PathUtils.join(fixtures, "Neu - 2024 - Hochgeschwindigkeit.pdf"),
			parentItemID: parent.id,
		});
		let r = await glf.publishPending({ force: true });
		let target = PathUtils.join(base, imported.attachmentFilename);
		assert(await IOUtils.exists(target), "not copied; result " + JSON.stringify(r));
		return JSON.parse(JSON.stringify(r));
	});

	await check("same name, different file: never overwritten, gets a unique name", async () => {
		let before = await md5(PathUtils.join(base, "Neu - 2024 - Hochgeschwindigkeit.pdf"));
		let other = await Zotero.Attachments.importFromFile({
			file: PathUtils.join(fixtures, "other", "Neu - 2024 - Hochgeschwindigkeit.pdf"),
			parentItemID: parent.id,
		});
		let r = await glf.publishPending({ force: true });
		assert(await md5(PathUtils.join(base, "Neu - 2024 - Hochgeschwindigkeit.pdf")) == before,
			"existing file overwritten");
		assert(other.attachmentFilename == "Neu - 2024 - Hochgeschwindigkeit (2).pdf",
			"filename " + other.attachmentFilename);
		assert(await IOUtils.exists(PathUtils.join(base, other.attachmentFilename)), "not copied");
		return JSON.parse(JSON.stringify(r));
	});

	await check("new file renamed by Zotero before copying is copied under its final name", async () => {
		// Zotero renames new files from parent metadata right after adding them
		// (drag & drop, "Add File"). That must still work before the file is shared.
		let added = await Zotero.Attachments.importFromFile({
			file: PathUtils.join(fixtures, "scan_0042.pdf"),
			parentItemID: parent.id,
		});
		let r = await added.renameAttachmentFile("Die Magnetschwebebahn.pdf");
		assert(r === true, "rename before sharing returned " + r);
		await glf.publishPending({ force: true });
		assert(await IOUtils.exists(PathUtils.join(base, "Die Magnetschwebebahn.pdf")),
			"not copied under final name");
		assert(!(await IOUtils.exists(PathUtils.join(base, "scan_0042.pdf"))),
			"copied under temporary name");
		let again = await added.renameAttachmentFile("Something else.pdf");
		assert(again === -2, "rename after sharing returned " + again);
	});

	await check("new files get the naming scheme: name_jahr, a/b, a-ua, ü→ue, lowercase, editors", async () => {
		glf.updateConfig(cfg.id, { naming: { enabled: true } });
		let m1 = await createItem(["Müller"], "1987");
		let m2 = await createItem(["Müller"], "1987");
		let w = await createItem(["Weber", "Braun", "Klein"], "2004");
		let ms = await createItem(["Müller", "Schmidt"], "1990");
		let ed = await createItem([], "2010", { editors: ["Herausgeberin"] });
		let imp = parent => Zotero.Attachments.importFromFile({
			file: PathUtils.join(fixtures, "scan_0042.pdf"),
			parentItemID: parent.id,
		});
		let atts = [];
		for (let parent of [m1, m2, w, ms, ed]) {
			atts.push(await imp(parent));
		}
		await glf.publishPending({ force: true });
		let names = atts.map(a => a.attachmentFilename);
		let expected = ["mueller_1987.pdf", "mueller_1987a.pdf", "weber-ua_2004.pdf",
			"mueller-schmidt_1990.pdf", "herausgeberin_2010.pdf"];
		assert(JSON.stringify(names) == JSON.stringify(expected), "names " + JSON.stringify(names));
		for (let n of expected) {
			assert(await IOUtils.exists(PathUtils.join(base, n)), "not in shared folder: " + n);
		}
		return names;
	});

	await check("umlauts: file stored in the other Unicode form is found", async () => {
		let nfc = "Kühn_1999.pdf".normalize("NFC");
		let nfd = nfc.normalize("NFD");
		await IOUtils.copy(sharedPDF, PathUtils.join(base, nfd));
		let parent2 = await createItem(["Kühn"], "1999");
		let a = new Zotero.Item("attachment");
		a.libraryID = libraryID;
		a.parentKey = parent2.key;
		a.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
		a.attachmentContentType = "application/pdf";
		a.attachmentPath = "storage:" + nfc;
		await a.saveTx();
		let p = await a.getFilePathAsync();
		assert(p == PathUtils.join(base, nfd), "resolved to " + p);
	});

	await check("link matching files: scheme name, first item wins, collection scope", async () => {
		for (let n of ["Braun_1999.pdf", "Braun-Klein_2001.pdf", "Koenig_1975.pdf"]) {
			await IOUtils.copy(sharedPDF, PathUtils.join(base, n));
		}
		let before = await listDir(base);
		let b1 = await createItem(["Braun"], "1999");
		let b2 = await createItem(["Braun"], "1999");
		let bk = await createItem(["Braun", "Klein"], "2001");
		let ko = await createItem(["König"], "1975");
		let coll = new Zotero.Collection({ libraryID, name: "Kapitel 3" });
		await coll.saveTx();
		bk.addToCollection(coll.id);
		await bk.saveTx();

		let inColl = await glf.findMatches({ collectionID: coll.id });
		assert(inColl.matches.length == 1 && inColl.matches[0].file == "Braun-Klein_2001.pdf",
			"collection scope: " + JSON.stringify(inColl.matches.map(m => m.file)));

		let r = await glf.findMatches({ libraryID });
		let got = Object.fromEntries(r.matches.map(m => [m.item.id, m.file]));
		assert(got[b1.id] == "Braun_1999.pdf", "b1 " + got[b1.id]);
		assert(got[bk.id] == "Braun-Klein_2001.pdf", "bk " + got[bk.id]);
		assert(got[ko.id] == "Koenig_1975.pdf", "König " + got[ko.id]);
		assert(!got[b2.id] && r.skipped.some(i => i.id == b2.id), "second Braun 1999 not skipped");

		let { linked } = await glf.linkMatches(r.matches);
		assert(linked == r.matches.length, "linked " + linked);
		let att = Zotero.Items.get(b1.getAttachments())[0];
		assert(await att.getFilePathAsync() == PathUtils.join(base, "Braun_1999.pdf"), "b1 file");
		assert(JSON.stringify(await listDir(base)) == JSON.stringify(before), "shared folder changed");
		return { linked, skipped: r.skipped.length, unmatched: r.unmatched.length };
	});

	await check("files only on Zotero's server (added without plugin) are reported", async () => {
		let st = new Zotero.Item("attachment");
		st.libraryID = libraryID;
		st.parentKey = parent.key;
		st.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
		st.attachmentContentType = "application/pdf";
		st.attachmentPath = "storage:Ohne-Plugin_2020.pdf";
		await st.saveTx();
		st.version = 7;
		await st.saveTx();
		await Zotero.Sync.Data.Local.saveCacheObject("item", libraryID, {
			key: st.key, version: 7, itemType: "attachment",
			md5: "0123456789abcdef0123456789abcdef", filename: "Ohne-Plugin_2020.pdf",
		});
		let s = await glf.getStatus(glf.getConfigByID(cfg.id));
		assert(s.stranded.includes("Ohne-Plugin_2020.pdf"), "stranded " + JSON.stringify(s.stranded));
		let { lines } = await glf.describeStatus();
		return lines;
	});

	await check("emptying the trash keeps the shared file", async () => {
		att.deleted = true;
		await att.saveTx();
		await Zotero.Items.emptyTrash(libraryID);
		assert(!Zotero.Items.get(att.id), "item not erased");
		assert(await IOUtils.exists(sharedPDF), "shared file deleted");
		assert(await md5(sharedPDF) == sharedMD5, "shared file changed");
	});

	let base2 = PathUtils.join(dir, "Projekt-2");
	let cfg2;
	let lib2;
	let shared2;
	await check("second group: own folder, own naming, own file-sync switch", async () => {
		await IOUtils.makeDirectory(base2, { ignoreExisting: true });
		let group2 = new Zotero.Group();
		group2.id = 815;
		group2.name = "Zweites Projekt";
		group2.description = "";
		group2.editable = true;
		group2.filesEditable = true;
		group2.version = 1;
		group2.archived = false;
		await group2.saveTx();
		lib2 = group2.libraryID;
		cfg2 = glf.addConfig({
			groupID: 815,
			basePath: base2,
			naming: { template: "{year}_{authors}", lowercase: false },
		});

		let L = Zotero.Sync.Storage.Local;
		assert(L.getEnabledForLibrary(libraryID) === false, "group 1 file sync on");
		assert(L.getEnabledForLibrary(lib2) === false, "group 2 file sync on");

		// A file already in group 2's folder resolves there, not in group 1's
		shared2 = PathUtils.join(base2, "Mueller - 1987 - Magnetschwebebahn.pdf");
		await IOUtils.copy(sharedPDF, shared2);
		let p0 = new Zotero.Item("book");
		p0.libraryID = lib2;
		p0.setField("title", "Zweites Projekt Buch");
		await p0.saveTx();
		let att2 = await glf.attachSharedFile(p0, shared2);
		assert(await att2.getFilePathAsync() == shared2, "group 2 resolved to " + await att2.getFilePathAsync());

		// New files get group 2's scheme and land in group 2's folder
		let p2 = new Zotero.Item("book");
		p2.libraryID = lib2;
		p2.setField("title", "Weber u. a.");
		p2.setField("date", "2004");
		p2.setCreators(["Weber", "Braun", "Klein"].map(lastName => ({ firstName: "A.", lastName, creatorType: "author" })));
		await p2.saveTx();
		let imported2 = await Zotero.Attachments.importFromFile({
			file: PathUtils.join(fixtures, "scan_0042.pdf"),
			parentItemID: p2.id,
		});
		await glf.publishPending({ force: true });
		assert(imported2.attachmentFilename == "2004_Weber-ua.pdf", "name " + imported2.attachmentFilename);
		assert(await IOUtils.exists(PathUtils.join(base2, "2004_Weber-ua.pdf")), "not in folder 2");
		assert(!(await IOUtils.exists(PathUtils.join(base, "2004_Weber-ua.pdf"))), "landed in folder 1");

		let { lines, statuses } = await glf.describeStatus();
		assert(statuses.length == 2, "status for " + statuses.length + " links");
		return lines;
	});

	await check("menus are in the main window", async () => {
		let doc = Zotero.getMainWindow().document;
		assert(doc.getElementById("glf-itemmenu-attach"), "item menu entry missing");
		assert(doc.getElementById("glf-tools-menu"), "tools menu missing");
		assert(doc.getElementById("glf-tools-link"), "link command missing");
		assert(doc.getElementById("glf-collectionmenu-link"), "collection menu entry missing");
	});

	await check("localization (de or en) resolves", async () => {
		let s = glf.l10n("glf-blocked-title");
		assert(s && s != "glf-blocked-title", "unresolved: " + s);
		return s;
	});

	await check("settings pane registered", async () => {
		let panes = Zotero.PreferencePanes.pluginPanes || [];
		assert(panes.some(p => p.pluginID == glf.id), "pane missing");
	});

	await check("settings pane renders with groups and status", async () => {
		glf.openPreferences();
		let win = await waitFor(() => Services.wm.getMostRecentWindow("zotero:pref"), 15000, "prefs window");
		let doc = win.document;
		let status = await waitFor(() => {
			let el = doc.getElementById("glf-status");
			return el && el.textContent.trim() && el;
		}, 15000, "status text");
		let configs = doc.getElementById("glf-config");
		let entries = [...doc.getElementById("glf-config-popup").children].map(e => e.getAttribute("label"));
		assert(entries.length == 2, "link list: " + JSON.stringify(entries));
		assert(configs.value == cfg.id, "first link not selected");
		let menulist = doc.getElementById("glf-group");
		assert(menulist.value == "4711", "group menulist value " + menulist.value);
		assert(doc.getElementById("glf-base").value == base, "base path not shown");

		// Switch to the second link: the form shows its group, folder and naming
		configs.value = cfg2.id;
		configs.dispatchEvent(new win.Event("command"));
		await waitFor(() => doc.getElementById("glf-base").value == base2, 5000, "second link shown");
		assert(menulist.value == "815", "second group value " + menulist.value);
		assert(doc.getElementById("glf-naming-template").value == "{year}_{authors}", "template");
		assert(doc.getElementById("glf-naming-lowercase").checked === false, "lowercase");
		let preview2 = doc.getElementById("glf-naming-preview").textContent;
		assert(preview2.includes("2004_Weber-ua.pdf"), "preview 2: " + preview2);
		// The first group isn't offered again for the second link
		let offered = [...doc.getElementById("glf-group-popup").children].map(e => e.getAttribute("value"));
		assert(!offered.includes("4711"), "group 1 offered twice");

		configs.value = cfg.id;
		configs.dispatchEvent(new win.Event("command"));
		await waitFor(() => doc.getElementById("glf-base").value == base, 5000, "first link shown");
		await waitFor(() => doc.getElementById("glf-status").textContent.includes("Transrapid"),
			10000, "status of first link");
		win.resizeTo(900, 1080);
		await Zotero.Promise.delay(1000);
		let shot = Services.prefs.getStringPref("glf-harness.screenshot", "");
		if (shot) {
			let canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
			canvas.width = win.innerWidth;
			canvas.height = win.innerHeight;
			canvas.getContext("2d").drawWindow(win, 0, 0, canvas.width, canvas.height, "white");
			let data = canvas.toDataURL("image/png").split(",")[1];
			await IOUtils.write(shot, Uint8Array.from(atob(data), c => c.charCodeAt(0)));
		}
		let preview = doc.getElementById("glf-naming-preview").textContent;
		for (let n of ["mueller_1987.pdf", "mueller_1987a.pdf", "mueller-schmidt_1990.pdf",
			"weber-ua_2004.pdf"]) {
			assert(preview.includes(n), "preview lacks " + n + ": " + preview);
		}
		let text = doc.getElementById("glf-status").textContent;
		win.close();
		return { links: entries, status: text, preview };
	});

	await check("status summary", async () => {
		let { lines } = await glf.describeStatus();
		return lines;
	});

	await check("removing a link hands the group back to Zotero", async () => {
		glf.removeConfig(cfg2.id);
		let L = Zotero.Sync.Storage.Local;
		assert(L.getEnabledForLibrary(lib2) === !!Zotero.Prefs.get("sync.storage.groups.enabled"),
			"group 2 file sync still switched off");
		assert(L.getEnabledForLibrary(libraryID) === false, "group 1 affected");
		let items = await Zotero.Items.getAll(lib2);
		let att = items.find(i => i.isAttachment() && i.attachmentFilename == PathUtils.filename(shared2));
		assert(!(await att.getFilePathAsync()), "group 2 file still redirected");
		assert(await IOUtils.exists(shared2), "file in folder 2 touched");
	});

	// Keep last: disables the plugin
	await check("disabling the plugin restores Zotero's behaviour", async () => {
		let { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
		let addon = await AddonManager.getAddonByID(glf.id);
		await addon.disable();
		await waitFor(() => !Zotero.GroupLinkedFiles, 10000, "shutdown");
		let doc = Zotero.getMainWindow().document;
		assert(!doc.getElementById("glf-itemmenu-attach"), "menu still there");
		assert(Zotero.Sync.Storage.Local.getEnabledForLibrary(libraryID)
			=== !!Zotero.Prefs.get("sync.storage.groups.enabled"), "sync switch still active");
		let copy = Zotero.Items.get(imported.id);
		assert(await copy.getFilePathAsync(), "local file of imported item should still resolve");
		assert(!Object.prototype.hasOwnProperty.call(Zotero.PDFWorker, "rotatePages"),
			"PDFWorker patch left behind");
	});
}
