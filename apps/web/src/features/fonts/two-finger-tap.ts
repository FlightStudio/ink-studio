export const TAP_MS = 300;
export const TAP_SLOP_PX = 12;

export type TapTouch = { id: number; x: number; y: number; stylus: boolean };

export type TapEvent = {
	type: "start" | "move" | "end" | "cancel";
	t: number;
	changed: readonly TapTouch[];
	remaining: number;
};

export type TapState =
	| { phase: "idle" }
	| {
			phase: "tracking";
			startedAt: number;
			starts: Readonly<Record<number, { x: number; y: number }>>;
	  }
	| { phase: "failed" };

export const IDLE_TAP: TapState = { phase: "idle" };

const FAILED: TapState = { phase: "failed" };

function strayed(
	starts: Readonly<Record<number, { x: number; y: number }>>,
	changed: readonly TapTouch[],
): boolean {
	return changed.some((touch) => {
		const start = starts[touch.id];
		if (!start) return true;
		return Math.hypot(touch.x - start.x, touch.y - start.y) > TAP_SLOP_PX;
	});
}

function begin(state: TapState, event: TapEvent): TapState {
	if (event.changed.some((touch) => touch.stylus)) return FAILED;
	if (state.phase === "failed") return state;
	const starts = state.phase === "tracking" ? { ...state.starts } : {};
	for (const touch of event.changed)
		starts[touch.id] = { x: touch.x, y: touch.y };
	if (Object.keys(starts).length > 2) return FAILED;
	return {
		phase: "tracking",
		startedAt: state.phase === "tracking" ? state.startedAt : event.t,
		starts,
	};
}

function follow(state: TapState, event: TapEvent): TapState {
	if (state.phase !== "tracking") return state;
	return strayed(state.starts, event.changed) ? FAILED : state;
}

export function twoFingerTap(
	state: TapState,
	event: TapEvent,
): { state: TapState; tap: boolean } {
	const next =
		event.type === "start"
			? begin(state, event)
			: event.type === "cancel"
				? FAILED
				: follow(state, event);
	if (event.type === "start" || event.type === "move" || event.remaining > 0) {
		return { state: next, tap: false };
	}
	const tap =
		next.phase === "tracking" &&
		Object.keys(next.starts).length === 2 &&
		event.t - next.startedAt <= TAP_MS;
	return { state: IDLE_TAP, tap };
}

export function severalFingers(several: boolean, event: TapEvent): boolean {
	return event.type === "start" ? event.remaining > 1 : several;
}
