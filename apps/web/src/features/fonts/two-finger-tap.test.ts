import { describe, expect, test } from "vitest";
import {
	IDLE_TAP,
	severalFingers,
	TAP_MS,
	TAP_SLOP_PX,
	type TapEvent,
	type TapState,
	type TapTouch,
	twoFingerTap,
} from "./two-finger-tap.ts";

function finger(id: number, x = 100 * id, y = 200): TapTouch {
	return { id, x, y, stylus: false };
}

function run(events: TapEvent[]): { state: TapState; taps: number } {
	let state = IDLE_TAP;
	let taps = 0;
	for (const event of events) {
		const next = twoFingerTap(state, event);
		state = next.state;
		if (next.tap) taps += 1;
	}
	return { state, taps };
}

describe("twoFingerTap", () => {
	test("two fingers down and up quickly is one tap", () => {
		const { state, taps } = run([
			{ type: "start", t: 0, changed: [finger(1)], remaining: 1 },
			{ type: "start", t: 30, changed: [finger(2)], remaining: 2 },
			{ type: "end", t: 120, changed: [finger(1)], remaining: 1 },
			{ type: "end", t: 140, changed: [finger(2)], remaining: 0 },
		]);
		expect(taps).toBe(1);
		expect(state).toEqual(IDLE_TAP);
	});

	test("both fingers landing in one event is a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
			{ type: "end", t: 90, changed: [finger(1), finger(2)], remaining: 0 },
		]);
		expect(taps).toBe(1);
	});

	test("one finger is not a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1)], remaining: 1 },
			{ type: "end", t: 80, changed: [finger(1)], remaining: 0 },
		]);
		expect(taps).toBe(0);
	});

	test("three fingers are not a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
			{ type: "start", t: 20, changed: [finger(3)], remaining: 3 },
			{
				type: "end",
				t: 90,
				changed: [finger(1), finger(2), finger(3)],
				remaining: 0,
			},
		]);
		expect(taps).toBe(0);
	});

	test("holding longer than a tap is not a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
			{
				type: "end",
				t: TAP_MS + 1,
				changed: [finger(1), finger(2)],
				remaining: 0,
			},
		]);
		expect(taps).toBe(0);
	});

	test("a two-finger scroll is not a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
			{
				type: "move",
				t: 40,
				changed: [finger(1, 100, 200 - TAP_SLOP_PX - 1)],
				remaining: 2,
			},
			{ type: "end", t: 90, changed: [finger(1), finger(2)], remaining: 0 },
		]);
		expect(taps).toBe(0);
	});

	test("a little wobble is still a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
			{ type: "move", t: 40, changed: [finger(2, 203, 204)], remaining: 2 },
			{ type: "end", t: 90, changed: [finger(1), finger(2)], remaining: 0 },
		]);
		expect(taps).toBe(1);
	});

	test("a lifted finger that moved away is not a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
			{ type: "end", t: 90, changed: [finger(1, 160, 260)], remaining: 1 },
			{ type: "end", t: 95, changed: [finger(2)], remaining: 0 },
		]);
		expect(taps).toBe(0);
	});

	test("a Pencil touch is never part of a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1)], remaining: 1 },
			{
				type: "start",
				t: 10,
				changed: [{ ...finger(2), stylus: true }],
				remaining: 2,
			},
			{ type: "end", t: 60, changed: [finger(1), finger(2)], remaining: 0 },
		]);
		expect(taps).toBe(0);
	});

	test("a cancelled touch is not a tap", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
			{ type: "cancel", t: 50, changed: [finger(1), finger(2)], remaining: 0 },
		]);
		expect(taps).toBe(0);
	});

	test("the next gesture starts afresh after a failed one", () => {
		const { taps } = run([
			{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
			{ type: "end", t: 900, changed: [finger(1), finger(2)], remaining: 0 },
			{ type: "start", t: 1000, changed: [finger(1), finger(2)], remaining: 2 },
			{ type: "end", t: 1080, changed: [finger(1), finger(2)], remaining: 0 },
		]);
		expect(taps).toBe(1);
	});
});

describe("severalFingers", () => {
	function after(events: TapEvent[]): boolean[] {
		let several = false;
		return events.map((event) => {
			several = severalFingers(several, event);
			return several;
		});
	}

	test("one finger drawing is never several", () => {
		expect(
			after([
				{ type: "start", t: 0, changed: [finger(1)], remaining: 1 },
				{ type: "move", t: 20, changed: [finger(1, 140, 240)], remaining: 1 },
				{ type: "end", t: 80, changed: [finger(1)], remaining: 0 },
			]),
		).toEqual([false, false, false]);
	});

	test("a second finger makes the gesture several until a fresh touch", () => {
		expect(
			after([
				{ type: "start", t: 0, changed: [finger(1)], remaining: 1 },
				{ type: "start", t: 30, changed: [finger(2)], remaining: 2 },
				{ type: "end", t: 90, changed: [finger(1)], remaining: 1 },
				{ type: "end", t: 95, changed: [finger(2)], remaining: 0 },
				{ type: "start", t: 400, changed: [finger(1)], remaining: 1 },
			]),
		).toEqual([false, true, true, true, false]);
	});

	test("two fingers landing together are several at once", () => {
		expect(
			after([
				{ type: "start", t: 0, changed: [finger(1), finger(2)], remaining: 2 },
				{
					type: "cancel",
					t: 40,
					changed: [finger(1), finger(2)],
					remaining: 0,
				},
			]),
		).toEqual([true, true]);
	});
});
