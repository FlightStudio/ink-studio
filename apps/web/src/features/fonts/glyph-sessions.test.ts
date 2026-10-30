import { HANDWRITING_GLYPHS, type Stroke } from "@repo/types";
import { describe, expect, it, vi } from "vitest";
import {
	REQUEST_DEADLINE_MS,
	requestDeadline,
} from "../../lib/request-deadline.ts";
import {
	addStroke,
	canUndo,
	strokesOf,
	undo,
	undoTarget,
} from "./glyph-history.ts";
import type { SaveResult } from "./glyph-saves.ts";
import { createGlyphSessions } from "./glyph-sessions.ts";

function stroke(x: number): Stroke {
	return { input: "pen", points: [[x, 500, 0.5, 0]] };
}

function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function flush() {
	for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

const font = { id: "font", ownerName: "Karla", glyphs: [] };

describe("studio glyph sessions", () => {
	it("retains failed strokes, undo history, and retry after leaving and reopening", async () => {
		const send = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, error: null })
			.mockResolvedValue({ ok: true });
		const sessions = createGlyphSessions({ send, build: vi.fn() });
		const first = sessions.open(font);
		const detach = first.subscribe(() => {});
		first.apply(addStroke(first.snapshot().history, "a:0", stroke(1)), "a:0");
		await first.idle();
		detach();
		const reopened = sessions.open(font);
		expect(reopened).toBe(first);
		expect(reopened.snapshot().pending).toBe(true);
		expect(reopened.snapshot().errors).toEqual({ "a:0": null });
		expect(strokesOf(reopened.snapshot().history, "a:0")).toEqual([stroke(1)]);
		expect(canUndo(reopened.snapshot().history)).toBe(true);
		expect(sessions.pending()).toHaveLength(1);
		reopened.retry();
		await reopened.idle();
		expect(send).toHaveBeenLastCalledWith("font", "a:0", [stroke(1)]);
		expect(reopened.snapshot().pending).toBe(false);
		expect(reopened.snapshot().errors).toEqual({});
		const history = reopened.snapshot().history;
		reopened.apply(undo(history), undoTarget(history));
		await reopened.idle();
		expect(send).toHaveBeenLastCalledWith("font", "a:0", []);
	});

	it("a returning grid joins the existing in-flight cell queue", async () => {
		const firstWrite = deferred<SaveResult>();
		const secondWrite = deferred<SaveResult>();
		const send = vi
			.fn()
			.mockReturnValueOnce(firstWrite.promise)
			.mockReturnValueOnce(secondWrite.promise);
		const sessions = createGlyphSessions({ send, build: vi.fn() });
		const first = sessions.open(font);
		const detach = first.subscribe(() => {});
		first.apply(addStroke(first.snapshot().history, "a:0", stroke(1)), "a:0");
		await flush();
		detach();
		const reopened = sessions.open(font);
		const changed = vi.fn();
		reopened.subscribe(changed);
		reopened.apply(
			addStroke(reopened.snapshot().history, "a:0", stroke(2)),
			"a:0",
		);
		await flush();
		expect(send).toHaveBeenCalledTimes(1);
		firstWrite.resolve({ ok: true });
		await flush();
		expect(send).toHaveBeenCalledTimes(2);
		expect(send).toHaveBeenLastCalledWith("font", "a:0", [
			stroke(1),
			stroke(2),
		]);
		secondWrite.resolve({ ok: true });
		await reopened.idle();
		expect(reopened.snapshot().pending).toBe(false);
		expect(changed).toHaveBeenCalled();
	});

	it("keeps clean local history on remount instead of guessing which unversioned server cells are newer", async () => {
		const sessions = createGlyphSessions({
			send: async () => ({ ok: true }),
			build: vi.fn(),
		});
		const first = sessions.open(font);
		first.apply(addStroke(first.snapshot().history, "a:0", stroke(1)), "a:0");
		await first.idle();
		expect(
			sessions.open({
				...font,
				glyphs: [{ char: "a", variant: 0, strokes: [stroke(2)] }],
			}),
		).toBe(first);
		expect(strokesOf(first.snapshot().history, "a:0")).toEqual([stroke(1)]);
		expect(canUndo(first.snapshot().history)).toBe(true);
	});

	it("keeps the build boundary across navigation and releases it when the request settles", async () => {
		const built = deferred<SaveResult>();
		const build = vi.fn().mockReturnValue(built.promise);
		const sessions = createGlyphSessions({
			send: async () => ({ ok: true }),
			build,
		});
		const complete = {
			...font,
			glyphs: HANDWRITING_GLYPHS.filter((entry) => entry.required).map(
				({ char }) => ({ char, variant: 0, strokes: [stroke(1)] }),
			),
		};
		const first = sessions.open(complete);
		expect(first.pointerDown(7)).toBe(true);
		expect(await first.build()).toBe(false);
		first.pointerEnd(7);
		const building = first.build();
		await flush();
		const reopened = sessions.open(complete);
		expect(reopened.snapshot().building).toBe(true);
		expect(reopened.pointerDown(8)).toBe(false);
		const before = reopened.snapshot().history;
		reopened.apply(addStroke(before, "a:0", stroke(2)), "a:0");
		expect(reopened.snapshot().history).toBe(before);
		expect(await reopened.build()).toBe(false);
		expect(build).toHaveBeenCalledTimes(1);
		built.resolve({ ok: true });
		expect(await building).toBe(true);
		expect(reopened.snapshot().building).toBe(false);
		expect(reopened.pointerDown(8)).toBe(true);
	});

	it("never evicts a pending session while bounding inactive saved sessions", async () => {
		const sessions = createGlyphSessions({
			send: async () => ({ ok: false, error: null }),
			build: vi.fn(),
		});
		const pending = sessions.open(font);
		pending.apply(
			addStroke(pending.snapshot().history, "a:0", stroke(1)),
			"a:0",
		);
		await pending.idle();
		const clean = sessions.open({ ...font, id: "clean" });
		for (let index = 0; index < 30; index += 1)
			sessions.open({ ...font, id: `font-${index}` });
		expect(sessions.open(font)).toBe(pending);
		expect(sessions.open({ ...font, id: "clean" })).not.toBe(clean);
	});

	it("releases the drawing gate when a build request reaches its deadline", async () => {
		vi.useFakeTimers();
		try {
			const sessions = createGlyphSessions({
				send: async () => ({ ok: true }),
				build: () =>
					requestDeadline(
						(signal) =>
							new Promise<SaveResult>((_resolve, reject) => {
								signal.addEventListener("abort", () => reject(signal.reason), {
									once: true,
								});
							}),
					),
			});
			const session = sessions.open({
				...font,
				glyphs: HANDWRITING_GLYPHS.filter((entry) => entry.required).map(
					({ char }) => ({ char, variant: 0, strokes: [stroke(1)] }),
				),
			});
			const building = session.build();
			await vi.advanceTimersByTimeAsync(0);
			expect(session.snapshot().building).toBe(true);
			expect(session.pointerDown(8)).toBe(false);
			await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
			expect(await building).toBe(false);
			expect(session.snapshot().building).toBe(false);
			expect(session.snapshot().buildError).not.toBeNull();
			expect(session.pointerDown(8)).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
