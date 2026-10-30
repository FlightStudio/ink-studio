export type AssetReading = {
	status: "pending" | "running" | "done" | "failed";
	error: string | null;
};

export type AssetReadIssue =
	| "unreachable"
	| "unauthenticated"
	| "forbidden"
	| "not_found";

export type AssetReadResult = AssetReading | { issue: AssetReadIssue };

export type AssetWatchState = AssetReading & {
	slow: boolean;
	issue: AssetReadIssue | null;
};

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

export function assetReadIssue(status: number): AssetReadIssue {
	if (status === 401) return "unauthenticated";
	if (status === 403) return "forbidden";
	if (status === 404) return "not_found";
	return "unreachable";
}

export type WatchAssetOptions = {
	read: () => Promise<AssetReadResult>;
	onChange: (state: AssetWatchState) => void;
	initialReading?: AssetReading;
	slowAfterMs?: number;
};

export function watchAsset({
	read,
	onChange,
	initialReading = { status: "pending", error: null },
	slowAfterMs = SLOW_AFTER_MS,
}: WatchAssetOptions): () => void {
	let stopped = false;
	let attempt = 0;
	let state: AssetWatchState | null = null;
	let reading = initialReading;
	let issue: AssetReadIssue | null = null;
	let slow = false;
	let next: ReturnType<typeof setTimeout> | undefined;

	function stop() {
		stopped = true;
		clearTimeout(next);
		clearTimeout(slowTimer);
	}

	function emit() {
		const nextState: AssetWatchState = {
			status: reading.status,
			error: reading.error,
			slow: slow && !isSettled(reading) && issue === null,
			issue,
		};
		if (
			state?.status === nextState.status &&
			state.error === nextState.error &&
			state.slow === nextState.slow &&
			state.issue === nextState.issue
		)
			return;
		state = nextState;
		onChange(state);
	}

	const slowTimer = setTimeout(() => {
		slow = true;
		emit();
	}, slowAfterMs);

	async function tick() {
		const result = await read().catch(() => ({
			issue: "unreachable" as const,
		}));
		if (stopped) return;
		if ("issue" in result) {
			issue = result.issue;
		} else {
			reading = result;
			issue = null;
		}
		emit();
		if (stopped) return;
		if (isSettled(reading) || (issue !== null && issue !== "unreachable")) {
			stop();
			return;
		}
		next = setTimeout(() => void tick(), pollDelay(attempt));
		attempt += 1;
	}

	void tick();
	return stop;
}
