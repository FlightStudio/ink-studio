import { parseLetterContent } from "@repo/render/schema";
import type { LetterContent, LetterResources } from "@repo/types";
import { normaliseLetterTitle, TITLE_MAX_CHARACTERS } from "@repo/types";
import { type AutosaveState, retryDelayMs, SAVE_DELAY_MS } from "./autosave.ts";

export type LetterDraft = {
	title: string;
	content: LetterContent;
	resources?: LetterResources;
};

export type LetterSaveResult =
	| { kind: "saved"; revision: number }
	| { kind: "conflict" }
	| { kind: "retry" }
	| { kind: "blocked"; message: string };

export type LetterReadResult =
	| { kind: "found"; letter: LetterDraft & { revision: number } }
	| { kind: "retry" }
	| { kind: "blocked"; message: string };

export type LetterSaveSnapshot = {
	id: string;
	generation: number;
	draft: LetterDraft;
	state: AutosaveState;
};

type Attempt = {
	draft: Pick<LetterDraft, "title" | "content">;
	revision: number;
	sequence: number;
	ambiguous: boolean;
};

type Entry = {
	value: LetterSaveSnapshot;
	sequence: number;
	attempt: Attempt | null;
	running: boolean;
	timer: ReturnType<typeof setTimeout> | undefined;
	listeners: Set<() => void>;
};

type Transport = {
	send(
		id: string,
		body: Pick<LetterDraft, "title" | "content"> & { expectedRevision: number },
	): Promise<LetterSaveResult>;
	read(id: string): Promise<LetterReadResult>;
};

const MAX_SAVED_DRAFTS = 20;

function normalise(draft: LetterDraft): Pick<LetterDraft, "title" | "content"> {
	const title = normaliseLetterTitle(draft.title);
	if (title === null) {
		throw new Error(
			`Choose a title of up to ${TITLE_MAX_CHARACTERS} characters.`,
		);
	}
	return { title, content: parseLetterContent(draft.content) };
}

function ordered(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(ordered);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, ordered(item)]),
	);
}

export function sameLetterDraft(
	left: LetterDraft,
	right: LetterDraft,
): boolean {
	try {
		return (
			JSON.stringify(ordered(normalise(left))) ===
			JSON.stringify(ordered(normalise(right)))
		);
	} catch {
		return false;
	}
}

