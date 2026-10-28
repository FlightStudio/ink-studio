"use client";

import { getAssetStatus, requestFontBuild, saveGlyph } from "@repo/api";
import type { DrawnGlyph, EditableFont, Stroke } from "@repo/types";
import { HANDWRITING_GLYPHS, missingChars } from "@repo/types";
import { Button } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toCellUnits } from "../cell-units.ts";
import { FontPreview } from "./font-preview.tsx";
import { GlyphCell } from "./glyph-cell.tsx";

const CELL_PX = 104;

export type GlyphGridProps = { font: EditableFont };

function replaceCell(
	glyphs: readonly DrawnGlyph[],
	glyph: DrawnGlyph,
): DrawnGlyph[] {
	const index = glyphs.findIndex(
		(existing) =>
			existing.char === glyph.char && existing.variant === glyph.variant,
	);
	if (index < 0) return [...glyphs, glyph];
	return glyphs.map((existing, position) =>
		position === index ? glyph : existing,
	);
}

export function GlyphGrid({ font }: GlyphGridProps) {
	const [glyphs, setGlyphs] = useState(font.glyphs);
	const [assetId, setAssetId] = useState(font.assetId);
	const [building, setBuilding] = useState(font.building);
	const [error, setError] = useState<string | null>(null);
	const tails = useRef(new Map<string, Promise<void>>());
	const timer = useRef<ReturnType<typeof setInterval> | null>(null);
	const missing = missingChars(glyphs);

	useEffect(
		() => () => {
			if (timer.current) clearInterval(timer.current);
		},
		[],
	);

	function storedStrokes(char: string): Stroke[] {
		return (
			font.glyphs.find((glyph) => glyph.char === char && glyph.variant === 0)
				?.strokes ?? []
		);
	}

	function persist(char: string, strokes: Stroke[]) {
		const key = `${char}:0`;
		const previous = tails.current.get(key) ?? Promise.resolve();
		const next = previous.then(async () => {
			const saved = await saveGlyph(font.id, {
				char,
				variant: 0,
				strokes: strokes.map((stroke) => ({
					input: stroke.input,
					points: stroke.points.map((point) => [...point]),
				})),
			});
			if (saved.status !== 204) {
				setError("That letter could not be saved.");
			}
		});
		tails.current.set(
			key,
			next.then(
				() => undefined,
				() => undefined,
			),
		);
	}

	function onStrokeEnd(char: string, drawn: Stroke[]) {
		const strokes = [
			...storedStrokes(char),
			...drawn.map((stroke) => toCellUnits(stroke, CELL_PX)),
		];
		setGlyphs((current) => replaceCell(current, { char, variant: 0, strokes }));
		setError(null);
		persist(char, strokes);
	}

	async function build() {
		if (missing.length > 0 || building) return;
		setBuilding(true);
		setError(null);
		const requested = await requestFontBuild(font.id);
		if (requested.status !== 201) {
			setBuilding(false);
			setError("This handwriting could not be built.");
			return;
		}
		const id = requested.data.assetId;
		const tick = async () => {
			const status = await getAssetStatus(id);
			if (status.status === 200 && status.data.status === "done") {
				if (timer.current) clearInterval(timer.current);
				timer.current = null;
				setAssetId(id);
				setBuilding(false);
				return;
			}
			if (status.status !== 200 || status.data.status === "failed") {
				if (timer.current) clearInterval(timer.current);
				timer.current = null;
				setBuilding(false);
				setError("This handwriting could not be built.");
			}
		};
		if (timer.current) clearInterval(timer.current);
		void tick();
		timer.current = setInterval(() => void tick(), 500);
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-ui text-ink-muted">
						{missing.length === 0
							? "Every required letter is drawn."
							: `Still to draw ${missing.join(" ")}`}
					</p>
					{error ? (
						<p className="text-ui" style={{ color: "var(--danger)" }}>
							{error}
						</p>
					) : null}
				</div>
				<Button
					type="button"
					disabled={missing.length > 0 || building}
					onClick={() => void build()}
				>
					{building ? "Building" : "Build"}
				</Button>
			</div>
			<FontPreview fontId={font.id} assetId={assetId} text="hello, world." />
			<ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-4">
				{HANDWRITING_GLYPHS.map((entry) => (
					<li key={entry.char} className="flex flex-col items-center gap-1">
						<GlyphCell
							char={entry.char}
							strokes={storedStrokes(entry.char)}
							cellPx={CELL_PX}
							onStrokeEnd={(drawn) => onStrokeEnd(entry.char, drawn)}
						/>
					</li>
				))}
			</ul>
			<p>
				<Link href="/fonts" className="text-ui text-ink-muted">
					All handwriting
				</Link>
			</p>
		</div>
	);
}
