import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeEnv } from "./helpers.mjs";

// Results created inside the vm context are from another realm; compare as plain data
const same = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

let env;
afterEach(() => env && env.cleanup());

describe("path redirect", () => {
	test("missing local file resolves to the shared folder", async () => {
		env = makeEnv();
		const item = env.addAttachment("Müller 1987.pdf", { shared: "S" });
		assert.equal(await item.getFilePathAsync(), path.join(env.base, "Müller 1987.pdf"));
		assert.equal(item.getFilePath(), path.join(env.base, "Müller 1987.pdf"));
		assert.equal(item._fileExists, true);
	});

	test("a local copy in Zotero storage is preferred", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { local: "L", shared: "S" });
		assert.equal(await item.getFilePathAsync(), path.join(env.storage, item.key, "a.pdf"));
		assert.equal(item.getFilePath(), path.join(env.storage, item.key, "a.pdf"));
	});

	test("nothing changes outside the configured group", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { lib: env.userLibraryID, shared: "S" });
		assert.equal(await item.getFilePathAsync(), false);
	});

	test("missing everywhere stays missing", async () => {
		env = makeEnv();
		const item = env.addAttachment("gone.pdf");
		assert.equal(await item.getFilePathAsync(), false);
	});

	test("no redirect without a shared folder set", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { shared: "S" });
		env.prefs.set("extensions.group-linked-files.basePath", "");
		assert.equal(await item.getFilePathAsync(), false);
	});

	test("filenames with path parts or .zotero prefix are never resolved", async () => {
		env = makeEnv();
		for (const bad of ["../x.pdf", "sub/x.pdf", ".zotero-ft-cache"]) {
			const item = env.addAttachment("ok.pdf");
			item.attachmentPath = "storage:" + bad;
			assert.equal(env.glf.getSharedPath(item), null, bad);
		}
	});
});

describe("guardrails", () => {
	test("rename of a shared file is blocked and nothing on disk changes", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { shared: "S" });
		assert.equal(await item.renameAttachmentFile("b.pdf"), -2);
		assert.deepEqual(env.listBase(), ["a.pdf"]);
		assert.equal(item.attachmentFilename, "a.pdf");
		assert.equal(env.calls.notices.length, 1);
	});

	test("rename is blocked even when a local copy exists, once published", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { local: "S", shared: "S" });
		assert.equal(await item.renameAttachmentFile("b.pdf"), -2);
		assert.equal(item.attachmentFilename, "a.pdf");
	});

	test("rename of a not-yet-published local file is allowed", async () => {
		env = makeEnv();
		const item = env.addAttachment("new.pdf", { local: "L" });
		assert.equal(await item.renameAttachmentFile("Author 2020.pdf"), true);
		assert.equal(item.attachmentFilename, "Author 2020.pdf");
		assert.deepEqual(env.listBase(), []);
	});

	test("deleting the file of a shared attachment is blocked", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { shared: "S" });
		assert.equal(await item.deleteAttachmentFile(), false);
		assert.deepEqual(env.listBase(), ["a.pdf"]);
	});

	test("rotate/delete pages and annotation transfer are blocked for group files", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { shared: "S" });
		await env.Zotero.PDFWorker.rotatePages(item.id, [0], 90);
		await env.Zotero.PDFWorker.deletePages(item.id, [0]);
		await env.Zotero.PDFWorker.import(item.id, false, null, true);
		assert.equal(env.calls.rotate, 0);
		assert.equal(env.calls.deletePages, 0);
		assert.deepEqual(env.calls.import, []);
		// Plain (read-only) import of external annotations still works
		await env.Zotero.PDFWorker.import(item.id, false, null, false);
		assert.deepEqual(env.calls.import, [false]);
	});

	test("guardrails don't touch other libraries", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { lib: env.userLibraryID, local: "L" });
		await env.Zotero.PDFWorker.rotatePages(item.id, [0], 90);
		assert.equal(env.calls.rotate, 1);
		assert.equal(await item.renameAttachmentFile("b.pdf"), true);
	});
});

