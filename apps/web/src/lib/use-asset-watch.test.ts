import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AssetWatchState, pollDelay } from "./asset-watch.ts";
import { REQUEST_DEADLINE_MS } from "./request-deadline.ts";
import { watchAssetStatus } from "./use-asset-watch.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it("aborts an unanswered status request and resumes polling the same asset", async () => {
	let signal: AbortSignal | null | undefined;
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockImplementationOnce((_url, options) => {
			signal = options?.signal;
			return new Promise<Response>((_resolve, reject) => {
				signal?.addEventListener("abort", () => reject(signal?.reason), {
					once: true,
				});
			});
		})
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "done", error: null }), {
				status: 200,
			}),
		);
	vi.stubGlobal("fetch", fetch);
	const states: AssetWatchState[] = [];
	const stop = watchAssetStatus("asset", (state) => states.push(state));
	await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS - 1);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(states).toEqual([]);
	await vi.advanceTimersByTimeAsync(1);
	expect(signal?.aborted).toBe(true);
	expect(states.at(-1)).toMatchObject({
		status: "pending",
		issue: "unreachable",
	});
	await vi.advanceTimersByTimeAsync(pollDelay(0));
	expect(fetch).toHaveBeenCalledTimes(2);
	expect(fetch.mock.calls.map(([url]) => url)).toEqual([
		"/api/assets/asset/status",
		"/api/assets/asset/status",
	]);
	expect(states.at(-1)).toMatchObject({ status: "done", issue: null });
	stop();
	expect(vi.getTimerCount()).toBe(0);
});
