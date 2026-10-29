import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	type AssetReading,
	type AssetWatchState,
	pollDelay,
	SLOW_AFTER_MS,
	watchAsset,
} from "./asset-watch.ts";

function reader(readings: (AssetReading | null | Error)[]) {
	const read = vi.fn(async () => {
		const next = readings.length > 1 ? readings.shift() : readings[0];
		if (next instanceof Error) throw next;
		return next ?? null;
	});
	return read;
}

const pending: AssetReading = { status: "pending", error: null };
const running: AssetReading = { status: "running", error: null };
const done: AssetReading = { status: "done", error: null };

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("pollDelay", () => {
	test("starts at half a second and backs off to three", () => {
		expect(pollDelay(0)).toBe(500);
		expect(pollDelay(1)).toBe(750);
		expect(pollDelay(2)).toBe(1125);
		expect(pollDelay(20)).toBe(3000);
		for (let attempt = 1; attempt < 12; attempt += 1) {
			expect(pollDelay(attempt)).toBeGreaterThanOrEqual(pollDelay(attempt - 1));
		}
	});
});

describe("watchAsset", () => {
	test("reads at once, then on the back-off, and stops when done", async () => {
		const read = reader([pending, running, done]);
		const states: AssetWatchState[] = [];
		watchAsset({ read, onChange: (state) => states.push(state) });
		await vi.advanceTimersByTimeAsync(0);
		expect(read).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(499);
		expect(read).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(read).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(750);
		expect(read).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(read).toHaveBeenCalledTimes(3);
		expect(states.map((state) => state.status)).toEqual([
			"pending",
			"running",
			"done",
		]);
	});

	test("a failure settles with its error code", async () => {
		const read = reader([{ status: "failed", error: "font_unreadable" }]);
		const onChange = vi.fn();
		watchAsset({ read, onChange });
		await vi.advanceTimersByTimeAsync(0);
		expect(onChange).toHaveBeenLastCalledWith({
			status: "failed",
			error: "font_unreadable",
			slow: false,
			unreachable: false,
		});
		await vi.advanceTimersByTimeAsync(5000);
		expect(read).toHaveBeenCalledTimes(1);
	});

	test("an unchanged reading is not passed on again", async () => {
		const read = reader([pending]);
		const onChange = vi.fn();
		watchAsset({ read, onChange });
		await vi.advanceTimersByTimeAsync(5000);
		expect(read.mock.calls.length).toBeGreaterThan(3);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	test("after a minute the watch says it is slow and keeps reading", async () => {
		const read = reader([running]);
		const states: AssetWatchState[] = [];
		watchAsset({ read, onChange: (state) => states.push(state) });
		await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 1);
		expect(states.at(-1)?.slow).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(states.at(-1)).toEqual({
			...running,
			slow: true,
			unreachable: false,
		});
		const reads = read.mock.calls.length;
		await vi.advanceTimersByTimeAsync(3000);
		expect(read.mock.calls.length).toBe(reads + 1);
	});

	test("a lost reading or a thrown one stops the watch", async () => {
		const lost = reader([null, done]);
		const onLost = vi.fn();
		watchAsset({ read: lost, onChange: onLost });
		await vi.advanceTimersByTimeAsync(0);
		expect(onLost).toHaveBeenCalledTimes(1);
		expect(onLost).toHaveBeenCalledWith({
			status: "failed",
			error: null,
			slow: false,
			unreachable: true,
		});
		await vi.advanceTimersByTimeAsync(10_000);
		expect(lost).toHaveBeenCalledTimes(1);

		const thrown = reader([new Error("offline"), done]);
		const onThrown = vi.fn();
		watchAsset({ read: thrown, onChange: onThrown });
		await vi.advanceTimersByTimeAsync(0);
		expect(onThrown).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(thrown).toHaveBeenCalledTimes(1);
	});

	test("stop ends the reads and drops a reading still on its way", async () => {
		let answer: (reading: AssetReading) => void = () => {};
		const read = vi.fn(
			() =>
				new Promise<AssetReading>((resolve) => {
					answer = resolve;
				}),
		);
		const onChange = vi.fn();
		const stop = watchAsset({ read, onChange });
		await vi.advanceTimersByTimeAsync(0);
		stop();
		answer(done);
		await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS * 2);
		expect(onChange).not.toHaveBeenCalled();
		expect(read).toHaveBeenCalledTimes(1);
	});
});
