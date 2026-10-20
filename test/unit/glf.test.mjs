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
		const parent = env.addParent(env.userLibraryID);
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
