import { HANDWRITING_GLYPHS, HANDWRITING_TEMPLATE } from "@repo/types";
import { glyphLabel } from "../glyph-sections.ts";

const { page, marker, grid, label, printColors } = HANDWRITING_TEMPLATE;

const GUIDES = [
	{ at: 0.2, color: printColors.guide },
	{ at: 0.45, color: printColors.guide },
	{ at: 0.7, color: printColors.border, baseline: true },
	{ at: 0.9, color: printColors.guide },
] as const;

function Marker({
	xIn,
	yIn,
	notch = false,
}: {
	xIn: number;
	yIn: number;
	notch?: boolean;
}) {
	const size = marker.sizeIn;
	const cut = size - marker.notchIn;
	return (
		<svg
			aria-hidden
			data-template-marker=""
			viewBox={`0 0 ${size} ${size}`}
			style={{
				position: "absolute",
				left: `${xIn}in`,
				top: `${yIn}in`,
				width: `${size}in`,
				height: `${size}in`,
			}}
		>
			<path
				d={
					notch
						? `M0 0H${size}V${cut}H${cut}V${size}H0Z`
						: `M0 0H${size}V${size}H0Z`
				}
				fill={printColors.marker}
			/>
		</svg>
	);
}

export function TemplateSheet() {
	const cells = HANDWRITING_GLYPHS.flatMap((glyph) =>
		Array.from({ length: glyph.variants }, (_, variant) => ({
			char: glyph.char,
			variant,
		})),
	);
	return (
		<div
			className="template-sheet relative"
			style={{
				width: `${page.widthIn}in`,
				height: `${page.heightIn}in`,
				background: "white",
				color: printColors.label,
			}}
		>
			<Marker xIn={marker.insetIn} yIn={marker.insetIn} notch />
			<Marker
				xIn={page.widthIn - marker.insetIn - marker.sizeIn}
				yIn={marker.insetIn}
			/>
			<Marker
				xIn={page.widthIn - marker.insetIn - marker.sizeIn}
				yIn={page.heightIn - marker.insetIn - marker.sizeIn}
			/>
			<Marker
				xIn={marker.insetIn}
				yIn={page.heightIn - marker.insetIn - marker.sizeIn}
			/>
			{cells.map((cell, index) => {
				const column = index % grid.columns;
				const row = Math.floor(index / grid.columns);
				const x = grid.xIn + column * grid.cellWidthIn;
				const y = grid.yIn + row * grid.cellHeightIn;
				return (
					<div
						key={`${cell.char}-${cell.variant}`}
						data-template-cell={glyphLabel(cell.char, cell.variant)}
						style={{
							position: "absolute",
							left: `${x}in`,
							top: `${y}in`,
							width: `${grid.cellWidthIn}in`,
							height: `${grid.cellHeightIn}in`,
							border: `1px solid ${printColors.border}`,
							overflow: "hidden",
						}}
					>
						{GUIDES.map((guide) => (
							<div
								key={guide.at}
								data-baseline={"baseline" in guide ? "" : undefined}
								style={{
									position: "absolute",
									left: "0.04in",
									right: "0.04in",
									top: `${grid.cellHeightIn * guide.at}in`,
									borderTop: `1px solid ${guide.color}`,
								}}
							/>
						))}
						<span
							style={{
								position: "absolute",
								left: `${label.xIn}in`,
								top: `${label.yIn}in`,
								fontSize: `${label.sizePt}pt`,
								lineHeight: 1,
								color: printColors.label,
							}}
						>
							{glyphLabel(cell.char, cell.variant)}
						</span>
					</div>
				);
			})}
		</div>
	);
}
