"use client";

import type { DrawnGlyph } from "@repo/types";
import { CELL } from "@repo/types";
import { Fragment, useMemo } from "react";
import { SPECIMEN_TEXT, specimenWords } from "../specimen.ts";
import { STOCK_FAMILY, StockFace } from "./stock-face.tsx";

const BELOW_BASELINE_EM = (CELL.size - CELL.baseline) / CELL.size;

export type StrokeSpecimenProps = { glyphs: readonly DrawnGlyph[] };

export function StrokeSpecimen({ glyphs }: StrokeSpecimenProps) {
	const words = useMemo(() => specimenWords(SPECIMEN_TEXT, glyphs), [glyphs]);
	const undrawn = words.some((word) =>
		word.some((glyph) => glyph.kind === "stock"),
	);
	return (
		<figure data-specimen="" className="flex min-w-0 flex-col gap-1">
			<StockFace />
			<p className="sr-only">{SPECIMEN_TEXT}</p>
			<p
				aria-hidden
				className="text-[1.75rem] leading-[1.25] text-ink sm:text-[2.125rem]"
				style={{ fontFamily: `"${STOCK_FAMILY}", cursive` }}
			>
				{words.map((word, index) => (
					<Fragment key={index}>
						{index > 0 ? " " : null}
						<span className="whitespace-nowrap">
							{word.map((glyph, position) =>
								glyph.kind === "ink" ? (
									<svg
										key={position}
										aria-hidden
										data-drawn={glyph.char}
										viewBox={`${glyph.left} 0 ${glyph.advance} ${CELL.size}`}
										fill="currentColor"
										className="inline-block h-[1em] overflow-visible"
										style={{
											width: `${glyph.advance / CELL.size}em`,
											verticalAlign: `-${BELOW_BASELINE_EM}em`,
										}}
									>
										{glyph.paths.map((d, stroke) => (
											<path key={stroke} d={d} />
										))}
									</svg>
								) : (
									<span
										key={position}
										data-undrawn={glyph.char}
										className="text-ink-muted/45"
									>
										{glyph.char}
									</span>
								),
							)}
						</span>
					</Fragment>
				))}
			</p>
			<figcaption className="text-label text-ink-muted">
				{undrawn
					? "Your letters write this line as you draw them. Grey letters aren't drawn yet."
					: "Every letter here is yours."}
			</figcaption>
		</figure>
	);
}
