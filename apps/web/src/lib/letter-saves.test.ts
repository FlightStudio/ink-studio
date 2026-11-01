import { letterStateSchema } from "@repo/api";
import type { LetterContent } from "@repo/types";
import { normaliseLetterTitle, TITLE_MAX_CHARACTERS } from "@repo/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createLetterSaves,
	type LetterDraft,
	type LetterReadResult,
	type LetterSaveResult,
	sameLetterDraft,
} from "./letter-saves.ts";
import { REQUEST_DEADLINE_MS, requestDeadline } from "./request-deadline.ts";

function draft(text: string): LetterDraft {
	return {
		title: "For Alex",
		content: {
			schemaVersion: 1,
			format: "thanksio:letter-windowless",
			defaults: {
				font: { kind: "stock", id: "caveat" },
				sizePt: 20,
				color: "ink-blue",
			},
			doc: {
				type: "doc",
				attrs: { elements: [], minSides: 1, frontImageAssetId: null },
				content: [
					{
						type: "paragraph",
						attrs: { align: "left" },
						content: text ? [{ type: "text", text }] : [],
					},
				],
			},
		},
	};
}

function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function setup() {
	const send =
		vi.fn<
			(
				id: string,
				body: LetterDraft & { expectedRevision: number },
			) => Promise<LetterSaveResult>
		>();
	const read = vi.fn<(id: string) => Promise<LetterReadResult>>();
	const saves = createLetterSaves({ send, read });
	saves.open("letter", { ...draft(""), revision: 1 });
	return { saves, send, read };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("letter save ownership", () => {
	it("the letter read contract carries render resources with its document revision", () => {
		const resources = {
			assetBaseUrl: "/api/assets/",
			stockFontBaseUrl: "/fonts/stock/",
			fonts: {
				"11111111-1111-4111-8111-111111111111":
					"22222222-2222-4222-8222-222222222222",
			},
			drawings: {
				"33333333-3333-4333-8333-333333333333": {
					maskAssetId: "44444444-4444-4444-8444-444444444444",
					aspect: 2,
				},
			},
			frontImageAssetId: null,
		};
		const body = { ...draft("Latest assets"), revision: 2, resources };
		expect(letterStateSchema.parse(body)).toEqual(body);
		expect(
			letterStateSchema.safeParse({ ...draft("Missing assets"), revision: 2 })
				.success,
		).toBe(false);
	});

	it("loading the latest replaces content and its exact font and drawing resources together", async () => {
		const { saves, send, read } = setup();
		const resources = {
			assetBaseUrl: "/api/assets/",
			stockFontBaseUrl: "/fonts/stock/",
			fonts: { handwriting: "new-font-build" },
			drawings: { doodle: { maskAssetId: "new-mask", aspect: 2 } },
			frontImageAssetId: null,
		};
		const latest = { ...draft("New document"), revision: 2, resources };
		send.mockResolvedValue({ kind: "conflict" });
		read.mockResolvedValue({ kind: "found", letter: latest });
		saves.edit("letter", draft("My older branch"));
		await saves.flush("letter");
		expect(await saves.loadLatest("letter")).toBe(true);
		expect(saves.snapshot("letter").draft).toEqual({
			...draft("New document"),
			resources,
		});
		resources.fonts.handwriting = "changed-after-load";
		expect(saves.snapshot("letter").draft.resources?.fonts.handwriting).toBe(
			"new-font-build",
		);
	});

	it("sends titles with the shared server normalisation and retains invalid titles locally", async () => {
		const { saves, send } = setup();
		send.mockResolvedValue({ kind: "saved", revision: 2 });
		const title = ` \t${"😀".repeat(TITLE_MAX_CHARACTERS)}\n`;
		saves.edit("letter", { ...draft("Words"), title });
		await saves.flush("letter");
		expect(send.mock.calls[0]?.[1].title).toBe(normaliseLetterTitle(title));
		saves.edit("letter", { ...draft("Words"), title: "Dear\nAlex" });
		await saves.flush("letter");
		expect(send).toHaveBeenCalledTimes(1);
		expect(saves.snapshot("letter").draft.title).toBe("Dear\nAlex");
		expect(saves.snapshot("letter").state.status).toBe("blocked");
	});

	it("drains newer edits after the editor unsubscribes and uses the acknowledged revision", async () => {
		const { saves, send } = setup();
		const first = deferred<LetterSaveResult>();
		const second = deferred<LetterSaveResult>();
		send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const detach = saves.subscribe("letter", () => {});
		saves.edit("letter", draft("First request"));
		await vi.advanceTimersByTimeAsync(800);
		saves.edit("letter", draft("Newer words"));
		detach();
		first.resolve({ kind: "saved", revision: 2 });
		await vi.advanceTimersByTimeAsync(0);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[1]?.[1]).toEqual({
			...draft("Newer words"),
			expectedRevision: 2,
		});
		expect(saves.snapshot("letter").state.status).toBe("saving");
		second.resolve({ kind: "saved", revision: 3 });
		await vi.advanceTimersByTimeAsync(0);
		expect(saves.snapshot("letter").state).toEqual({
			status: "saved",
			revision: 3,
		});
	});

	it("restores pending content when a stale route is opened again", () => {
		const { saves } = setup();
		saves.edit("letter", draft("Still here"));
		const reopened = saves.open("letter", { ...draft(""), revision: 1 });
		expect(reopened.draft).toEqual(draft("Still here"));
		expect(reopened.state.status).toBe("dirty");
		expect(saves.pending()).toHaveLength(1);
	});

	it("keeps saved content newer than a cached Back navigation response", async () => {
		const { saves, send } = setup();
		send.mockResolvedValue({ kind: "saved", revision: 2 });
		saves.edit("letter", draft("Saved while away"));
		await vi.advanceTimersByTimeAsync(800);
		expect(saves.open("letter", { ...draft(""), revision: 1 }).draft).toEqual(
			draft("Saved while away"),
		);
	});

	it("reconciles a lost acknowledgement without acknowledging newer local edits", async () => {
		const { saves, send, read } = setup();
		const first = deferred<LetterSaveResult>();
		const second = deferred<LetterSaveResult>();
		send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		read.mockResolvedValue({
			kind: "found",
			letter: { ...draft("Sent"), revision: 2 },
		});
		saves.edit("letter", draft("Sent"));
		await vi.advanceTimersByTimeAsync(800);
		saves.edit("letter", draft("Not yet sent"));
		first.resolve({ kind: "retry" });
		await vi.advanceTimersByTimeAsync(0);
		expect(send.mock.calls[1]?.[1]).toEqual({
			...draft("Not yet sent"),
			expectedRevision: 2,
		});
		expect(saves.snapshot("letter").state.status).toBe("saving");
	});

	it("reconciles a timed-out write before draining newer edits at its committed revision", async () => {
		const { saves, send, read } = setup();
		send
			.mockImplementationOnce(() =>
				requestDeadline(
					(signal) =>
						new Promise<LetterSaveResult>((_resolve, reject) => {
							signal.addEventListener("abort", () => reject(signal.reason), {
								once: true,
							});
						}),
				),
			)
			.mockResolvedValueOnce({ kind: "saved", revision: 3 });
		read.mockResolvedValue({
			kind: "found",
			letter: { ...draft("Committed before timeout"), revision: 2 },
		});
		saves.edit("letter", draft("Committed before timeout"));
		await vi.advanceTimersByTimeAsync(800);
		saves.edit("letter", draft("Typed during the stalled request"));
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
		await vi.advanceTimersByTimeAsync(1);
		expect(read).toHaveBeenCalledOnce();
		expect(send.mock.calls[1]?.[1]).toEqual({
			...draft("Typed during the stalled request"),
			expectedRevision: 2,
		});
		expect(saves.snapshot("letter").state).toEqual({
			status: "saved",
			revision: 3,
		});
	});

	it("releases conflict controls when the resolution read times out", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValueOnce({ kind: "conflict" });
		read.mockResolvedValueOnce({
			kind: "found",
			letter: { ...draft("Remote branch"), revision: 2 },
		});
		saves.edit("letter", draft("Local branch"));
		await saves.flush("letter");
		read.mockImplementationOnce(() =>
			requestDeadline(
				(signal) =>
					new Promise<LetterReadResult>((_resolve, reject) => {
						signal.addEventListener("abort", () => reject(signal.reason), {
							once: true,
						});
					}),
			),
		);
		const loading = saves.loadLatest("letter");
		expect(saves.snapshot("letter").state).toMatchObject({
			resolving: "loadLatest",
		});
		await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
		expect(await loading).toBe(false);
		expect(saves.snapshot("letter").state).toMatchObject({
			status: "conflict",
			message: expect.any(String),
		});
		expect(saves.snapshot("letter").state).not.toHaveProperty("resolving");
		expect(saves.snapshot("letter").draft).toEqual(draft("Local branch"));
	});

	it("retries the exact attempted payload while newer edits wait", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValue({ kind: "retry" });
		read.mockResolvedValue({ kind: "retry" });
		const first = draft("Original attempt");
		saves.edit("letter", first);
		await vi.advanceTimersByTimeAsync(800);
		first.title = "Mutated outside";
		saves.edit("letter", draft("Later edit"));
		await vi.advanceTimersByTimeAsync(2000);
		expect(send.mock.calls[0]?.[1]).toEqual(send.mock.calls[1]?.[1]);
		expect(send.mock.calls[1]?.[1].title).toBe("For Alex");
		expect(saves.snapshot("letter").draft).toEqual(draft("Later edit"));
	});

	it("does not treat equal content at the old revision as acknowledgement of an unresolved write", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValue({ kind: "retry" });
		read.mockResolvedValue({
			kind: "found",
			letter: { ...draft(""), revision: 1 },
		});
		saves.edit("letter", draft(""));
		await vi.advanceTimersByTimeAsync(800);
		expect(saves.snapshot("letter").state.status).toBe("retrying");
		saves.edit("letter", draft("A later edit"));
		await vi.advanceTimersByTimeAsync(2000);
		expect(send.mock.calls[1]?.[1]).toEqual({
			...draft(""),
			expectedRevision: 1,
		});
	});

	it("keeps an ambiguous attempt intact when reconciliation is temporarily refused", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValue({ kind: "retry" });
		read.mockResolvedValue({ kind: "blocked", message: "Sign in again." });
		saves.edit("letter", draft("Unknown outcome"));
		await vi.advanceTimersByTimeAsync(800);
		saves.edit("letter", draft("Newer branch"));
		await saves.retry("letter");
		expect(send.mock.calls[1]?.[1]).toEqual({
			...draft("Unknown outcome"),
			expectedRevision: 1,
		});
	});

	it("preserves an earlier ambiguous attempt through a later refused retry", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValueOnce({ kind: "retry" });
		read.mockResolvedValueOnce({ kind: "retry" });
		saves.edit("letter", draft("Committed without acknowledgement"));
		await saves.flush("letter");
		saves.edit("letter", draft("Newer local words"));
		send.mockResolvedValueOnce({ kind: "blocked", message: "Sign in again." });
		await saves.retry("letter");
		send.mockResolvedValueOnce({ kind: "conflict" });
		read.mockResolvedValueOnce({
			kind: "found",
			letter: { ...draft("Committed without acknowledgement"), revision: 2 },
		});
		await saves.retry("letter");
		expect(send.mock.calls[2]?.[1]).toEqual(send.mock.calls[0]?.[1]);
		expect(saves.snapshot("letter").state).toMatchObject({
			status: "dirty",
			revision: 2,
		});
		send.mockResolvedValueOnce({ kind: "saved", revision: 3 });
		await saves.flush("letter");
		expect(send.mock.calls[3]?.[1]).toEqual({
			...draft("Newer local words"),
			expectedRevision: 2,
		});
		expect(saves.snapshot("letter").state).toEqual({
			status: "saved",
			revision: 3,
		});
	});

	it("can retry corrected content after a definite server refusal", async () => {
		const { saves, send } = setup();
		send.mockResolvedValueOnce({ kind: "blocked", message: "Invalid letter" });
		send.mockResolvedValueOnce({ kind: "saved", revision: 2 });
		saves.edit("letter", draft("Refused"));
		await vi.advanceTimersByTimeAsync(800);
		saves.edit("letter", draft("Corrected"));
		await saves.retry("letter");
		expect(send.mock.calls[1]?.[1]).toEqual({
			...draft("Corrected"),
			expectedRevision: 1,
		});
		expect(saves.snapshot("letter").state.status).toBe("saved");
	});

	it("keeps newly placed drawing and font resources when reopening an unsaved letter", () => {
		const { saves } = setup();
		saves.edit("letter", draft("Pending artwork"));
		const resources = {
			assetBaseUrl: "/api/assets/",
			stockFontBaseUrl: "/fonts/stock/",
			fonts: { handwriting: "font-version" },
			drawings: { doodle: { maskAssetId: "mask", aspect: 2 } },
			frontImageAssetId: null,
		};
		saves.resources("letter", resources);
		expect(
			saves.open("letter", { ...draft(""), revision: 1 }).draft.resources,
		).toEqual(resources);
	});

	it("preserves both the local branch and a genuine competing server version", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValue({ kind: "conflict" });
		read.mockResolvedValue({
			kind: "found",
			letter: { ...draft("Another writer"), revision: 2 },
		});
		saves.edit("letter", draft("My words"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(saves.snapshot("letter").state.status).toBe("conflict");
		expect(saves.snapshot("letter").draft).toEqual(draft("My words"));
	});

	it("keeps newer typing when loading a competing version takes time", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValue({ kind: "conflict" });
		read.mockResolvedValueOnce({
			kind: "found",
			letter: { ...draft("Another writer"), revision: 2 },
		});
		saves.edit("letter", draft("My words"));
		await saves.flush("letter");
		const latest = deferred<LetterReadResult>();
		read.mockReturnValueOnce(latest.promise);
		const loading = saves.loadLatest("letter");
		saves.edit("letter", draft("Typed after asking to load"));
		latest.resolve({
			kind: "found",
			letter: { ...draft("Another writer"), revision: 2 },
		});
		expect(await loading).toBe(false);
		expect(saves.snapshot("letter").draft).toEqual(
			draft("Typed after asking to load"),
		);
		expect(saves.snapshot("letter").state.status).toBe("conflict");
		expect(saves.snapshot("letter").state).not.toHaveProperty("resolving");
	});

	it.each(["keepMine", "loadLatest"] as const)(
		"owns a pending %s choice before a competing conflict action can start",
		async (first) => {
			const { saves, send, read } = setup();
			send.mockResolvedValueOnce({ kind: "conflict" });
			const server = {
				kind: "found",
				letter: { ...draft("Another writer"), revision: 2 },
			} as const;
			read.mockResolvedValueOnce(server);
			saves.edit("letter", draft("My words"));
			await saves.flush("letter");
			const held = deferred<LetterReadResult>();
			read.mockReturnValueOnce(held.promise);
			const action = saves[first]("letter");
			expect(saves.snapshot("letter").state).toMatchObject({
				status: "conflict",
				resolving: first,
			});
			await saves[first === "keepMine" ? "loadLatest" : "keepMine"]("letter");
			expect(read).toHaveBeenCalledTimes(2);
			send.mockResolvedValueOnce({ kind: "saved", revision: 3 });
			held.resolve(server);
			await action;
			expect(saves.snapshot("letter").state.status).toBe("saved");
			expect(saves.snapshot("letter").draft).toEqual(
				draft(first === "keepMine" ? "My words" : "Another writer"),
			);
		},
	);

	it.each(["keepMine", "loadLatest"] as const)(
		"releases a failed %s choice for an explicit retry",
		async (choice) => {
			const { saves, send, read } = setup();
			send.mockResolvedValueOnce({ kind: "conflict" });
			const server = {
				kind: "found",
				letter: { ...draft("Another writer"), revision: 2 },
			} as const;
			read.mockResolvedValueOnce(server);
			saves.edit("letter", draft("My words"));
			await saves.flush("letter");
			read.mockRejectedValueOnce(new Error("offline"));
			await saves[choice]("letter");
			expect(saves.snapshot("letter").state).toMatchObject({
				status: "conflict",
				message: expect.any(String),
			});
			expect(saves.snapshot("letter").state).not.toHaveProperty("resolving");
			expect(saves.snapshot("letter").draft).toEqual(draft("My words"));
			read.mockResolvedValueOnce(server);
			expect(await saves.loadLatest("letter")).toBe(true);
		},
	);

	it("starts a new editor session when loading the latest version even if the route already has that revision", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValue({ kind: "conflict" });
		read.mockResolvedValue({
			kind: "found",
			letter: { ...draft("Another writer"), revision: 2 },
		});
		saves.edit("letter", draft("Recovered local branch"));
		const opened = saves.open("letter", {
			...draft("Another writer"),
			revision: 2,
		});
		await saves.flush("letter");
		expect(await saves.loadLatest("letter")).toBe(true);
		expect(saves.snapshot("letter").generation).toBe(opened.generation + 1);
		expect(saves.snapshot("letter").draft).toEqual(draft("Another writer"));
	});

	it("uses the latest revision when the user explicitly keeps their local branch", async () => {
		const { saves, send, read } = setup();
		send.mockResolvedValueOnce({ kind: "conflict" });
		read.mockResolvedValue({
			kind: "found",
			letter: { ...draft("Another writer"), revision: 3 },
		});
		saves.edit("letter", draft("My words"));
		await saves.flush("letter");
		send.mockResolvedValueOnce({ kind: "saved", revision: 4 });
		await saves.keepMine("letter");
		expect(send.mock.calls[1]?.[1]).toEqual({
			...draft("My words"),
			expectedRevision: 3,
		});
		expect(saves.snapshot("letter").state).toEqual({
			status: "saved",
			revision: 4,
		});
	});

	it("stops automatic retries on a permanent refusal without deleting the draft", async () => {
		const { saves, send } = setup();
		send.mockResolvedValue({
			kind: "blocked",
			message: "This letter can no longer be edited.",
		});
		saves.edit("letter", draft("Keep these words"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(saves.snapshot("letter").state.status).toBe("blocked");
		expect(saves.pending()[0]?.draft).toEqual(draft("Keep these words"));
	});
});

