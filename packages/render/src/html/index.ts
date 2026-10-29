export type { LetterFixture, LetterFixtureName } from "./fixtures/index.ts";
export {
	fixtureContent,
	LETTER_FIXTURES,
	letterFixture,
} from "./fixtures/index.ts";
export type {
	Exclusion,
	FloatBox,
	OverflowParams,
	PlacedBox,
	PlacementIssue,
	PlacementIssuesParams,
	Rect,
	SidesUsedParams,
} from "./geometry.ts";
export {
	boundsOf,
	clipToText,
	columnBox,
	exclusionFloats,
	keepClearRect,
	overflowIn,
	pageExclusions,
	placementIssues,
	sidesUsed,
	sideTopIn,
	WRAP_PADDING_IN,
	wrapExclusions,
	writingSides,
} from "./geometry.ts";
export { outlinePath, STROKE_OPTIONS, strokeOutline } from "./ink.ts";
export { LETTER_CSS } from "./letter-css.ts";
export type { LetterPageProps } from "./letter-page.tsx";
export {
	elementFrame,
	keepClearFrame,
	LetterPage,
	measureInputFor,
	pageGapIn,
	useLetterPage,
	variantFeatureSettings,
} from "./letter-page.tsx";
export type { LetterPrintProps } from "./letter-print.tsx";
export { LetterPrint, LetterText } from "./letter-print.tsx";
export type { LetterMeasure, MeasureInput } from "./measure.ts";
export { measureLetter } from "./measure.ts";
export { MergeChip } from "./merge-chip.tsx";
