export type AssetReading = {
	status: "pending" | "running" | "done" | "failed";
	error: string | null;
};

export type AssetWatchState = AssetReading & { slow: boolean };

export const SLOW_AFTER_MS = 60_000;

const FIRST_DELAY_MS = 500;
const LAST_DELAY_MS = 3000;
const BACK_OFF = 1.5;

export function pollDelay(attempt: number): number {
	return Math.min(
		LAST_DELAY_MS,
		Math.round(FIRST_DELAY_MS * BACK_OFF ** attempt),
	);
}

export function isSettled(reading: AssetReading): boolean {
	return reading.status === "done" || reading.status === "failed";
}

export type WatchAssetOptions = {
	read: () => Promise<AssetReading | null>;
	onChange: (state: AssetWatchState) => void;
	slowAfterMs?: number;
};

export function watchAsset({
	read,
	onChange,
	slowAfterMs = SLOW_AFTER_MS,
}: WatchAssetOptions): () => void {
	let stopped = false;
	let attempt = 0;
	let state: AssetWatchState | null = null;
	let slow = false;
	let next: ReturnType<typeof setTimeout> | undefined;

	function stop() {
		stopped = true;
		clearTimeout(next);
		clearTimeout(slowTimer);
	}

	function emit(reading: AssetReading) {
		state = { ...reading, slow: slow && !isSettled(reading) };
		onChange(state);
	}

	const slowTimer = setTimeout(() => {
		slow = true;
		if (state) emit(state);
		else emit({ status: "pending", error: null });
	}, slowAfterMs);

	async function tick() {
		const reading = await read().catch(() => null);
		if (stopped) return;
		if (
			reading &&
			(reading.status !== state?.status || reading.error !== state.error)
		) {
			emit(reading);
		}
		if (reading && isSettled(reading)) {
			stop();
			return;
		}
		next = setTimeout(() => void tick(), pollDelay(attempt));
		attempt += 1;
	}

	void tick();
	return stop;
}
