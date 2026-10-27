import { describe, expect, it } from "vitest";
import { type AutosaveState, autosave } from "./autosave.ts";

describe("autosave", () => {
	it("an edit schedules a save after the delay", () => {
		const state = autosave(
			{ status: "saved", revision: 1 },
			{ type: "edited", now: 1000 },
		);
		expect(state).toEqual({ status: "dirty", revision: 1, dueAt: 1800 });
	});

	it("an edit during a save saves again with the new revision", () => {
		const saving: AutosaveState = {
			status: "saving",
			revision: 3,
			dirtyAgain: false,
			attempt: 0,
		};
		const edited = autosave(saving, { type: "edited", now: 5000 });
		const state = autosave(edited, {
			type: "saveSucceeded",
			revision: 4,
			now: 5200,
		});
		expect(state).toEqual({ status: "dirty", revision: 4, dueAt: 5200 });
	});

	it("a conflict holds edits without saving", () => {
		const saving: AutosaveState = {
			status: "saving",
			revision: 3,
			dirtyAgain: false,
			attempt: 0,
		};
		const conflicted = autosave(saving, { type: "saveConflicted" });
		const state = autosave(conflicted, { type: "edited", now: 6000 });
		expect(conflicted).toEqual({ status: "conflict", revision: 3 });
		expect(state).toEqual({ status: "conflict", revision: 3 });
	});

	it("keeping my version saves over the latest revision", () => {
		const state = autosave(
			{ status: "conflict", revision: 3 },
			{ type: "keptMine", latestRevision: 9, now: 7000 },
		);
		expect(state).toEqual({ status: "dirty", revision: 9, dueAt: 7000 });
	});

	it("failures back off and cap at thirty seconds", () => {
		let state: AutosaveState = { status: "dirty", revision: 2, dueAt: 0 };
		let now = 0;
		const waits: number[] = [];
		const attempts: number[] = [];
		for (let round = 0; round < 5; round += 1) {
			state = autosave(state, { type: "saveStarted" });
			if (state.status !== "saving") throw new Error(state.status);
			attempts.push(state.attempt);
			state = autosave(state, { type: "saveFailed", now });
			if (state.status !== "retrying") throw new Error(state.status);
			waits.push(state.dueAt - now);
			now = state.dueAt;
		}
		expect(waits).toEqual([2000, 4000, 8000, 16000, 30000]);
		expect(attempts).toEqual([0, 1, 2, 3, 4]);
		expect(state.revision).toBe(2);
	});

	it("an edit while waiting to retry keeps the wait", () => {
		const retrying: AutosaveState = {
			status: "retrying",
			revision: 2,
			attempt: 2,
			dueAt: 9000,
		};
		const state = autosave(retrying, { type: "edited", now: 8000 });
		expect(state).toEqual(retrying);
	});
});
