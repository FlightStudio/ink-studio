"use client";

import { requestFontBuild, saveGlyph } from "@repo/api";
import type { EditableFont } from "@repo/types";
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
import { requestDeadline } from "@/lib/request-deadline";
import { drawPage } from "./font-links.ts";
import { parseCellKey } from "./glyph-history.ts";
import { createGlyphSessions, type GlyphSessions } from "./glyph-sessions.ts";

const GlyphSessionsContext = createContext<GlyphSessions | null>(null);

export function GlyphSessionProvider({ children }: { children: ReactNode }) {
	const [sessions] = useState(() =>
		createGlyphSessions({
			async send(id, key, strokes) {
				const saved = await requestDeadline((signal) =>
					saveGlyph(
						id,
						{
							...parseCellKey(key),
							strokes: strokes.map((stroke) => ({
								input: stroke.input,
								points: stroke.points.map((point) => [...point]),
							})),
						},
						{ signal },
					),
				);
				return saved.status === 204
					? { ok: true }
					: { ok: false, error: saved.data.code };
			},
			async build(id) {
				const built = await requestDeadline((signal) =>
					requestFontBuild(id, { signal }),
				);
				return built.status === 201
					? { ok: true }
					: { ok: false, error: built.data.code };
			},
		}),
	);
	const pending = useSyncExternalStore(
		sessions.subscribeAll,
		sessions.pending,
		sessions.pending,
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
		const retry = () => {
			for (const session of sessions.pending()) sessions.retry(session.id);
		};
		window.addEventListener("online", retry);
		return () => window.removeEventListener("online", retry);
	}, [sessions]);
	const away = pending.filter(
		(session) => pathname !== `/fonts/${session.id}/draw`,
	);
	return (
		<GlyphSessionsContext value={sessions}>
			{away.length > 0 ? (
				<aside
					aria-label="Unsaved handwriting"
					className="sticky top-0 z-30 mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-b-2xl bg-paper px-5 py-3 text-ui shadow-float ring-1 ring-rule"
				>
					{away.map((session) => (
						<div key={session.id} className="flex flex-wrap items-center gap-3">
							<p role="status" className="min-w-0 flex-1">
								<Link
									href={drawPage(session.id, null)}
									className="underline underline-offset-4"
								>
									{session.ownerName}'s handwriting
								</Link>
								{Object.keys(session.errors).length > 0
									? " has unsaved strokes. They are still here."
									: " is still saving."}
							</p>
							{Object.keys(session.errors).length > 0 ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => sessions.retry(session.id)}
								>
									Retry saving
								</Button>
							) : null}
						</div>
					))}
				</aside>
			) : null}
			{children}
		</GlyphSessionsContext>
	);
}

export function useGlyphSession(
	font: Pick<EditableFont, "id" | "ownerName" | "glyphs">,
) {
	const sessions = use(GlyphSessionsContext);
	if (!sessions)
		throw new Error("Drawing handwriting needs the studio session owner");
	const session = sessions.open(font);
	const snapshot = useSyncExternalStore(
		session.subscribe,
		session.snapshot,
		session.snapshot,
	);
	return { session, snapshot };
}
