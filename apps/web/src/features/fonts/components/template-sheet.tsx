import { HANDWRITING_GLYPHS, HANDWRITING_TEMPLATE } from "@repo/types";

const { page, marker, grid, printColors } = HANDWRITING_TEMPLATE;

function Marker({
	xIn,
	yIn,
	notch = false,
}: {
	xIn: number;
	yIn: number;
	notch?: boolean;
}) {
	return (
		<div
			style={{
				position: "absolute",
				left: `${xIn}in`,
				top: `${yIn}in`,
				width: `${marker.sizeIn}in`,
				height: `${marker.sizeIn}in`,
				background: printColors.marker,
			}}
		>
			{notch ? (
				<div
					style={{
						position: "absolute",
						right: 0,
						bottom: 0,
						width: `${marker.notchIn}in`,
						height: `${marker.notchIn}in`,
						background: "white",
					}}
				/>
			) : null}
		</div>
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
						{[0.2, 0.45, 0.7, 0.9].map((line) => (
							<div
								key={line}
								style={{
									position: "absolute",
									left: "0.04in",
									right: "0.04in",
									top: `${grid.cellHeightIn * line}in`,
									borderTop: `1px solid ${printColors.guide}`,
								}}
							/>
						))}
						<span
							style={{
								position: "absolute",
								left: "0.04in",
								top: "0.02in",
								fontSize: "9pt",
								lineHeight: 1,
								color: printColors.label,
							}}
						>
							{cell.char}
						</span>
					</div>
				);
			})}
		</div>
	);
}
