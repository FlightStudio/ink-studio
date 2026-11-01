"use client";

import { keepClearFrame, writingSides } from "@repo/render/html";
import type { PageSpec, ProductKind } from "@repo/types";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

export const KEEP_CLEAR_COPY: Record<
	ProductKind,
	{ name: string; reason: string; issue: string }
> = {
	letter: {
		name: "Postal barcode",
		reason: "Kept clear for the postal barcode",
		issue: "Keep this corner clear for the postal barcode.",
	},
	postcard: {
		name: "Address and postage",
		reason: "Kept clear for the address and postage",
		issue: "Keep this area clear for the address and postage.",
	},
};

const CAPTION_MIN_IN = 1.5;

export type KeepClearGuidesProps = {
	spec: PageSpec;
	sheets: number;
	gapIn: number;
	scale: number;
};

export function KeepClearGuides({
	spec,
	sheets,
	gapIn,
	scale,
}: KeepClearGuidesProps) {
	const sides = writingSides(spec);
	const copy = KEEP_CLEAR_COPY[spec.product];
	return spec.keepClear
		.filter((zone) => sides.includes(zone.side) && zone.side < sheets)
		.map((zone) => {
			const captioned = Math.min(zone.widthIn, zone.heightIn) >= CAPTION_MIN_IN;
			return (
				<Tooltip key={`${zone.side}-${zone.corner}`}>
					<TooltipTrigger
						render={
							<div
								data-keep-clear-guide={zone.corner}
								className="absolute grid cursor-help place-items-center"
								style={keepClearFrame(spec, zone, gapIn)}
							/>
						}
					>
						{captioned ? (
							<span
								className="rounded-full bg-paper/85 px-2.5 py-0.5 text-label whitespace-nowrap text-ink-muted"
								style={{ scale: `${1 / scale}` }}
							>
								{copy.name}
							</span>
						) : null}
					</TooltipTrigger>
					<TooltipContent side="bottom">{copy.reason}</TooltipContent>
				</Tooltip>
			);
		});
}
