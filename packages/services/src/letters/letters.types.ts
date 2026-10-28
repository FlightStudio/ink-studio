import type { CreateLetterRequest, SaveLetterRequest } from "@repo/api";
import type { LetterContent, LetterResources } from "@repo/types";

export type LetterListItem = {
	id: string;
	title: string;
	updatedAt: Date;
	humanSeal: string | null;
};

export type SealFontView = { ownerName: string; chars: string };

export type EditableLetter = {
	id: string;
	title: string;
	content: LetterContent;
	revision: number;
	resources: LetterResources;
	sealFonts: Record<string, SealFontView>;
	editable: boolean;
};

export type SaveLetterParams = SaveLetterRequest;

export type CreateLetterParams = CreateLetterRequest;

export type MeasureInput = {
	heightIn: number;
	marginIn: number;
	gapIn: number;
	limitIn: number;
};

export type LetterMeasure = {
	lineTopsIn: number[];
	textBottomIn: number;
	wordsPastLimit: number;
};

export type PrintResource = { bytes: Uint8Array; contentType: string };

export type PrintOutput =
	| { format: "pdf"; duplex: boolean }
	| { format: "png"; side: number };

export type MeasureParams = {
	html: string;
	resources: ReadonlyMap<string, PrintResource>;
	measure: (root: HTMLElement, input: MeasureInput) => LetterMeasure;
	input: MeasureInput;
};

export type RenderParams = MeasureParams & {
	sheet: { widthIn: number; heightIn: number };
	output: PrintOutput;
	sides: (measure: LetterMeasure) => number;
};

export interface PrintRenderer {
	measure(params: MeasureParams): Promise<LetterMeasure>;
	render(params: RenderParams): Promise<Uint8Array>;
}