describe("file sync switch", () => {
	test("off for the group, untouched for everything else", () => {
		env = makeEnv();
		assert.equal(env.Local.getEnabledForLibrary(env.libraryID), false);
		assert.equal(env.Local.getEnabledForLibrary(env.userLibraryID), true);
		assert.equal(env.Local.getEnabledForLibrary(99), true);
	});

	test("stays off even if this computer has no shared folder set", () => {
		env = makeEnv();
		env.prefs.set("extensions.group-linked-files.basePath", "");
		assert.equal(env.Local.getEnabledForLibrary(env.libraryID), false);
	});
});

describe("full-text cache", () => {
	test("is written to Zotero storage, never the shared folder", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { shared: "S" });
		const resolved = await item.getFilePathAsync();
		await env.Zotero.Fulltext.indexPDF(resolved, item.id);
		assert.deepEqual(env.listBase(), ["a.pdf"]);
		assert.equal(env.calls.indexPDF[0], path.join(env.storage, item.key, "a.pdf"));
		assert.ok(fs.existsSync(path.join(env.storage, item.key, ".zotero-ft-cache")));
	});
});

describe("publishing new files", () => {
	test("copies files added in Zotero into the shared folder", async () => {
		env = makeEnv();
		env.addAttachment("new.pdf", { local: "NEW" });
		const r = await env.glf.publishPending();
		same(r.published, ["new.pdf"]);
		assert.equal(env.readBase("new.pdf"), "NEW");
	});

	test("does nothing for identical files already in the folder", async () => {
		env = makeEnv();
		env.addAttachment("same.pdf", { local: "X", shared: "X" });
		const r = await env.glf.publishPending();
		same(r.published, []);
		same(r.renamed, []);
	});

	test("never overwrites: a different file with the same name gets a unique name", async () => {
		env = makeEnv();
		const item = env.addAttachment("dup.pdf", { local: "MINE", shared: "THEIRS" });
		const r = await env.glf.publishPending();
		same(r.renamed, [{ from: "dup.pdf", to: "dup (2).pdf" }]);
		assert.equal(env.readBase("dup.pdf"), "THEIRS");
		assert.equal(env.readBase("dup (2).pdf"), "MINE");
		assert.equal(item.attachmentFilename, "dup (2).pdf");
	});

	test("waits for recently changed attachments", async () => {
		env = makeEnv();
		env.prefs.set("extensions.group-linked-files.publishDelaySeconds", 60);
		env.addAttachment("fresh.pdf", { local: "F" });
		const r = await env.glf.publishPending();
		assert.equal(r.waiting, 1);
		assert.deepEqual(env.listBase(), []);
		const forced = await env.glf.publishPending({ force: true });
		same(forced.published, ["fresh.pdf"]);
	});

	test("does nothing when the shared folder is missing", async () => {
		env = makeEnv();
		env.addAttachment("x.pdf", { local: "X" });
		env.prefs.set("extensions.group-linked-files.basePath", path.join(env.tmp, "nope"));
		const r = await env.glf.publishPending();
		assert.equal(r.baseMissing, true);
		assert.ok(!fs.existsSync(path.join(env.tmp, "nope")));
	});

	test("ignores other libraries", async () => {
		env = makeEnv();
		env.addAttachment("mine.pdf", { lib: env.userLibraryID, local: "M" });
		await env.glf.publishPending();
		assert.deepEqual(env.listBase(), []);
	});
});

