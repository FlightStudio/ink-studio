import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	type AssetReading,
	type AssetReadResult,
	type AssetWatchState,
	assetReadIssue,
	pollDelay,
	SLOW_AFTER_MS,
	watchAsset,
} from "./asset-watch.ts";

function reader(readings: (AssetReadResult | Error)[]) {
	const read = vi.fn(async () => {
		const next = readings.length > 1 ? readings.shift() : readings[0];
		if (next instanceof Error) throw next;
		return next ?? { issue: "unreachable" as const };
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
			issue: null,
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
			issue: null,
		});
		const reads = read.mock.calls.length;
		await vi.advanceTimersByTimeAsync(3000);
		expect(read.mock.calls.length).toBe(reads + 1);
	});

	test("a connection failure retains the last status and recovers even when it is unchanged", async () => {
		const read = reader([
			running,
			new Error("offline"),
			{ issue: "unreachable" },
			running,
			done,
		]);
		const states: AssetWatchState[] = [];
		watchAsset({ read, onChange: (state) => states.push(state) });
		await vi.advanceTimersByTimeAsync(500);
		expect(states.at(-1)).toEqual({
			...running,
			slow: false,
			issue: "unreachable",
		});
		await vi.advanceTimersByTimeAsync(750);
		expect(states).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1125);
		expect(states.at(-1)).toEqual({
			...running,
			slow: false,
			issue: null,
		});
		await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS * 2);
		expect(states.at(-1)?.status).toBe("done");
		expect(read).toHaveBeenCalledTimes(5);
	});

	test("a first connection failure stays pending and keeps retrying at the capped delay", async () => {
		const read = reader([{ issue: "unreachable" }]);
		const states: AssetWatchState[] = [];
		const stop = watchAsset({ read, onChange: (state) => states.push(state) });
		await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS + 10_000);
		expect(states).toEqual([{ ...pending, slow: false, issue: "unreachable" }]);
		const reads = read.mock.calls.length;
		await vi.advanceTimersByTimeAsync(3000);
		expect(read).toHaveBeenCalledTimes(reads + 1);
		stop();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(read).toHaveBeenCalledTimes(reads + 1);
	});

	test.each(["unauthenticated", "forbidden", "not_found"] as const)(
		"%s stops checking without claiming the job failed",
		async (issue) => {
			const read = reader([running, { issue }, done]);
			const onChange = vi.fn();
			watchAsset({ read, onChange });
			await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS * 2);
			expect(read).toHaveBeenCalledTimes(2);
			expect(onChange).toHaveBeenLastCalledWith({
				...running,
				slow: false,
				issue,
			});
		},
	);

	test("a confirmed job failure after reconnecting stops the watch", async () => {
		const read = reader([
			{ issue: "unreachable" },
			{ status: "failed", error: "font_unreadable" },
		]);
		const onChange = vi.fn();
		watchAsset({ read, onChange });
		await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS * 2);
		expect(read).toHaveBeenCalledTimes(2);
		expect(onChange).toHaveBeenLastCalledWith({
			status: "failed",
			error: "font_unreadable",
			slow: false,
			issue: null,
		});
	});

	test("rechecking preserves the last confirmed status if the connection is still unavailable", async () => {
		const onChange = vi.fn();
		const stop = watchAsset({
			read: reader([{ issue: "unreachable" }]),
			initialReading: running,
			onChange,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(onChange).toHaveBeenLastCalledWith({
			...running,
			slow: false,
			issue: "unreachable",
		});
		stop();
	});

	test("stopping from a status callback prevents another read", async () => {
		const read = reader([running, done]);
		const stop = watchAsset({ read, onChange: () => stop() });
		await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS * 2);
		expect(read).toHaveBeenCalledTimes(1);
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

test.each([
	[401, "unauthenticated"],
	[403, "forbidden"],
	[404, "not_found"],
	[429, "unreachable"],
	[500, "unreachable"],
	[503, "unreachable"],
] as const)("HTTP %s is classified as %s", (status, issue) => {
	expect(assetReadIssue(status)).toBe(issue);
});
