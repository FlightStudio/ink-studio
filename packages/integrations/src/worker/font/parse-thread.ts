import { parentPort } from "node:worker_threads";
import { HANDWRITING_GLYPHS } from "@repo/types";
import opentype from "opentype.js";
import { buildFont, type Contour, type GlyphOutline } from "./opentype-font.ts";

const COMMANDS_PER_GLYPH = 2_000;
const COMMANDS_IN_TOTAL = 200_000;
const LOWERCASE = [..."abcdefghijklmnopqrstuvwxyz"];

type Request = { familyName: string; bytes: Uint8Array };
type Reply =
	| { ok: true; bytes: Uint8Array; chars: string }
	| { ok: false; code: "font_unreadable" | "font_missing_glyphs" };

function scale(value: number, factor: number): number {
	return Math.round(value * factor);
}

function contoursOf(
	commands: opentype.PathCommand[],
	factor: number,
): Contour[] {
	const contours: Contour[] = [];
	let current: Contour = [];
	const push = () => {
		if (current.length > 0) contours.push(current);
		current = [];
	};
	for (const command of commands) {
		if (command.type === "Z") {
			push();
			continue;
		}
		if (command.type === "M") {
			push();
			current = [["M", scale(command.x, factor), scale(command.y, factor)]];
			continue;
		}
		if (command.type === "L") {
			current.push(["L", scale(command.x, factor), scale(command.y, factor)]);
			continue;
		}
		if (command.type === "Q") {
			current.push([
				"Q",
				scale(command.x1, factor),
				scale(command.y1, factor),
				scale(command.x, factor),
				scale(command.y, factor),
			]);
			continue;
		}
		current.push([
			"C",
			scale(command.x1, factor),
			scale(command.y1, factor),
			scale(command.x2, factor),
			scale(command.y2, factor),
			scale(command.x, factor),
			scale(command.y, factor),
		]);
	}
	push();
	return contours;
}

function rebuild(request: Request): { bytes: Uint8Array; chars: string } {
	let font: opentype.Font;
	try {
		const bytes = request.bytes;
		font = opentype.parse(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);
	} catch {
		throw new Error("font_unreadable");
	}
	const units = font.unitsPerEm || 1000;
	const factor = 1000 / units;
	for (const char of LOWERCASE) {
		if (font.charToGlyphIndex(char) === 0)
			throw new Error("font_missing_glyphs");
	}
	const glyphs: GlyphOutline[] = [];
	const chars: string[] = [];
	let commands = 0;
	for (const entry of HANDWRITING_GLYPHS) {
		if (font.charToGlyphIndex(entry.char) === 0) continue;
		const glyph = font.charToGlyph(entry.char);
		const path = glyph.path.commands;
		commands += path.length;
		if (path.length > COMMANDS_PER_GLYPH || commands > COMMANDS_IN_TOTAL) {
			throw new Error("font_unreadable");
		}
		glyphs.push({
			char: entry.char,
			variant: 0,
			advanceWidth: scale(glyph.advanceWidth ?? units / 2, factor),
			contours: contoursOf(path, factor),
		});
		chars.push(entry.char);
	}
	return {
		bytes: buildFont({
			familyName: request.familyName,
			ascender: scale(font.ascender, factor),
			descender: scale(font.descender, factor),
			glyphs,
		}),
		chars: chars.join(""),
	};
}

parentPort?.on("message", (request: Request) => {
	try {
		const built = rebuild(request);
		parentPort?.postMessage({
			ok: true,
			bytes: built.bytes,
			chars: built.chars,
		} satisfies Reply);
	} catch (error) {
		const code = error instanceof Error ? error.message : "";
		parentPort?.postMessage({
			ok: false,
			code: code === "font_missing_glyphs" ? code : "font_unreadable",
		} satisfies Reply);
	}
});
