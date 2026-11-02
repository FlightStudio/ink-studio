import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_DEADLINE_MS, requestDeadline } from "./request-deadline.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("request deadline", () => {
	it("aborts an unfinished request at the deadline and releases its timer", async () => {
		let signal: AbortSignal | undefined;
		const aborted = vi.fn();
		const result = requestDeadline((current) => {
			signal = current;
			return new Promise<never>((_resolve, reject) => {
				current.addEventListener(
					"abort",
					() => {
						aborted();
						reject(current.reason);
					},
					{ once: true },
				);
			});
		}).catch((error) => error);
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS - 1);
		expect(signal?.aborted).toBe(false);
		expect(aborted).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(await result).toMatchObject({ name: "AbortError" });
		expect(signal?.aborted).toBe(true);
		expect(aborted).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("returns a completed result and never aborts it later", async () => {
		let signal: AbortSignal | undefined;
		expect(
			await requestDeadline(async (current) => {
				signal = current;
				return "saved";
			}),
		).toBe("saved");
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
		expect(signal?.aborted).toBe(false);
	});

	it.each([false, true])(
		"clears its timer after rejection, including a synchronous throw: %s",
		async (synchronous) => {
			const failure = new Error("connection refused");
			await expect(
				requestDeadline(() => {
					if (synchronous) throw failure;
					return Promise.reject(failure);
				}),
			).rejects.toBe(failure);
			expect(vi.getTimerCount()).toBe(0);
		},
	);
});
