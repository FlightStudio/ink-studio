import type { StrokeInput } from "@repo/types";
import { describe, expect, it } from "vitest";
import {
	drawsWith,
	EMPTY_POINTER_SESSION,
	type PointerSample,
	type PointerSessionEvent,
	type PointerSessionState,
	pointerSession,
	TOUCH_INK_SLOP,
	touchPastSlop,
} from "./pointer-session.ts";

const empty: PointerSessionState = EMPTY_POINTER_SESSION;

function sample(
	pointerId: number,
	input: StrokeInput,
	x: number,
	y: number,
	pressure: number,
	t: number,
): PointerSample {
	return { pointerId, input, x, y, pressure, t };
}

function run(
	state: PointerSessionState,
	events: PointerSessionEvent[],
): PointerSessionState {
	return events.reduce(pointerSession, state);
}

function line(
	pointerId: number,
	input: StrokeInput,
	start: number,
): PointerSessionEvent[] {
	return [
		{ type: "down", sample: sample(pointerId, input, 0, 0, 0.5, start) },
		{
			type: "move",
			samples: [sample(pointerId, input, 10, 10, 0.5, start + 10)],
		},
		{ type: "up", pointerId },
	];
}

describe("pointerSession", () => {
	it("erase strokes retain their starting widths through movement and history", () => {
		const broad = run(empty, [
			{ type: "down", sample: sample(1, "pen", 0, 0, 0.5, 0), strokeScale: 6 },
			{ type: "move", samples: [sample(1, "pen", 20, 10, 0.5, 20)] },
			{ type: "up", pointerId: 1 },
		]);
		const fine = run(broad, [
			{
				type: "down",
				sample: sample(2, "pen", 30, 0, 0.5, 40),
				strokeScale: 1,
			},
			{ type: "move", samples: [sample(2, "pen", 40, 10, 0.5, 60)] },
			{ type: "up", pointerId: 2 },
		]);
		expect(fine.strokes.map((stroke) => stroke.strokeScale)).toEqual([6, 1]);
		const undone = pointerSession(fine, { type: "undo" });
		expect(undone.strokes[0]?.strokeScale).toBe(6);
		const redone = pointerSession(undone, { type: "redo" });
		expect(redone.strokes).toEqual(fine.strokes);
	});

	it("a pen stroke keeps its pressures and times from its own start", () => {
		const state = run(empty, [
			{ type: "down", sample: sample(1, "pen", 10, 20, 0.2, 1000) },
			{
				type: "move",
				samples: [
					sample(1, "pen", 12, 22, 0.4, 1008),
					sample(1, "pen", 15, 25, 0.6, 1016),
				],
			},
			{ type: "up", pointerId: 1 },
		]);
		expect(state.strokes).toEqual([
			{
				input: "pen",
				points: [
					[10, 20, 0.2, 0],
					[12, 22, 0.4, 8],
					[15, 25, 0.6, 16],
				],
			},
		]);
		expect(state.active).toBeNull();
		expect(state.penSeen).toBe(true);
	});

	it("a touch during a pen stroke is ignored", () => {
		const state = run(empty, [
			{ type: "down", sample: sample(1, "pen", 0, 0, 0.3, 0) },
			{ type: "down", sample: sample(2, "touch", 50, 50, 0.5, 4) },
			{
				type: "move",
				samples: [
					sample(2, "touch", 60, 60, 0.5, 6),
					sample(1, "pen", 5, 5, 0.4, 8),
				],
			},
			{ type: "up", pointerId: 2 },
			{ type: "move", samples: [sample(1, "pen", 9, 9, 0.5, 12)] },
			{ type: "up", pointerId: 1 },
		]);
		expect(state.strokes).toEqual([
			{
				input: "pen",
				points: [
					[0, 0, 0.3, 0],
					[5, 5, 0.4, 8],
					[9, 9, 0.5, 12],
				],
			},
		]);
	});

	it("after a pen has drawn, touches are palms, and a mouse still draws", () => {
		const afterPen = run(empty, line(1, "pen", 0));
		const afterTouch = run(afterPen, line(2, "touch", 100));
		const afterMouse = run(afterTouch, line(3, "mouse", 200));
		expect(afterTouch.strokes).toHaveLength(1);
		expect(afterTouch.active).toBeNull();
		expect(afterMouse.strokes.map((stroke) => stroke.input)).toEqual([
			"pen",
			"mouse",
		]);
	});

	it("a mouse stroke stores a flat pressure of 0.5", () => {
		const state = run(empty, [
			{ type: "down", sample: sample(1, "mouse", 0, 0, 0, 0) },
			{
				type: "move",
				samples: [
					sample(1, "mouse", 4, 4, 1, 16),
					sample(1, "mouse", 8, 8, 0.2, 32),
				],
			},
			{ type: "up", pointerId: 1 },
		]);
		expect(state.strokes[0]?.points.map((point) => point[2])).toEqual([
			0.5, 0.5, 0.5,
		]);
	});

	it("a cancelled stroke is dropped", () => {
		const drawn = run(empty, line(1, "mouse", 0));
		const state = run(drawn, [
			{ type: "down", sample: sample(2, "touch", 0, 0, 0.5, 100) },
			{ type: "move", samples: [sample(2, "touch", 5, 5, 0.5, 110)] },
			{ type: "cancel", pointerId: 2 },
			{ type: "up", pointerId: 2 },
		]);
		expect(drawn.strokes).toHaveLength(1);
		expect(state.strokes).toEqual(drawn.strokes);
		expect(state.active).toBeNull();
	});

	it("a second finger cancels the first finger's stroke", () => {
		const drawing = run(empty, [
			{ type: "down", sample: sample(1, "touch", 0, 0, 0.5, 0) },
			{ type: "move", samples: [sample(1, "touch", 5, 5, 0.5, 10)] },
		]);
		const state = run(drawing, [
			{ type: "down", sample: sample(2, "touch", 80, 80, 0.5, 20) },
			{
				type: "move",
				samples: [
					sample(1, "touch", 9, 9, 0.5, 30),
					sample(2, "touch", 70, 70, 0.5, 30),
				],
			},
			{ type: "up", pointerId: 1 },
			{ type: "up", pointerId: 2 },
		]);
		expect(drawing.active?.stroke.points).toHaveLength(2);
		expect(state.strokes).toEqual([]);
		expect(state.active).toBeNull();
	});

	it("undo removes the last stroke and clear removes all", () => {
		const drawn = run(empty, [
			...line(1, "mouse", 0),
			...line(2, "mouse", 100),
			...line(3, "mouse", 200),
		]);
		const undone = pointerSession(drawn, { type: "undo" });
		const cleared = pointerSession(undone, { type: "clear" });
		expect(drawn.strokes).toHaveLength(3);
		expect(undone.strokes).toEqual(drawn.strokes.slice(0, 2));
		expect(cleared.strokes).toEqual([]);
		expect(cleared.active).toBeNull();
	});

	it("redo puts back what undo took, last undone first", () => {
		const drawn = run(empty, [
			...line(1, "mouse", 0),
			...line(2, "mouse", 100),
			...line(3, "mouse", 200),
		]);
		const undone = run(drawn, [{ type: "undo" }, { type: "undo" }]);
		const redone = pointerSession(undone, { type: "redo" });
		expect(undone.strokes).toEqual(drawn.strokes.slice(0, 1));
		expect(undone.undone).toHaveLength(2);
		expect(redone.strokes).toEqual(drawn.strokes.slice(0, 2));
		expect(run(redone, [{ type: "redo" }]).strokes).toEqual(drawn.strokes);
	});

	it("a new stroke ends what redo can bring back", () => {
		const drawn = run(empty, [
			...line(1, "mouse", 0),
			...line(2, "mouse", 100),
		]);
		const undone = pointerSession(drawn, { type: "undo" });
		const fresh = run(undone, line(3, "mouse", 200));
		expect(fresh.undone).toEqual([]);
		expect(pointerSession(fresh, { type: "redo" })).toBe(fresh);
	});

	it("redo with nothing undone and undo with nothing drawn change nothing", () => {
		expect(pointerSession(empty, { type: "redo" })).toBe(empty);
		expect(pointerSession(empty, { type: "undo" })).toBe(empty);
	});

	it("clear also forgets what redo could bring back", () => {
		const drawn = run(empty, [
			...line(1, "mouse", 0),
			...line(2, "mouse", 100),
		]);
		const cleared = run(drawn, [{ type: "undo" }, { type: "clear" }]);
		expect(cleared.strokes).toEqual([]);
		expect(cleared.undone).toEqual([]);
	});
});

