import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { type ParserPlugin, parse } from "@babel/parser";

export type CommentFinding = { file: string; line: number; text: string };
export type FindCommentsParams = { file: string; source: string };

const checked = new Set([".ts", ".tsx", ".js", ".mjs", ".css"]);

function pluginsFor(file: string): ParserPlugin[] {
	if (file.endsWith(".tsx")) return ["typescript", "jsx"];
	if (file.endsWith(".ts")) return ["typescript"];
	if (file.endsWith(".jsx") || file.endsWith(".js") || file.endsWith(".mjs"))
		return ["jsx"];
	return [];
}

function findCssComments(file: string, source: string): CommentFinding[] {
	const findings: CommentFinding[] = [];
	let index = 0;
	let line = 1;
	while (index < source.length) {
		const char = source[index];
		if (char === "\n") {
			line += 1;
			index += 1;
			continue;
		}
		if (char === '"' || char === "'") {
			const quote = char;
			index += 1;
			while (index < source.length && source[index] !== quote) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source[index] === "\n") line += 1;
				index += 1;
			}
			index += 1;
			continue;
		}
		if (char === "/" && source[index + 1] === "*") {
			const startLine = line;
			index += 2;
			let text = "";
			while (
				index < source.length &&
				!(source[index] === "*" && source[index + 1] === "/")
			) {
				if (source[index] === "\n") line += 1;
				text += source[index];
				index += 1;
			}
			findings.push({ file, line: startLine, text: text.trim() });
			index += 2;
			continue;
		}
		index += 1;
	}
	return findings;
}

export function findComments(params: FindCommentsParams): CommentFinding[] {
	if (params.file.endsWith(".css"))
		return findCssComments(params.file, params.source);
	const ast = parse(params.source, {
		sourceType: "module",
		plugins: pluginsFor(params.file),
	});
	return (ast.comments ?? []).map((comment) => ({
		file: params.file,
		line: comment.loc?.start.line ?? 1,
		text: comment.value.trim(),
	}));
}

function kept(path: string): boolean {
	if (path.startsWith("migrations/") || path.includes("/migrations/"))
		return false;
	if (path.startsWith("packages/api/src/gen/")) return false;
	const dot = path.lastIndexOf(".");
	if (dot < 0) return false;
	return checked.has(path.slice(dot));
}

function gitFiles(): string[] {
	const output = execFileSync("git", ["ls-files"], { encoding: "utf8" });
	return output.split("\n").filter((path) => path.length > 0);
}

export async function main(staged: string[]): Promise<CommentFinding[]> {
	const paths = (staged.length > 0 ? staged : gitFiles()).filter(kept);
	const findings: CommentFinding[] = [];
	for (const file of paths) {
		if (!existsSync(file)) continue;
		findings.push(
			...findComments({ file, source: readFileSync(file, "utf8") }),
		);
	}
	return findings;
}
