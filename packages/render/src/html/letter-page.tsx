import type {
	KeepClearZone,
	LetterContent,
	LetterResources,
	MergeValues,
	PageSpec,
	PlacedElement,
} from "@repo/types";
import { INK_COLORS, PAGE_SPECS, STOCK_FONTS } from "@repo/types";
import React, {
	type CSSProperties,
	createContext,
	type ReactElement,
	type ReactNode,
	useContext,
} from "react";
import { inkProperties } from "../schema/letter-schema.ts";
import {
	columnBox,
	exclusionFloats,
	pageExclusions,
	sideTopIn,
	writingSides,
} from "./geometry.ts";
import { LETTER_CSS } from "./letter-css.ts";
import type { MeasureInput } from "./measure.ts";

export type LetterPageProps = {
	letterId: string;
	content: LetterContent;
	resources: LetterResources;
	mode: "edit" | "print";
	mergeValues: MergeValues | null;
	sheets: number;
	flow: ReactNode;
	handles?: ReactNode;
};

type LetterPageContextValue = Pick<
	LetterPageProps,
	"resources" | "mergeValues" | "mode"
>;

const EDIT_GAP_IN = 0.5;
const VARIANT_SETS = ["ss01", "ss02", "ss03"] as const;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const LetterPageContext = createContext<LetterPageContextValue | null>(null);

export function useLetterPage(): LetterPageContextValue {
	const value = useContext(LetterPageContext);
	if (value === null)
		throw new Error("useLetterPage is used outside LetterPage");
	return value;
}

export function variantFeatureSettings(letterId: string): string {
	let hash = FNV_OFFSET_BASIS;
	for (const byte of new TextEncoder().encode(letterId)) {
		hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
	}
	return `"${VARIANT_SETS[hash % VARIANT_SETS.length]}" 1`;
}

export function pageGapIn(mode: LetterPageProps["mode"]): number {
	return mode === "edit" ? EDIT_GAP_IN : 0;
}

export function measureInputFor(
	spec: PageSpec,
	mode: LetterPageProps["mode"],
): MeasureInput {
	return {
		heightIn: spec.heightIn,
		marginIn: spec.marginIn,
		gapIn: pageGapIn(mode),
		limitIn: columnBox(spec, 0).heightIn,
	};
}

function inches(value: number): string {
	return `${value}in`;
}

function assetUrl(resources: LetterResources, assetId: string): string {
	return `url("${resources.assetBaseUrl}${assetId}")`;
}

function fontFace(family: string, url: string): string {
	return `@font-face { font-family: "${family}"; src: url("${url}"); font-display: block; }`;
}

function fontFaces(resources: LetterResources): string {
	const stock = Object.keys(STOCK_FONTS).map((id) =>
		fontFace(`stock-${id}`, `${resources.stockFontBaseUrl}${id}`),
	);
	const own = Object.entries(resources.fonts).map(([fontId, assetId]) =>
		fontFace(`own-${fontId}`, `${resources.assetBaseUrl}${assetId}`),
	);
	return [...stock, ...own].join("\n");
}

function zoneStyle(
	spec: PageSpec,
	zone: KeepClearZone,
	gapIn: number,
): CSSProperties {
	const left = zone.corner.endsWith("left") ? 0 : spec.widthIn - zone.widthIn;
	const top = zone.corner.startsWith("top") ? 0 : spec.heightIn - zone.heightIn;
	return {
		left: inches(left),
		top: inches(sideTopIn(spec, zone.side, gapIn) + top),
		width: inches(zone.widthIn),
		height: inches(zone.heightIn),
	};
}

function elementStyle(
	spec: PageSpec,
	element: PlacedElement,
	resources: LetterResources,
	gapIn: number,
): CSSProperties {
	const drawing = Object.hasOwn(resources.drawings, element.drawingId)
		? resources.drawings[element.drawingId]
		: undefined;
	if (!drawing) {
		throw new Error(
			`Drawing ${element.drawingId} is placed on the letter but missing from its resources`,
		);
	}
	const mask = assetUrl(resources, drawing.maskAssetId);
	return {
		left: inches(element.xIn),
		top: inches(sideTopIn(spec, element.side, gapIn) + element.yIn),
		width: inches(element.widthIn),
		height: inches(element.heightIn),
		transform: `rotate(${element.rotationDeg}deg)`,
		WebkitMaskImage: mask,
		maskImage: mask,
		backgroundColor: INK_COLORS[element.tint].css,
	};
}

