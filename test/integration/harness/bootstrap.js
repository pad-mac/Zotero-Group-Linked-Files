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
	glf.setPref("groupID", 4711);
	glf.setPref("basePath", base);

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

	await check("emptying the trash keeps the shared file", async () => {
		att.deleted = true;
		await att.saveTx();
		await Zotero.Items.emptyTrash(libraryID);
		assert(!Zotero.Items.get(att.id), "item not erased");
		assert(await IOUtils.exists(sharedPDF), "shared file deleted");
		assert(await md5(sharedPDF) == sharedMD5, "shared file changed");
	});

	await check("menus are in the main window", async () => {
		let doc = Zotero.getMainWindow().document;
		assert(doc.getElementById("glf-itemmenu-attach"), "item menu entry missing");
		assert(doc.getElementById("glf-tools-menu"), "tools menu missing");
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
		let menulist = doc.getElementById("glf-group");
		assert(menulist.value == "4711", "group menulist value " + menulist.value);
		assert(doc.getElementById("glf-base").value == base, "base path not shown");
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
		let text = status.textContent;
		win.close();
		return text;
	});

	await check("status summary", async () => {
		let { lines } = await glf.describeStatus();
		return lines;
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
