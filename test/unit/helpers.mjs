// Minimal fake Zotero environment backed by the real file system, so the plugin's
// actual source (src/glf.js) can be exercised in Node without Zotero.
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/glf.js");

export const LINK_MODE_IMPORTED_FILE = 0;
export const LINK_MODE_LINKED_URL = 3;

export function makeEnv({ groupID = 4711, libraryID = 2, userLibraryID = 1 } = {}) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glf-"));
	const storage = path.join(tmp, "storage");
	const base = path.join(tmp, "HU-Box");
	fs.mkdirSync(storage);
	fs.mkdirSync(base);

	const prefs = new Map();
	const items = new Map();
	const calls = { rotate: 0, deletePages: 0, import: [], indexPDF: [], notices: [] };
	const syncCache = new Map();
	let clock = 0;

	const IOUtils = {
		exists: async p => fs.existsSync(p),
		stat: async (p) => {
			const s = await fsp.stat(p);
			return { size: s.size, lastModified: s.mtimeMs, type: s.isDirectory() ? "directory" : "regular" };
		},
		getChildren: async p => fs.readdirSync(p).map(n => path.join(p, n)),
		copy: async (a, b, opts = {}) => {
			if (opts.noOverwrite && fs.existsSync(b)) {
				throw new Error("exists");
			}
			await fsp.copyFile(a, b);
		},
	};
	const PathUtils = {
		join: (...p) => path.join(...p),
		normalize: p => path.normalize(p).replace(/\/+$/, ""),
		parent: p => path.dirname(p),
		filename: p => path.basename(p),
	};

	class Item {
		constructor(type = "attachment") {
			this.itemType = type;
			this.libraryID = libraryID;
			this.key = crypto.randomBytes(4).toString("hex").toUpperCase();
			this.id = items.size + 1;
			this.attachmentLinkMode = LINK_MODE_IMPORTED_FILE;
			this.attachmentPath = "";
			this.attachmentContentType = "";
			this.parentKey = null;
			this.dateModified = "2000-01-01 00:00:00";
			this.dateAdded = `2000-01-01 00:00:${String(clock++).padStart(2, "0")}`;
			this.fields = {};
			this.creators = [];
			this.parentItemID = null;
			this.version = 0;
			this.deleted = false;
			this.itemTypeID = 1;
			this._identified = true;
		}
		get parentKey() { return this._parentKey || null; }
		set parentKey(k) {
			this._parentKey = k;
			const parent = [...items.values()].find(i => i.key == k);
			this.parentItemID = parent ? parent.id : null;
		}
		getCreators() { return this.creators; }
		getAttachments() {
			return [...items.values()].filter(i => i.parentItemID == this.id && i.isAttachment()).map(i => i.id);
		}
		isFileAttachment() { return this.isAttachment() && this.attachmentLinkMode != LINK_MODE_LINKED_URL; }
		get libraryKey() { return `${this.libraryID}/${this.key}`; }
		get attachmentFilename() { return this.attachmentPath.replace(/^storage:/, ""); }
		isAttachment() { return this.itemType == "attachment"; }
		isRegularItem() { return this.itemType != "attachment" && this.itemType != "note"; }
		isStoredFileAttachment() { return this.isAttachment() && this.attachmentLinkMode == LINK_MODE_IMPORTED_FILE; }
		isEmbeddedImageAttachment() { return false; }
		setField(k, v) { this.fields[k] = v; }
		getField(k) { return this.fields[k] ?? ""; }
		async saveTx() { items.set(this.id, this); return this.id; }
		_updateAttachmentStates(v) { this._fileExists = v; }
		// --- simplified copies of Zotero's own behaviour
		getFilePath() {
			if (!this.isStoredFileAttachment() || !this.attachmentPath) return false;
			return path.join(storage, this.key, this.attachmentFilename);
		}
		async getFilePathAsync() {
			const p = Item.prototype.__origGetFilePath.call(this);
			if (!p || !fs.existsSync(p)) { this._updateAttachmentStates(false); return false; }
			return p;
		}
		async renameAttachmentFile(newName) {
			const orig = await this.getFilePathAsync();
			if (!orig) return false;
			await fsp.rename(orig, path.join(path.dirname(orig), newName));
			this.attachmentPath = "storage:" + newName;
			return true;
		}
		async deleteAttachmentFile() {
			const p = await this.getFilePathAsync();
			if (!p) return false;
			await fsp.rm(p);
			return true;
		}
	}
	Item.prototype.__origGetFilePath = Item.prototype.getFilePath;

	const Local = { getEnabledForLibrary: () => true };
	const Fulltext = {
		indexPDF: async (filePath, itemID) => {
			calls.indexPDF.push(filePath);
			fs.writeFileSync(path.join(path.dirname(filePath), ".zotero-ft-cache"), "text");
			return true;
		},
	};
	const PDFWorker = {
		rotatePages: async () => { calls.rotate++; return 1; },
		deletePages: async () => { calls.deletePages++; return 1; },
		import: async (itemID, isPriority, password, transfer) => { calls.import.push(transfer); return true; },
	};

	const Zotero = {
		isMac: false,
		isWin: false,
		version: "10.0.0",
		debug: () => {},
		logError: (e) => { calls.errors = (calls.errors || []).concat(String(e)); },
		Prefs: {
			get: k => prefs.get(k),
			set: (k, v) => prefs.set(k, v),
		},
		Groups: {
			getLibraryIDFromGroupID: id => (id == groupID ? libraryID : false),
			get: id => (id == groupID ? { name: "Testgruppe" } : null),
		},
		Libraries: { userLibraryID, get: () => ({ waitForDataLoad: async () => {} }) },
		Items: {
			get: id => (Array.isArray(id) ? id.map(i => items.get(i)) : items.get(id)),
			getAsync: async id => items.get(id),
			getAll: async lib => [...items.values()].filter(i => i.libraryID == lib),
		},
		Item,
		Attachments: {
			LINK_MODE_IMPORTED_FILE,
			getStorageDirectory: item => ({ path: path.join(storage, item.key) }),
		},
		File: {
			pathToFile: p => ({ exists: () => fs.existsSync(p) }),
			getValidFileName: n => n.replace(/[/\\?%*:|"<>]/g, ""),
			createDirectoryIfMissingAsync: async p => fs.mkdirSync(p, { recursive: true }),
		},
		Date: {
			sqlToDate: s => new Date(s.replace(" ", "T") + "Z"),
			multipartToSQL: s => s,
		},
		CreatorTypes: {
			getPrimaryIDForType: () => 1,
			getID: name => (name == "editor" ? 2 : 1),
		},
		Collections: { get: () => null },
		Utilities: {
			Internal: {
				md5Async: async p => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex"),
			},
		},
		MIME: { getMIMETypeFromFile: async () => "application/octet-stream" },
		Sync: {
			Storage: { Local },
			Data: { Local: { getCacheObject: async (type, lib, key) => syncCache.get(key) || false } },
		},
		Fulltext,
		PDFWorker,
		ProgressWindow: class {
			changeHeadline(t) { this.t = t; }
			addDescription(d) { calls.notices.push(d); }
			show() {}
			startCloseTimer() {}
		},
	};

	const timers = {
		setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
	};

	const context = vm.createContext({ Zotero, IOUtils, PathUtils, console, Date, Promise });
	vm.runInContext(fs.readFileSync(SRC, "utf8"), context, { filename: SRC });
	const glf = context.GroupLinkedFiles;
	glf.init({ id: "test@glf", version: "0.0.0", rootURI: "file:///", timers });
	glf.l10n = id => id;
	glf._active = true;
	glf.installPatches();

	prefs.set("extensions.group-linked-files.groupID", groupID);
	prefs.set("extensions.group-linked-files.basePath", base);
	prefs.set("extensions.group-linked-files.publishDelaySeconds", 0);
	for (const line of fs.readFileSync(path.join(path.dirname(SRC), "../prefs.js"), "utf8").split("\n")) {
		const m = line.match(/^pref\("([^"]+)",\s*(.+)\);/);
		if (m && m[1].includes(".naming.")) {
			prefs.set(m[1], JSON.parse(m[2]));
		}
	}

	function addAttachment(name, { lib = libraryID, local = null, shared = null, parent = null } = {}) {
		const item = new Item("attachment");
		item.libraryID = lib;
		if (parent) {
			item.parentKey = parent.key;
		}
		item.attachmentPath = "storage:" + name;
		items.set(item.id, item);
		if (local != null) {
			fs.mkdirSync(path.join(storage, item.key), { recursive: true });
			fs.writeFileSync(path.join(storage, item.key, name), local);
		}
		if (shared != null) {
			fs.writeFileSync(path.join(base, name), shared);
		}
		return item;
	}

	function addParent({ lib = libraryID, authors = [], editors = [], year = "" } = {}) {
		const item = new Item("book");
		item.libraryID = lib;
		item.creators = [
			...authors.map(lastName => ({ lastName, firstName: "X", creatorTypeID: 1 })),
			...editors.map(lastName => ({ lastName, firstName: "X", creatorTypeID: 2 })),
		];
		item.fields.date = year ? `${year}-00-00` : "";
		item.fields.title = `${authors.join("/")} ${year}`;
		items.set(item.id, item);
		return item;
	}

	const listBase = () => fs.readdirSync(base).sort();
	const readBase = n => fs.readFileSync(path.join(base, n), "utf8");

	return {
		glf, Zotero, Item, Local, Fulltext, PDFWorker, calls, prefs, items, syncCache,
		tmp, storage, base, groupID, libraryID, userLibraryID,
		addAttachment, addParent, listBase, readBase,
		cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
	};
}
