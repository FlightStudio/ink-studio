export type AutosaveState =
	| { status: "saved"; revision: number }
	| { status: "dirty"; revision: number; dueAt: number }
	| { status: "saving"; revision: number; dirtyAgain: boolean; attempt: number }
	| { status: "retrying"; revision: number; attempt: number; dueAt: number }
	| { status: "conflict"; revision: number };

export type AutosaveEvent =
	| { type: "edited"; now: number }
	| { type: "saveStarted" }
	| { type: "saveSucceeded"; revision: number; now: number }
	| { type: "saveFailed"; now: number }
	| { type: "saveConflicted" }
	| { type: "keptMine"; latestRevision: number; now: number };

export const SAVE_DELAY_MS = 800;
export const RETRY_FIRST_MS = 2000;
export const RETRY_MAX_MS = 30_000;

export function retryDelayMs(attempt: number): number {
	return Math.min(RETRY_FIRST_MS * 2 ** attempt, RETRY_MAX_MS);
}

export function autosave(
	state: AutosaveState,
	event: AutosaveEvent,
): AutosaveState {
	switch (event.type) {
		case "edited":
			if (state.status === "saved" || state.status === "dirty") {
				return {
					status: "dirty",
					revision: state.revision,
					dueAt: event.now + SAVE_DELAY_MS,
				};
			}
			if (state.status === "saving" && !state.dirtyAgain) {
				return { ...state, dirtyAgain: true };
			}
			return state;
		case "saveStarted":
			if (state.status === "dirty") {
				return {
					status: "saving",
					revision: state.revision,
					dirtyAgain: false,
					attempt: 0,
				};
			}
			if (state.status === "retrying") {
				return {
					status: "saving",
					revision: state.revision,
					dirtyAgain: false,
					attempt: state.attempt,
				};
			}
			return state;
		case "saveSucceeded":
			if (state.status !== "saving") return state;
			return state.dirtyAgain
				? { status: "dirty", revision: event.revision, dueAt: event.now }
				: { status: "saved", revision: event.revision };
		case "saveFailed":
			if (state.status !== "saving") return state;
			return {
				status: "retrying",
				revision: state.revision,
				attempt: state.attempt + 1,
				dueAt: event.now + retryDelayMs(state.attempt),
			};
		case "saveConflicted":
			if (state.status !== "saving") return state;
			return { status: "conflict", revision: state.revision };
		case "keptMine":
			if (state.status !== "conflict") return state;
			return {
				status: "dirty",
				revision: event.latestRevision,
				dueAt: event.now,
			};
	}
}
