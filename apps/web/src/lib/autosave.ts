export type AutosaveState =
	| { status: "saved"; revision: number }
	| { status: "dirty"; revision: number; dueAt: number }
	| { status: "saving"; revision: number; dirtyAgain: boolean; attempt: number }
	| { status: "retrying"; revision: number; attempt: number; dueAt: number }
	| {
			status: "conflict";
			revision: number;
			resolving?: "keepMine" | "loadLatest";
			message?: string;
	  }
	| { status: "blocked"; revision: number; message: string };

export const SAVE_DELAY_MS = 800;
export const RETRY_FIRST_MS = 2000;
export const RETRY_MAX_MS = 30_000;

export function retryDelayMs(attempt: number): number {
	return Math.min(RETRY_FIRST_MS * 2 ** attempt, RETRY_MAX_MS);
}
