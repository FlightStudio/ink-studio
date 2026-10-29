import type { Stroke, StrokeInput, StrokePoint } from "@repo/types";

export type PointerSample = {
	pointerId: number;
	input: StrokeInput;
	x: number;
	y: number;
	pressure: number;
	t: number;
};

export type PointerSessionState = {
	strokes: Stroke[];
	undone: Stroke[];
	active: { pointerId: number; stroke: Stroke; startedAt: number } | null;
	penSeen: boolean;
};

export type PointerSessionEvent =
	| { type: "down"; sample: PointerSample }
	| { type: "move"; samples: PointerSample[] }
	| { type: "up"; pointerId: number }
	| { type: "cancel"; pointerId: number }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "clear" };

export const FLAT_PRESSURE = 0.5;

export const EMPTY_POINTER_SESSION: PointerSessionState = {
	strokes: [],
	undone: [],
	active: null,
	penSeen: false,
};

export function drawsWith(
	pointer: { pointerType: string; button: number },
	penOnly: boolean,
): boolean {
	if (pointer.pointerType === "mouse") return pointer.button === 0;
	if (pointer.pointerType === "touch") return !penOnly;
	return true;
}

function pointOf(sample: PointerSample, startedAt: number): StrokePoint {
	const pressure = sample.input === "pen" ? sample.pressure : FLAT_PRESSURE;
	return [sample.x, sample.y, pressure, sample.t - startedAt];
}

function start(
	state: PointerSessionState,
	sample: PointerSample,
): PointerSessionState {
	return {
		...state,
		active: {
			pointerId: sample.pointerId,
			startedAt: sample.t,
			stroke: { input: sample.input, points: [pointOf(sample, sample.t)] },
		},
		penSeen: state.penSeen || sample.input === "pen",
	};
}

function down(
	state: PointerSessionState,
	sample: PointerSample,
): PointerSessionState {
	const { active } = state;
	if (sample.input === "pen") {
		if (active && active.stroke.input !== "touch") return state;
		return start(state, sample);
	}
	if (sample.input === "touch" && state.penSeen) return state;
	if (!active) return start(state, sample);
	if (sample.input === "touch" && active.stroke.input === "touch") {
		return { ...state, active: null };
	}
	return state;
}

function move(
	state: PointerSessionState,
	samples: PointerSample[],
): PointerSessionState {
	const { active } = state;
	if (!active) return state;
	const own = samples.filter((sample) => sample.pointerId === active.pointerId);
	if (own.length === 0) return state;
	return {
		...state,
		active: {
			...active,
			stroke: {
				...active.stroke,
				points: [
					...active.stroke.points,
					...own.map((sample) => pointOf(sample, active.startedAt)),
				],
			},
		},
	};
}

export function pointerSession(
	state: PointerSessionState,
	event: PointerSessionEvent,
): PointerSessionState {
	switch (event.type) {
		case "down":
			return down(state, event.sample);
		case "move":
			return move(state, event.samples);
		case "up":
			if (state.active?.pointerId !== event.pointerId) return state;
			return {
				...state,
				strokes: [...state.strokes, state.active.stroke],
				undone: [],
				active: null,
			};
		case "cancel":
			if (state.active?.pointerId !== event.pointerId) return state;
			return { ...state, active: null };
		case "undo": {
			const last = state.strokes.at(-1);
			if (!last) return state;
			return {
				...state,
				strokes: state.strokes.slice(0, -1),
				undone: [...state.undone, last],
			};
		}
		case "redo": {
			const next = state.undone.at(-1);
			if (!next) return state;
			return {
				...state,
				strokes: [...state.strokes, next],
				undone: state.undone.slice(0, -1),
			};
		}
		case "clear":
			return { ...state, strokes: [], undone: [], active: null };
	}
}
