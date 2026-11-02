import type { Stroke } from "@repo/types";
import { describe, expect, test } from "vitest";
import { glyphSaves, type SaveResult } from "./glyph-saves.ts";

function stroke(x: number): Stroke {
	return { input: "pen", points: [[x, 500, 0.5, 0]] };
}

type Sent = {
	key: string;
	strokes: readonly Stroke[];
	settle(result: SaveResult): void;
};

function harness() {
	const sent: Sent[] = [];
	const failures: {
		key: string;
		error: string | null;
	}[] = [];
	const pending: boolean[] = [];
	const saves = glyphSaves({
		send: (key, strokes) =>
			new Promise<SaveResult>((resolve) => {
				sent.push({ key, strokes, settle: resolve });
			}),
		onFailed: (key, error) => failures.push({ key, error }),
		onPending: (value) => pending.push(value),
	});
	return { saves, sent, failures, pending };
}

async function flush(): Promise<void> {
	for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe("glyphSaves", () => {
	test("a burst of changes to one cell sends the first and then only the last", async () => {
		const { saves, sent } = harness();
		saves.save("a:0", [stroke(1)]);
		await flush();
		saves.save("a:0", [stroke(1), stroke(2)]);
		saves.save("a:0", [stroke(1), stroke(2), stroke(3)]);
		saves.save("a:0", [stroke(1)]);
		await flush();
		expect(sent.map((each) => each.strokes)).toEqual([[stroke(1)]]);
		sent[0]?.settle({ ok: true });
		await flush();
		expect(sent.map((each) => each.strokes)).toEqual([
			[stroke(1)],
			[stroke(1)],
		]);
		sent[1]?.settle({ ok: true });
		await saves.idle();
		expect(sent).toHaveLength(2);
	});

	test("changes in the same moment send once", async () => {
		const { saves, sent } = harness();
		saves.save("a:0", [stroke(1)]);
		saves.save("a:0", []);
		await flush();
		expect(sent.map((each) => each.strokes)).toEqual([[]]);
	});

	test("different cells save side by side", async () => {
		const { saves, sent } = harness();
		saves.save("a:0", [stroke(1)]);
		saves.save("b:0", [stroke(2)]);
		await flush();
		expect(sent.map((each) => each.key)).toEqual(["a:0", "b:0"]);
	});

	test("idle waits for every cell, including a change queued during a save", async () => {
		const { saves, sent } = harness();
		saves.save("a:0", [stroke(1)]);
		await flush();
		saves.save("a:0", [stroke(2)]);
		let done = false;
		const idle = saves.idle().then(() => {
			done = true;
		});
		sent[0]?.settle({ ok: true });
		await flush();
		expect(done).toBe(false);
		sent[1]?.settle({ ok: true });
		await idle;
		expect(done).toBe(true);
	});

	test("idle is settled at once when nothing is saving", async () => {
		const { saves } = harness();
		await expect(saves.idle()).resolves.toBeUndefined();
	});

	test("a failed save retains the newest strokes for an explicit retry", async () => {
		const { saves, sent, failures, pending } = harness();
		saves.save("a:0", [stroke(1), stroke(2)]);
		await flush();
		saves.save("a:0", [stroke(1), stroke(2), stroke(3)]);
		sent[0]?.settle({ ok: false, error: "invalid_glyphs" });
		await saves.idle();
		expect(saves.pending()).toBe(true);
		expect(pending).toEqual([true]);
		expect(failures).toHaveLength(1);
		expect(sent).toHaveLength(1);
		saves.retry();
		await flush();
		expect(sent[1]?.strokes).toEqual([stroke(1), stroke(2), stroke(3)]);
		sent[1]?.settle({ ok: true });
		await saves.idle();
		expect(saves.pending()).toBe(false);
		expect(pending).toEqual([true, false]);
	});

	test("a new edit replaces failed work and other cells still save", async () => {
		const { saves, sent } = harness();
		saves.save("a:0", [stroke(1)]);
		await flush();
		sent[0]?.settle({ ok: false, error: null });
		await saves.idle();
		saves.save("b:0", [stroke(2)]);
		await flush();
		sent[1]?.settle({ ok: true });
		await saves.idle();
		expect(saves.pending()).toBe(true);
		saves.save("a:0", []);
		await flush();
		expect(sent[2]?.strokes).toEqual([]);
		sent[2]?.settle({ ok: true });
		await saves.idle();
		expect(saves.pending()).toBe(false);
	});

	test("a send that throws counts as a failure with no code", async () => {
		const failures: (string | null)[] = [];
		const saves = glyphSaves({
			send: () => Promise.reject(new Error("offline")),
			onFailed: (_key, error) => failures.push(error),
		});
		saves.save("a:0", [stroke(1)]);
		await saves.idle();
		expect(failures).toEqual([null]);
	});

	test("reports when saving starts and when everything is saved", async () => {
		const { saves, sent, pending } = harness();
		saves.save("a:0", [stroke(1)]);
		saves.save("b:0", [stroke(2)]);
		await flush();
		sent[0]?.settle({ ok: true });
		await flush();
		expect(pending).toEqual([true]);
		sent[1]?.settle({ ok: true });
		await saves.idle();
		expect(pending).toEqual([true, false]);
		expect(saves.pending()).toBe(false);
	});

	test("idle still settles when handling a failure throws", async () => {
		const pending: boolean[] = [];
		const saves = glyphSaves({
			send: async () => ({ ok: false, error: null }),
			onFailed: () => {
				throw new Error("handler broke");
			},
			onPending: (value) => pending.push(value),
		});
		saves.save("a:0", [stroke(1)]);
		await expect(saves.idle()).resolves.toBeUndefined();
		expect(saves.pending()).toBe(true);
		expect(pending).toEqual([true]);
	});
});