describe("attach from shared folder", () => {
	test("creates a stored attachment that points to the shared file", async () => {
		env = makeEnv();
		fs.writeFileSync(path.join(env.base, "Weber 1919.pdf"), "W");
		const parent = env.addParent();
		const att = await env.glf.attachSharedFile(parent, path.join(env.base, "Weber 1919.pdf"));
		assert.equal(att.parentKey, parent.key);
		assert.equal(att.attachmentPath, "storage:Weber 1919.pdf");
		assert.equal(att.attachmentContentType, "application/pdf");
		assert.equal(await att.getFilePathAsync(), path.join(env.base, "Weber 1919.pdf"));
		// nothing was copied anywhere
		assert.ok(!fs.existsSync(path.join(env.storage, att.key)));
	});

	test("rejects files outside the folder, in subfolders, or with unusable names", async () => {
		env = makeEnv();
		const parent = env.addParent();
		fs.mkdirSync(path.join(env.base, "sub"));
		fs.writeFileSync(path.join(env.base, "sub", "x.pdf"), "x");
		fs.writeFileSync(path.join(env.tmp, "y.pdf"), "y");
		fs.writeFileSync(path.join(env.base, "what?.pdf"), "z");
		await assert.rejects(env.glf.attachSharedFile(parent, path.join(env.base, "sub", "x.pdf")),
			{ l10nId: "glf-error-not-in-folder" });
		await assert.rejects(env.glf.attachSharedFile(parent, path.join(env.tmp, "y.pdf")),
			{ l10nId: "glf-error-not-in-folder" });
		await assert.rejects(env.glf.attachSharedFile(parent, path.join(env.base, "what?.pdf")),
			{ l10nId: "glf-error-invalid-name" });
	});

	test("only works in the configured group", async () => {
		env = makeEnv();
		fs.writeFileSync(path.join(env.base, "a.pdf"), "a");
		const parent = env.addParent({ lib: env.userLibraryID });
		await assert.rejects(env.glf.attachSharedFile(parent, path.join(env.base, "a.pdf")),
			{ l10nId: "glf-error-not-group" });
	});
});

describe("shutdown", () => {
	test("restores every patched function", async () => {
		env = makeEnv();
		const item = env.addAttachment("a.pdf", { shared: "S" });
		env.glf._active = false;
		env.glf.removePatches();
		assert.equal(await item.getFilePathAsync(), false);
		assert.equal(env.Local.getEnabledForLibrary(env.libraryID), true);
		assert.ok(!Object.prototype.hasOwnProperty.call(env.Zotero.PDFWorker, "rotatePages")
			|| env.Zotero.PDFWorker.rotatePages.toString().includes("calls.rotate"));
	});
});

describe("umlauts in filenames", () => {
	test("finds a file stored in the other Unicode form (macOS vs. Windows)", async () => {
		env = makeEnv();
		const nfc = "Müller_1987.pdf".normalize("NFC");
		const nfd = nfc.normalize("NFD");
		const item = env.addAttachment(nfc);
		fs.writeFileSync(path.join(env.base, nfd), "S");
		assert.equal(await item.getFilePathAsync(), path.join(env.base, nfd));
		assert.equal(item.getFilePath(), path.join(env.base, nfd));
		assert.equal(await env.glf.isPublished(item), true);
	});
});