describe("saved letter equivalence", () => {
	it("ignores object key order and applies only the server's documented defaults and title trimming", () => {
		const left = draft("Dear Alex");
		left.title = "  For Alex  ";
		const content = JSON.parse(JSON.stringify(left.content)) as LetterContent;
		const attrs = content.doc.attrs as Partial<LetterContent["doc"]["attrs"]>;
		delete attrs.minSides;
		delete attrs.frontImageAssetId;
		const right = { content, title: "For Alex" };
		expect(sameLetterDraft(left, right)).toBe(true);
	});

	it("preserves meaningful text, formatting, geometry, and explicit inherited values", () => {
		const first = draft("Dear Alex");
		expect(sameLetterDraft(first, draft("Dear  Alex"))).toBe(false);
		const changed = structuredClone(first);
		changed.content.defaults.color = "sepia";
		expect(sameLetterDraft(first, changed)).toBe(false);
		const marked = structuredClone(first);
		const node = marked.content.doc.content[0]?.content?.[0];
		if (!node) throw new Error("missing text");
		node.marks = [
			{ type: "ink", attrs: { font: null, sizePt: 20, color: null } },
		];
		expect(sameLetterDraft(first, marked)).toBe(false);
	});

	it("does not accept unknown or missing required attributes by stripping them", () => {
		const first = draft("Dear Alex");
		const invalid = JSON.parse(JSON.stringify(first));
		invalid.content.doc.content[0].attrs = {};
		expect(sameLetterDraft(first, invalid)).toBe(false);
	});
});