function FrontSheet({
	spec,
	content,
	resources,
	mode,
	gapIn,
}: {
	spec: PageSpec;
	content: LetterContent;
	resources: LetterResources;
	mode: LetterPageProps["mode"];
	gapIn: number;
}): ReactElement {
	const assetId = content.doc.attrs.frontImageAssetId;
	const image: CSSProperties =
		assetId === null
			? {}
			: {
					backgroundImage: assetUrl(resources, assetId),
					backgroundSize: "cover",
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
				};
	return (
		<div
			className="letter-sheet letter-front"
			data-side={0}
			style={{
				width: inches(spec.widthIn),
				height: inches(spec.heightIn),
				marginBottom: inches(gapIn),
				...image,
			}}
		>
			{assetId === null && mode === "edit" ? (
				<div className="letter-front-empty">Choose a front image</div>
			) : null}
		</div>
	);
}

export function LetterPage(props: LetterPageProps): ReactElement {
	void React;
	const { content, resources, mode } = props;
	const spec = PAGE_SPECS[content.format];
	const gapIn = pageGapIn(mode);
	const sides = writingSides(spec);
	const firstSide = sides[0] ?? 0;
	const column = columnBox(spec, gapIn);
	const floats = exclusionFloats(column, pageExclusions(spec, gapIn));
	const drawnSides: number[] = [];
	for (let side = firstSide; side < props.sheets; side += 1) {
		drawnSides.push(side);
	}
	const zones =
		mode === "edit"
			? spec.keepClear.filter(
					(zone) => zone.side >= firstSide && zone.side < props.sheets,
				)
			: [];
	const context: LetterPageContextValue = {
		resources,
		mergeValues: props.mergeValues,
		mode,
	};
	return (
		<LetterPageContext value={context}>
			<div
				className="letter-page"
				data-mode={mode}
				data-letter-id={props.letterId}
				style={
					{
						width: inches(spec.widthIn),
						"--letter-variant-set": variantFeatureSettings(props.letterId),
					} as CSSProperties
				}
			>
				<style>{LETTER_CSS}</style>
				<style>{fontFaces(resources)}</style>
				{spec.front === "image" ? (
					<FrontSheet
						spec={spec}
						content={content}
						resources={resources}
						mode={mode}
						gapIn={gapIn}
					/>
				) : null}
				<div
					className="letter-sides"
					style={{
						paddingTop: inches(spec.marginIn),
						paddingLeft: inches(spec.marginIn),
						paddingBottom: inches(spec.marginIn),
					}}
				>
					{drawnSides.map((side) => (
						<div
							key={side}
							className="letter-sheet"
							data-side={side}
							style={{
								top: inches(sideTopIn(spec, side, gapIn)),
								width: inches(spec.widthIn),
								height: inches(spec.heightIn),
							}}
						/>
					))}
					{zones.map((zone) => (
						<div
							key={`${zone.side}-${zone.corner}`}
							className="letter-keep-clear"
							data-keep-clear={zone.corner}
							data-side={zone.side}
							style={zoneStyle(spec, zone, gapIn)}
						/>
					))}
					<div
						className="letter-column"
						style={{
							width: inches(column.widthIn),
							minHeight: inches(column.heightIn),
							...inkProperties(content.defaults),
						}}
					>
						{floats.map((box, index) => (
							<div
								key={`${index}-${box.float}-${box.clear}`}
								className="letter-float"
								style={{
									float: box.float,
									clear: box.clear,
									width: inches(box.widthIn),
									height: inches(box.heightIn),
								}}
							/>
						))}
						{props.flow}
					</div>
					{content.doc.attrs.elements.map((element) => (
						<div
							key={element.id}
							className="letter-element animate-settle"
							data-element-id={element.id}
							style={elementStyle(spec, element, resources, gapIn)}
						/>
					))}
					{mode === "edit" && props.handles !== undefined ? (
						<div className="letter-handles">{props.handles}</div>
					) : null}
				</div>
			</div>
		</LetterPageContext>
	);
}