describe("naming scheme", () => {
	const fmt = (lastNames, year, extra = {}) => {
		env = env || makeEnv();
		const s = { ...env.glf.getNamingSettings(), ...extra };
		return env.glf.formatBaseName({ lastNames, year, title: "Ein Titel über Magnetbahnen" }, s);
	};

	test("default: name_jahr, a-b_jahr, a-ua_jahr; umlauts replaced, lowercase", () => {
		env = makeEnv();
		assert.equal(fmt(["Müller"], "1987"), "mueller_1987");
		assert.equal(fmt(["Müller", "Schmidt"], "1990"), "mueller-schmidt_1990");
		assert.equal(fmt(["Weber", "Braun", "Klein"], "2004"), "weber-ua_2004");
		assert.equal(fmt(["Groß", "Öztürk"], "2001"), "gross-oeztuerk_2001");
		assert.equal(fmt(["Élise"], "1999"), "elise_1999");
		assert.equal(fmt(["Müller".normalize("NFD")], "1987"), "mueller_1987");
	});

	test("umlaut replacement and lowercase can be switched off", () => {
		env = makeEnv();
		assert.equal(fmt(["Müller"], "1987", { transliterate: false, lowercase: false }), "Müller_1987");
		assert.equal(fmt(["Müller"], "1987", { transliterate: false }), "müller_1987");
		assert.equal(fmt(["Müller"], "1987", { lowercase: false }), "Mueller_1987");
	});

	test("missing year or author, unsafe characters", () => {
		env = makeEnv();
		assert.equal(fmt(["Fischer"], ""), "fischer_oj");
		assert.equal(fmt([], "2001"), "oa_2001");
		assert.equal(fmt(["Mül/ler:"], "1987"), "mueller_1987");
		assert.equal(fmt(["von der Heide"], "1990"), "von der heide_1990");
	});

	test("is configurable", () => {
		env = makeEnv();
		assert.equal(fmt(["A", "B", "C"], "2000", { maxAuthors: 3, authorSeparator: "_" }), "a_b_c_2000");
		assert.equal(fmt(["A", "B", "C"], "2000", { etAl: "et al", template: "{year} {authors}" }),
			"2000 a-et al");
		assert.equal(fmt(["A"], "2000", { template: "{authors} {year} - {title}" }),
			"a 2000 - ein titel ueber magnetbahnen");
	});

	test("matchKey ignores case, umlaut spelling and Unicode form", () => {
		env = makeEnv();
		const k = s => env.glf.matchKey(s);
		assert.equal(k("Müller_1987"), k("mueller_1987"));
		assert.equal(k("Müller_1987".normalize("NFD")), k("MUELLER_1987"));
		assert.equal(k("Groß_2000"), k("gross_2000"));
		assert.equal(k("Élise_1999"), k("elise_1999"));
	});
});

describe("new files get the scheme name", () => {
	test("renamed before copying; same author and year gets a, b", async () => {
		env = makeEnv();
		const p1 = env.addParent({ authors: ["Müller"], year: "1987" });
		const p2 = env.addParent({ authors: ["Müller"], year: "1987" });
		const p3 = env.addParent({ authors: ["Müller"], year: "1987" });
		const p4 = env.addParent({ authors: ["Weber", "Braun", "Klein"], year: "2004" });
		const a1 = env.addAttachment("scan1.pdf", { local: "1", parent: p1 });
		const a2 = env.addAttachment("scan2.pdf", { local: "2", parent: p2 });
		const a3 = env.addAttachment("scan3.pdf", { local: "3", parent: p3 });
		const a4 = env.addAttachment("x.pdf", { local: "4", parent: p4 });
		await env.glf.publishPending();
		assert.equal(a1.attachmentFilename, "mueller_1987.pdf");
		assert.equal(a2.attachmentFilename, "mueller_1987a.pdf");
		assert.equal(a3.attachmentFilename, "mueller_1987b.pdf");
		assert.equal(a4.attachmentFilename, "weber-ua_2004.pdf");
		assert.deepEqual(env.listBase(),
			["mueller_1987.pdf", "mueller_1987a.pdf", "mueller_1987b.pdf", "weber-ua_2004.pdf"]);
		assert.equal(env.readBase("mueller_1987a.pdf"), "2");
	});

	test("an existing shared file with that name (any spelling) means the next letter", async () => {
		env = makeEnv();
		fs.writeFileSync(path.join(env.base, "Mueller_1987.pdf"), "OLD");
		const p = env.addParent({ authors: ["Müller"], year: "1987" });
		const a = env.addAttachment("new.pdf", { local: "NEW", parent: p });
		await env.glf.publishPending();
		assert.equal(a.attachmentFilename, "mueller_1987a.pdf");
		assert.equal(env.readBase("Mueller_1987.pdf"), "OLD");
	});

	test("attachments already named by the scheme are left alone", async () => {
		env = makeEnv();
		const p = env.addParent({ authors: ["Müller"], year: "1987" });
		const a = env.addAttachment("Müller_1987.pdf", { local: "X", shared: "X", parent: p });
		const r = await env.glf.publishPending();
		same(r.renamed, []);
		assert.equal(a.attachmentFilename, "Müller_1987.pdf");
	});

	test("editors are used when there are no authors", async () => {
		env = makeEnv();
		const p = env.addParent({ editors: ["Hrsg"], year: "2010" });
		const a = env.addAttachment("x.pdf", { local: "X", parent: p });
		await env.glf.publishPending();
		assert.equal(a.attachmentFilename, "hrsg_2010.pdf");
	});

	test("can be switched off", async () => {
		env = makeEnv();
		env.prefs.set("extensions.group-linked-files.naming.enabled", false);
		const p = env.addParent({ authors: ["Müller"], year: "1987" });
		const a = env.addAttachment("Original Name.pdf", { local: "X", parent: p });
		await env.glf.publishPending();
		assert.equal(a.attachmentFilename, "Original Name.pdf");
		assert.deepEqual(env.listBase(), ["Original Name.pdf"]);
	});
});

