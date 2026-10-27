import { existsSync, readFileSync } from "node:fs";

export type MissingPath = { line: number; path: string };
export type FindMissingPathsParams = {
	markdown: string;
	exists: (path: string) => boolean;
};

function isRepoPath(value: string): boolean {
	if (
		value.startsWith("apps/") ||
		value.startsWith("packages/") ||
		value.startsWith("tools/") ||
		value.startsWith(".github/")
	) {
		return true;
	}
	if (value.includes("/") || value.includes(" ")) return false;
	return value.startsWith(".") || value.includes(".");
}

function lineAt(markdown: string, index: number): number {
	let line = 1;
	for (let cursor = 0; cursor < index; cursor += 1) {
		if (markdown.charCodeAt(cursor) === 10) line += 1;
	}
	return line;
}

export function findMissingPaths(
	params: FindMissingPathsParams,
): MissingPath[] {
	const findings: MissingPath[] = [];
	const spans = params.markdown.matchAll(/`([^`\n]+)`/g);
	for (const match of spans) {
		const path = match[1];
		if (!path || !isRepoPath(path)) continue;
		if (params.exists(path)) continue;
		findings.push({ line: lineAt(params.markdown, match.index ?? 0), path });
	}
	return findings;
}

export async function main(): Promise<MissingPath[]> {
	const markdown = readFileSync("ARCHITECTURE.md", "utf8");
	return findMissingPaths({
		markdown,
		exists: (path) => existsSync(path),
	});
}
