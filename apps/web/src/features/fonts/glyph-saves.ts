import type { Stroke } from "@repo/types";
import type { CellStrokes } from "./glyph-history.ts";

export type SaveResult = { ok: true } | { ok: false; error: string | null };

export type GlyphSavesParams = {
	saved: CellStrokes;
	send(key: string, strokes: readonly Stroke[]): Promise<SaveResult>;
	onFailed(key: string, saved: readonly Stroke[], error: string | null): void;
	onPending?(pending: boolean): void;
};

export type GlyphSaves = {
	save(key: string, strokes: readonly Stroke[]): void;
	idle(): Promise<void>;
	pending(): boolean;
};

export function glyphSaves(params: GlyphSavesParams): GlyphSaves {
	const confirmed = new Map(Object.entries(params.saved));
	const queued = new Map<string, readonly Stroke[]>();
	const running = new Map<string, Promise<void>>();

	function settle() {
		if (running.size === 0) params.onPending?.(false);
	}

	async function attempt(key: string, strokes: readonly Stroke[]) {
		try {
			return await params.send(key, strokes);
		} catch {
			return { ok: false, error: null } satisfies SaveResult;
		}
	}

	async function drain(key: string) {
		try {
			for (
				let strokes = queued.get(key);
				strokes !== undefined;
				strokes = queued.get(key)
			) {
				queued.delete(key);
				const result = await attempt(key, strokes);
				if (result.ok) {
					confirmed.set(key, strokes);
				} else {
					queued.delete(key);
					params.onFailed(key, confirmed.get(key) ?? [], result.error);
				}
			}
		} finally {
			running.delete(key);
			settle();
		}
	}

	return {
		save(key, strokes) {
			queued.set(key, strokes);
			if (running.has(key)) return;
			if (running.size === 0) params.onPending?.(true);
			running.set(
				key,
				Promise.resolve().then(() => drain(key)),
			);
		},
		async idle() {
			while (running.size > 0) await Promise.allSettled(running.values());
		},
		pending: () => running.size > 0,
	};
}