describe("link matching files", () => {
	test("links by scheme name; first item per name wins; others skipped", async () => {
		env = makeEnv();
		for (const n of ["Müller_1987.pdf", "Mueller-Schmidt_1990.pdf", "Weber-ua_2004.pdf",
			"Koenig_1975.pdf", "Müller_1987a.pdf", "Unrelated.pdf"]) {
			fs.writeFileSync(path.join(env.base, n), n);
		}
		const m1 = env.addParent({ authors: ["Müller"], year: "1987" });
		const m2 = env.addParent({ authors: ["Müller"], year: "1987" });
		const ms = env.addParent({ authors: ["Müller", "Schmidt"], year: "1990" });
		const w = env.addParent({ authors: ["Weber", "Braun", "Klein"], year: "2004" });
		const k = env.addParent({ authors: ["König"], year: "1975" });
		const none = env.addParent({ authors: ["Niemand"], year: "1950" });
		const r = await env.glf.findMatches();
		const got = Object.fromEntries(r.matches.map(m => [m.item.id, m.file]));
		assert.deepEqual(got, {
			[m1.id]: "Müller_1987.pdf",
			[ms.id]: "Mueller-Schmidt_1990.pdf",
			[w.id]: "Weber-ua_2004.pdf",
			[k.id]: "Koenig_1975.pdf",
		});
		same(r.skipped.map(i => i.id), [m2.id]);
		same(r.unmatched.map(i => i.id), [none.id]);

		const { linked } = await env.glf.linkMatches(r.matches);
		assert.equal(linked, 4);
		const att = env.Zotero.Items.get(m1.getAttachments())[0];
		assert.equal(await att.getFilePathAsync(), path.join(env.base, "Müller_1987.pdf"));
		// Nothing in the folder was renamed, moved or added
		assert.equal(env.listBase().length, 6);
	});

	test("items that already have a file and files already linked are ignored", async () => {
		env = makeEnv();
		fs.writeFileSync(path.join(env.base, "Müller_1987.pdf"), "x");
		const p = env.addParent({ authors: ["Müller"], year: "1987" });
		env.addAttachment("Müller_1987.pdf", { parent: p });
		const other = env.addParent({ authors: ["Müller"], year: "1987" });
		const r = await env.glf.findMatches();
		assert.equal(r.matches.length, 0);
		same(r.unmatched.map(i => i.id), [other.id]);
	});
});

describe("stranded files", () => {
	test("attachments whose file is only on Zotero's server are reported", async () => {
		env = makeEnv();
		const stranded = env.addAttachment("ohne-plugin.pdf");
		stranded.version = 12;
		env.syncCache.set(stranded.key, { key: stranded.key, version: 12, data: { md5: "abc" } });
		env.addAttachment("einfach-weg.pdf");
		env.addAttachment("ok.pdf", { shared: "x" });
		const s = await env.glf.getStatus();
		assert.equal(s.total, 3);
		assert.equal(s.found, 1);
		same(s.missing.sort(), ["einfach-weg.pdf", "ohne-plugin.pdf"]);
		same(s.stranded, ["ohne-plugin.pdf"]);
	});
});
