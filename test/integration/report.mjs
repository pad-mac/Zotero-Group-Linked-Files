// Print integration results and exit non-zero on any failure.
import { readFileSync, appendFileSync } from "node:fs";

const [resultsPath, logPath] = process.argv.slice(2);
const report = JSON.parse(readFileSync(resultsPath, "utf8"));
const failed = report.results.filter(r => !r.ok);

const lines = [
	`Zotero ${report.zoteroVersion} · plugin ${report.pluginVersion ?? "?"}`,
	"",
	...report.results.map(r => `${r.ok ? "✔" : "✘"} ${r.name}`
		+ (r.ok ? "" : `\n    ${String(r.error).split("\n").slice(0, 6).join("\n    ")}`)),
	"",
	`${report.results.length - failed.length}/${report.results.length} checks passed`,
];
console.log(lines.join("\n"));

if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY,
		"### Zotero integration\n\n```\n" + lines.join("\n") + "\n```\n");
}

if (failed.length) {
	if (logPath) {
		const log = readFileSync(logPath, "utf8").split("\n");
		const relevant = log.filter(l => /Group Linked Files|glf|Error|Exception/i.test(l));
		console.log("\nRelevant Zotero log lines:\n" + relevant.slice(-60).join("\n"));
	}
	process.exit(1);
}
