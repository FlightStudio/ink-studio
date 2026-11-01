import { errorMessages, isApiErrorCode } from "@repo/errors";
import { type LetterContent, ownFontIds, type PageSpec } from "@repo/types";
import type { AssetWatchState } from "@/lib/asset-watch";

export type Proof = AssetWatchState & { id: string };

export type ProofIdentity = {
	revision: number;
	fonts: Readonly<Record<string, string>>;
};

export function proofFonts(
	content: LetterContent,
	available: Readonly<Record<string, string>>,
): Record<string, string> {
	return Object.fromEntries(
		ownFontIds(content).flatMap((id) =>
			available[id] ? [[id, available[id]]] : [],
		),
	);
}

export function proofMatches(
	proof: ProofIdentity | null,
	revision: number | null,
	fonts: Readonly<Record<string, string>>,
): boolean {
	return (
		proof !== null &&
		proof.revision === revision &&
		Object.keys(proof.fonts).length === Object.keys(fonts).length &&
		Object.entries(proof.fonts).every(([id, assetId]) => fonts[id] === assetId)
	);
}

export type ExportState =
	| { phase: "idle" }
	| { phase: "blocked"; reason: string }
	| { phase: "saving" }
	| { phase: "starting" }
	| { phase: "working"; proofs: Proof[] }
	| { phase: "ready"; proofs: Proof[] }
	| { phase: "failed"; message: string };

export function exportBlocker(page: {
	wordsPastLimit: number;
	maxPages: number;
	placement: string | null;
	frontMissing: boolean;
}): string | null {
	if (page.frontMissing) return "Choose a front image, then export again.";
	if (page.wordsPastLimit > 0) {
		return `About ${page.wordsPastLimit} words won't fit on ${page.maxPages} sides. Shorten the letter or pick a smaller text size, then export again.`;
	}
	if (page.placement) return `${page.placement} Then export again.`;
	return null;
}

export function failureMessage(code: string | null): string {
	return code !== null && isApiErrorCode(code)
		? errorMessages[code]
		: errorMessages.processing_failed;
}

export function workingOn(ids: readonly string[]): ExportState {
	return {
		phase: "working",
		proofs: ids.map((id) => ({
			id,
			status: "pending",
			error: null,
			slow: false,
			issue: null,
		})),
	};
}

export function afterReading(
	state: ExportState,
	id: string,
	reading: AssetWatchState,
): ExportState {
	if (
		state.phase !== "working" ||
		!state.proofs.some((proof) => proof.id === id)
	) {
		return state;
	}
	const proofs = state.proofs.map((proof) =>
		proof.id === id ? { ...reading, id } : proof,
	);
	const failed = proofs.find((proof) => proof.status === "failed");
	if (failed) return { phase: "failed", message: failureMessage(failed.error) };
	if (proofs.every((proof) => proof.status === "done")) {
		return { phase: "ready", proofs };
	}
	return { ...state, proofs };
}

export function proofLabels(spec: PageSpec, count: number): string[] {
	if (count === 1) return ["Open the proof"];
	if (spec.front === "image" && count === 2) {
		return ["Open the front", "Open the back"];
	}
	return Array.from({ length: count }, (_, index) => `Open side ${index + 1}`);
}
