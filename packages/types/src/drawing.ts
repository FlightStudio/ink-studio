import type { Stroke } from "./stroke.ts";

export type DrawingKind = "doodle" | "signature";

export type DrawingSource =
	| {
			kind: "drawn";
			box: { widthPx: number; heightPx: number };
			strokes: Stroke[];
	  }
	| { kind: "photo"; photoAssetId: string };

export type Drawing = {
	id: string;
	organizationId: string;
	ownerUserId: string;
	kind: DrawingKind;
	name: string;
	source: DrawingSource;
	maskAssetId: string;
	aspect: number;
	createdAt: Date;
	deletedAt: Date | null;
};

export type LibraryDrawing = {
	id: string;
	kind: DrawingKind;
	name: string;
	aspect: number;
	maskAssetId: string;
};
