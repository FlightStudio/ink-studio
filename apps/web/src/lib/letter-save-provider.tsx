"use client";

import { getLetter, letterStateSchema, saveLetter } from "@repo/api";
import { parseLetterContent } from "@repo/render/schema";
import { Button } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	createContext,
	type ReactNode,
	use,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react";
import {
	createLetterSaves,
	type LetterDraft,
	type LetterReadResult,
	type LetterSaves,
} from "./letter-saves.ts";
import { requestDeadline } from "./request-deadline.ts";

const LetterSavesContext = createContext<LetterSaves | null>(null);

const REFUSED =
	"This letter could not be saved. Your draft is still here; download it before leaving.";

function permanentlyRefused(status: number): boolean {
	return (
		status >= 400 &&
		status < 500 &&
		status !== 408 &&
		status !== 409 &&
		status !== 429
	);
}

async function readLetter(id: string): Promise<LetterReadResult> {
	const response = await requestDeadline((signal) =>
		getLetter(id, { cache: "no-store", signal }),
	);
	if (response.status === 200) {
		try {
			const { title, revision, resources } = letterStateSchema.parse(
				response.data,
			);
			if (
				typeof title !== "string" ||
				!Number.isSafeInteger(revision) ||
				revision < 1
			) {
				return { kind: "blocked", message: REFUSED };
			}
			return {
				kind: "found",
				letter: {
					title,
					revision,
					content: parseLetterContent(response.data.content),
					resources,
				},
			};
		} catch {
			return { kind: "blocked", message: REFUSED };
		}
	}
	return permanentlyRefused(response.status)
		? { kind: "blocked", message: REFUSED }
		: { kind: "retry" };
}

export function downloadLetterDraft(draft: LetterDraft): void {
	const blob = new Blob(
		[JSON.stringify({ title: draft.title, content: draft.content }, null, 2)],
		{
			type: "application/json",
		},
	);
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${draft.title.replace(/[^\p{L}\p{N}_.-]+/gu, "-") || "letter"}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function LetterSaveProvider({ children }: { children: ReactNode }) {
	const [saves] = useState(() =>
		createLetterSaves({
			read: readLetter,
			async send(id, body) {
				const response = await requestDeadline((signal) =>
					saveLetter(id, body, { signal }),
				);
				if (response.status === 200) {
					return Number.isSafeInteger(response.data.revision) &&
						response.data.revision > body.expectedRevision
						? { kind: "saved", revision: response.data.revision }
						: { kind: "retry" };
				}
				if (response.status === 409) return { kind: "conflict" };
				return permanentlyRefused(response.status)
					? { kind: "blocked", message: REFUSED }
					: { kind: "retry" };
			},
		}),
	);
	const pending = useSyncExternalStore(
		saves.subscribeAll,
		saves.pending,
		saves.pending,
	);
	const pathname = usePathname();
	const unsaved = pending.length > 0;

	useEffect(() => {
		if (!unsaved) return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [unsaved]);

	useEffect(() => {
		const resume = () => {
			for (const item of saves.pending()) void saves.flush(item.id);
		};
		window.addEventListener("online", resume);
		document.addEventListener("visibilitychange", resume);
		return () => {
			window.removeEventListener("online", resume);
			document.removeEventListener("visibilitychange", resume);
		};
	}, [saves]);

	const away = pending.filter((item) => pathname !== `/letters/${item.id}`);
	return (
		<LetterSavesContext value={saves}>
			{children}
			{away.length > 0 ? (
				<aside
					aria-label="Unsaved letters"
					className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl bg-paper p-4 text-ui shadow-float ring-1 ring-rule"
				>
					{away.map((item) => (
						<div
							key={item.id}
							className="flex flex-wrap items-center gap-x-3 gap-y-2"
						>
							<p role="status" className="min-w-0 flex-1">
								<Link
									href={`/letters/${item.id}`}
									className="underline underline-offset-4"
								>
									{item.draft.title}
								</Link>
								{item.state.status === "dirty" || item.state.status === "saving"
									? " is still saving."
									: item.state.status === "retrying"
										? " has unsaved changes. Retrying the connection."
										: " has unsaved changes that need your attention."}
							</p>
							{item.state.status === "retrying" ||
							item.state.status === "blocked" ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => void saves.retry(item.id)}
								>
									Try again
								</Button>
							) : null}
							<Button
								variant="ghost"
								size="sm"
								onClick={() => downloadLetterDraft(item.draft)}
							>
								Download draft
							</Button>
						</div>
					))}
				</aside>
			) : null}
		</LetterSavesContext>
	);
}

export function useLetterSaves(): LetterSaves {
	const saves = use(LetterSavesContext);
	if (!saves) throw new Error("Letter editing needs the studio save owner");
	return saves;
}