describe("touchPastSlop", () => {
	it("a finger becomes ink only after a small movement", () => {
		expect(touchPastSlop({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
		expect(
			touchPastSlop({ x: 10, y: 20 }, { x: 10, y: 20 + TOUCH_INK_SLOP - 0.1 }),
		).toBe(false);
		expect(
			touchPastSlop({ x: 10, y: 20 }, { x: 10 + TOUCH_INK_SLOP, y: 20 }),
		).toBe(true);
	});
});

describe("drawsWith", () => {
	it("a pen, a finger and the main mouse button draw", () => {
		expect(drawsWith({ pointerType: "pen", button: 0 }, false)).toBe(true);
		expect(drawsWith({ pointerType: "touch", button: 0 }, false)).toBe(true);
		expect(drawsWith({ pointerType: "mouse", button: 0 }, false)).toBe(true);
	});

	it("another mouse button does not draw", () => {
		expect(drawsWith({ pointerType: "mouse", button: 2 }, false)).toBe(false);
	});

	it("pen only leaves fingers to scroll while a pen and a mouse still draw", () => {
		expect(drawsWith({ pointerType: "touch", button: 0 }, true)).toBe(false);
		expect(drawsWith({ pointerType: "pen", button: 0 }, true)).toBe(true);
		expect(drawsWith({ pointerType: "mouse", button: 0 }, true)).toBe(true);
	});
});
