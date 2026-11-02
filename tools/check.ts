import { dirname, resolve } from "node:path";
import { chdir } from "node:process";
import { fileURLToPath } from "node:url";
import { main as checkArchitecture } from "./check-architecture.ts";
import { main as checkComments } from "./check-comments.ts";

chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const staged = process.argv.slice(2);
const comments = await checkComments(staged);
const architecture = staged.length === 0 ? await checkArchitecture() : [];

for (const finding of comments) {
	console.error(`${finding.file}:${finding.line}: ${finding.text}`);
}
for (const finding of architecture) {
	console.error(`ARCHITECTURE.md:${finding.line}: ${finding.path}`);
}

if (comments.length > 0 || architecture.length > 0) process.exit(1);
