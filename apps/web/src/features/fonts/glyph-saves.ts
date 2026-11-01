import type { Stroke } from "@repo/types";

export type SaveResult = { ok: true } | { ok: false; error: string | null };

export type GlyphSavesParams = {
	send(key: string, strokes: readonly Stroke[]): Promise<SaveResult>;
	onFailed(key: string, error: string | null): void;
	onSaved?(key: string): void;
	onPending?(pending: boolean): void;
};

export type GlyphSaves = {
	save(key: string, strokes: readonly Stroke[]): void;
	retry(): void;
	idle(): Promise<void>;
	pending(): boolean;
};

export function glyphSaves(params: GlyphSavesParams): GlyphSaves {
	const queued = new Map<string, readonly Stroke[]>();
	const running = new Map<string, Promise<void>>();
	let pending = false;

	function settle() {
		const next = running.size > 0 || queued.size > 0;
		if (next === pending) return;
		pending = next;
		params.onPending?.(next);
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
					if (!queued.has(key)) params.onSaved?.(key);
				} else {
					if (!queued.has(key)) queued.set(key, strokes);
					params.onFailed(key, result.error);
					break;
				}
			}
		} finally {
			running.delete(key);
			settle();
		}
	}

	function start(key: string) {
		if (running.has(key)) return;
		running.set(
			key,
			Promise.resolve().then(() => drain(key)),
		);
		settle();
	}

	return {
		save(key, strokes) {
			queued.set(key, structuredClone(strokes));
			start(key);
		},
		retry() {
			for (const key of queued.keys()) start(key);
		},
		async idle() {
			while (running.size > 0) await Promise.allSettled(running.values());
		},
		pending: () => pending,
	};
}