export function createLetterSaves(transport: Transport) {
	const entries = new Map<string, Entry>();
	const listeners = new Set<() => void>();
	let pending: LetterSaveSnapshot[] = [];

	function entryFor(id: string): Entry {
		const entry = entries.get(id);
		if (!entry) throw new Error(`No save owner for letter ${id}`);
		return entry;
	}

	function emit(entry: Entry, state: AutosaveState = entry.value.state) {
		entry.value = { ...entry.value, state };
		pending = [...entries.values()]
			.map((item) => item.value)
			.filter((item) => item.state.status !== "saved");
		for (const listener of entry.listeners) listener();
		for (const listener of listeners) listener();
	}

	function schedule(entry: Entry) {
		clearTimeout(entry.timer);
		const state = entry.value.state;
		if (
			entry.running ||
			(state.status !== "dirty" && state.status !== "retrying")
		) {
			return;
		}
		entry.timer = setTimeout(
			() => void run(entry),
			Math.max(0, state.dueAt - Date.now()),
		);
	}

	function blocked(entry: Entry, message: string) {
		emit(entry, {
			status: "blocked",
			revision: entry.value.state.revision,
			message,
		});
	}

	function acknowledge(entry: Entry, attempt: Attempt, revision: number) {
		entry.attempt = null;
		emit(
			entry,
			entry.sequence === attempt.sequence
				? { status: "saved", revision }
				: { status: "dirty", revision, dueAt: Date.now() },
		);
	}

	function beginResolution(
		entry: Entry,
		resolving: "keepMine" | "loadLatest",
	): boolean {
		const state = entry.value.state;
		if (state.status !== "conflict" || state.resolving) return false;
		emit(entry, { status: "conflict", revision: state.revision, resolving });
		return true;
	}

	function resolutionFailed(entry: Entry, message: string) {
		if (entry.value.state.status !== "conflict") return;
		emit(entry, {
			status: "conflict",
			revision: entry.value.state.revision,
			message,
		});
	}

	async function reconcile(entry: Entry, attempt: Attempt): Promise<boolean> {
		const result = await transport
			.read(entry.value.id)
			.catch(() => ({ kind: "retry" }) as const);
		if (result.kind === "blocked") {
			blocked(entry, result.message);
			return true;
		}
		if (result.kind !== "found") return false;
		if (
			result.letter.revision > attempt.revision &&
			sameLetterDraft(attempt.draft, result.letter)
		) {
			acknowledge(entry, attempt, result.letter.revision);
			return true;
		}
		if (result.letter.revision !== attempt.revision) {
			emit(entry, { status: "conflict", revision: attempt.revision });
			return true;
		}
		return false;
	}

	async function run(entry: Entry) {
		const previous = entry.value.state;
		if (
			entry.running ||
			(previous.status !== "dirty" && previous.status !== "retrying")
		) {
			return;
		}
		clearTimeout(entry.timer);
		if (!entry.attempt) {
			try {
				entry.attempt = {
					draft: normalise(structuredClone(entry.value.draft)),
					revision: previous.revision,
					sequence: entry.sequence,
					ambiguous: false,
				};
			} catch {
				blocked(
					entry,
					"These changes could not be saved. Download your draft before leaving.",
				);
				return;
			}
		}
		const attempt = entry.attempt;
		const retries = previous.status === "retrying" ? previous.attempt : 0;
		entry.running = true;
		emit(entry, {
			status: "saving",
			revision: attempt.revision,
			dirtyAgain: entry.sequence > attempt.sequence,
			attempt: retries,
		});
		try {
			const result = await transport
				.send(entry.value.id, {
					...attempt.draft,
					expectedRevision: attempt.revision,
				})
				.catch(() => ({ kind: "retry" }) as const);
			if (result.kind === "saved") {
				acknowledge(entry, attempt, result.revision);
			} else if (result.kind === "blocked") {
				if (!attempt.ambiguous) entry.attempt = null;
				blocked(entry, result.message);
			} else {
				if (result.kind === "retry") attempt.ambiguous = true;
				if (!(await reconcile(entry, attempt))) {
					emit(entry, {
						status: "retrying",
						revision: attempt.revision,
						attempt: retries + 1,
						dueAt: Date.now() + retryDelayMs(retries),
					});
				}
			}
		} finally {
			entry.running = false;
			schedule(entry);
		}
	}

	return {
		open(
			id: string,
			initial: LetterDraft & { revision: number },
		): LetterSaveSnapshot {
			const existing = entries.get(id);
			if (
				existing &&
				(existing.value.state.status !== "saved" ||
					existing.value.state.revision > initial.revision)
			) {
				return existing.value;
			}
			const { revision, ...draft } = structuredClone(initial);
			if (existing) {
				existing.value = {
					...existing.value,
					draft,
					state: { status: "saved", revision },
				};
				return existing.value;
			}
			for (const [key, item] of entries) {
				if (entries.size < MAX_SAVED_DRAFTS) break;
				if (item.value.state.status === "saved" && item.listeners.size === 0)
					entries.delete(key);
			}
			const entry: Entry = {
				value: {
					id,
					generation: 0,
					draft,
					state: { status: "saved", revision },
				},
				sequence: 0,
				attempt: null,
				running: false,
				timer: undefined,
				listeners: new Set(),
			};
			entries.set(id, entry);
			return entry.value;
		},
		snapshot: (id: string) => entryFor(id).value,
		pending: () => pending,
		subscribe(id: string, listener: () => void) {
			const entry = entryFor(id);
			entry.listeners.add(listener);
			return () => {
				entry.listeners.delete(listener);
			};
		},
		subscribeAll(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		edit(id: string, draft: LetterDraft) {
			const entry = entryFor(id);
			entry.sequence += 1;
			entry.value = { ...entry.value, draft: structuredClone(draft) };
			const previous = entry.value.state;
			const state: AutosaveState =
				previous.status === "saved" || previous.status === "dirty"
					? {
							status: "dirty",
							revision: previous.revision,
							dueAt: Date.now() + SAVE_DELAY_MS,
						}
					: previous.status === "saving"
						? { ...previous, dirtyAgain: true }
						: previous;
			emit(entry, state);
			schedule(entry);
		},
		resources(id: string, resources: LetterResources) {
			const entry = entryFor(id);
			entry.value = {
				...entry.value,
				draft: { ...entry.value.draft, resources: structuredClone(resources) },
			};
			emit(entry);
		},
		flush(id: string) {
			return run(entryFor(id));
		},
		retry(id: string) {
			const entry = entryFor(id);
			if (entry.value.state.status === "blocked") {
				emit(entry, {
					status: "dirty",
					revision: entry.value.state.revision,
					dueAt: Date.now(),
				});
			}
			return run(entry);
		},
		async keepMine(id: string) {
			const entry = entryFor(id);
			if (!beginResolution(entry, "keepMine")) return;
			const latest = await transport
				.read(id)
				.catch(() => ({ kind: "retry" }) as const);
			if (latest.kind !== "found") {
				resolutionFailed(
					entry,
					latest.kind === "blocked"
						? latest.message
						: "Could not load the saved version. Try again.",
				);
				return;
			}
			if (entry.value.state.status !== "conflict") return;
			entry.attempt = null;
			emit(entry, {
				status: "dirty",
				revision: latest.letter.revision,
				dueAt: Date.now(),
			});
			await run(entry);
		},
		async loadLatest(id: string): Promise<boolean> {
			const entry = entryFor(id);
			if (!beginResolution(entry, "loadLatest")) return false;
			const sequence = entry.sequence;
			const latest = await transport
				.read(id)
				.catch(() => ({ kind: "retry" }) as const);
			if (latest.kind !== "found") {
				resolutionFailed(
					entry,
					latest.kind === "blocked"
						? latest.message
						: "Could not load the saved version. Try again.",
				);
				return false;
			}
			if (entry.value.state.status !== "conflict") return false;
			if (entry.sequence !== sequence) {
				resolutionFailed(
					entry,
					"Your new changes are still here. Choose again when you are ready.",
				);
				return false;
			}
			entry.attempt = null;
			const { revision, ...draft } = latest.letter;
			entry.value = {
				...entry.value,
				generation: entry.value.generation + 1,
				draft: structuredClone(draft),
			};
			emit(entry, { status: "saved", revision });
			return true;
		},
	};
}

export type LetterSaves = ReturnType<typeof createLetterSaves>;
