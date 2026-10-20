// Build the .xpi and update.json into ./build
// Usage: node scripts/build.mjs [--version 0.1.1]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const versionArg = process.argv.indexOf("--version");
if (versionArg > -1) {
	manifest.version = process.argv[versionArg + 1].replace(/^v/, "");
}
const version = manifest.version;
const addonID = manifest.applications.zotero.id;
const repo = process.env.GITHUB_REPOSITORY || "pad-mac/Zotero-Group-Linked-Files";

const FILES = ["bootstrap.js", "prefs.js", "src", "content", "locale"];

const buildDir = join(root, "build");
const stage = join(buildDir, "stage");
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of FILES) {
	cpSync(join(root, f), join(stage, f), { recursive: true });
}
writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const xpiName = `group-linked-files-${version}.xpi`;
const xpiPath = join(buildDir, xpiName);
execFileSync("zip", ["-r", "-X", "-q", xpiPath, "."], { cwd: stage });
rmSync(stage, { recursive: true, force: true });

const hash = createHash("sha256").update(readFileSync(xpiPath)).digest("hex");
const update = {
	addons: {
		[addonID]: {
			updates: [
				{
					version,
					update_link: `https://github.com/${repo}/releases/download/v${version}/${xpiName}`,
					update_hash: `sha256:${hash}`,
					applications: {
						zotero: {
							strict_min_version: manifest.applications.zotero.strict_min_version,
							strict_max_version: manifest.applications.zotero.strict_max_version,
						},
					},
				},
			],
		},
	},
};
writeFileSync(join(buildDir, "update.json"), JSON.stringify(update, null, 2) + "\n");
console.log(`Built ${xpiPath}\nsha256 ${hash}`);
