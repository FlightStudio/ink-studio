"use client";

import { errorMessages, isApiErrorCode } from "@repo/errors";
import type { EditableFont, Stroke } from "@repo/types";
import { GLYPH_LIMITS, missingChars } from "@repo/types";
import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { drawsWith } from "@/features/ink/pointer-session";
import { fontHome, letterWithFont } from "../font-links.ts";
import {
	addStroke,
	canRedo,
	canUndo,
	clearCell,
	drawnGlyphs,
	type GlyphHistory,
	isFull,
	redo,
	redoTarget,
	strokesOf,
	undo,
	undoTarget,
} from "../glyph-history.ts";
import {
	type GlyphSection,
	type GlyphSectionId,
	glyphSections,
	startSlot,
} from "../glyph-sections.ts";
import { useGlyphSession } from "../glyph-session-provider.tsx";
import { useTwoFingerTap } from "../use-two-finger-tap.ts";
import { GlyphCell } from "./glyph-cell.tsx";
import { StrokeSpecimen } from "./stroke-specimen.tsx";

export const SAVE_FAILED =
	"Not saved. Your strokes are still here. Retry when connected.";

export const STROKE_TOO_LONG =
	"This stroke is too long, so draw it again in shorter pieces.";

const SECTION_COPY: Record<
	GlyphSectionId,
	{ title(count: number): string; description: ReactNode }
> = {
	needed: {
		title: (count) => `Needed (${count})`,
		description:
			"Write each letter in its box, sitting on the dark line. Tails of g, j, p, q and y go down to the bottom line.",
	},
	natural: {
		title: () => "Make it look more natural",
		description:
			"Write a second and third version of the letters you use most. Your font takes turns with them, so repeated letters never look stamped.",
	},
	capitals: {
		title: () => "Recommended: capitals and numbers",
		description: (
			<>
				For names and dates. <em>Dear Sam</em> needs D and S. Any you skip are
				written in Caveat.
			</>
		),
	},
	punctuation: {
		title: () => "More punctuation",
		description:
			"Sentence marks, quotes, brackets and symbols. Any you skip are written in Caveat.",
	},
};

export type GlyphGridProps = {
	font: EditableFont;
	from: string | null;
	glyph: string | null;
};

function messageOf(error: string | null): string {
	return error !== null && error !== "internal_error" && isApiErrorCode(error)
		? errorMessages[error]
		: SAVE_FAILED;
}

function isEditable(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			target.closest("input, textarea, select") !== null)
	);
}

function countDrawn(section: GlyphSection, history: GlyphHistory): number {
	return section.slots.filter((slot) => strokesOf(history, slot.key).length > 0)
		.length;
}

export function GlyphGrid({ font, from, glyph }: GlyphGridProps) {
	const router = useRouter();
	const { session, snapshot } = useGlyphSession(font);
	const { history, errors, pending: saving, building, buildError } = snapshot;
	const [penSeen, setPenSeen] = useState(false);
	const [tooLongKey, setTooLongKey] = useState<string | null>(null);
	const [start] = useState(() => startSlot(font.glyphs, glyph));
	const grid = useRef<HTMLDivElement>(null);
	const header = useRef<HTMLElement>(null);
	const mounted = useRef(false);
	const pointers = useRef(new Set<number>());
	useEffect(() => {
		mounted.current = true;
		const held = pointers.current;
		return () => {
			mounted.current = false;
			for (const pointer of held) session.pointerEnd(pointer);
			held.clear();
		};
	}, [session]);

	const claimPointer = useCallback(
		(pointerId: number) => {
			if (!session.pointerDown(pointerId)) return false;
			pointers.current.add(pointerId);
			return true;
		},
		[session],
	);

	const onClear = useCallback(
		(key: string) => {
			setTooLongKey((current) => (current === key ? null : current));
			session.apply(clearCell(session.snapshot().history, key), key);
		},
		[session],
	);

	const stepBack = useCallback(() => {
		const current = session.snapshot().history;
		session.apply(undo(current), undoTarget(current));
	}, [session]);

	const stepForward = useCallback(() => {
		const current = session.snapshot().history;
		session.apply(redo(current), redoTarget(current));
	}, [session]);

	const severalFingers = useTwoFingerTap(grid, stepBack);

	const onStroke = useCallback(
		(key: string, stroke: Stroke) => {
			if (stroke.input === "touch" && severalFingers.current) return;
			if (stroke.points.length > GLYPH_LIMITS.pointsPerStroke) {
				setTooLongKey(key);
				return;
			}
			setTooLongKey((current) => (current === key ? null : current));
			session.apply(addStroke(session.snapshot().history, key, stroke), key);
		},
		[session, severalFingers],
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
			if (isEditable(event.target)) return;
			const key = event.key.toLowerCase();
			if (key === "z") {
				event.preventDefault();
				if (event.shiftKey) stepForward();
				else stepBack();
			} else if (key === "y" && event.ctrlKey && !event.metaKey) {
				event.preventDefault();
				stepForward();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [stepBack, stepForward]);

	useEffect(() => {
		if (start === null) return;
		const cell = [
			...(grid.current?.querySelectorAll<HTMLElement>("[data-cell]") ?? []),
		].find((element) => element.dataset.cell === start);
		if (!cell) return;
		const box = cell.getBoundingClientRect();
		const covered = header.current?.getBoundingClientRect().bottom ?? 0;
		if (box.top >= covered && box.bottom <= window.innerHeight) return;
		cell.scrollIntoView({ block: "center" });
	}, [start]);

	const glyphs = useMemo(() => drawnGlyphs(history), [history]);
	const sections = useMemo(() => glyphSections(glyphs), [glyphs]);
	const missing = missingChars(glyphs);
	const needed = sections[0]?.slots.length ?? 0;
	const drawn = needed - missing.length;
	const highlighted = undoTarget(history) ?? start;
	const backHref = from ? letterWithFont(from, font.id) : null;

	async function build() {
		if ((await session.build()) && mounted.current) {
			router.push(fontHome(font.id, from));
		}
	}

	function endPointer(pointerId: number) {
		pointers.current.delete(pointerId);
		session.pointerEnd(pointerId);
	}

	return (
		<div
			ref={grid}
			className="flex flex-col gap-12"
			onPointerDownCapture={(event) => {
				const fingerMayScroll = event.pointerType === "touch" && !penSeen;
				if (
					event.target instanceof HTMLCanvasElement &&
					event.target.closest("[data-cell]") &&
					drawsWith(event, penSeen) &&
					!fingerMayScroll
				) {
					if (!claimPointer(event.pointerId)) {
						event.preventDefault();
						event.stopPropagation();
						return;
					}
				}
				if (event.pointerType === "pen") setPenSeen(true);
			}}
			onPointerUpCapture={(event) => endPointer(event.pointerId)}
			onPointerCancelCapture={(event) => endPointer(event.pointerId)}
			onLostPointerCaptureCapture={(event) => endPointer(event.pointerId)}
		>
			<div className="sticky top-0 z-20 -mt-3 pt-3">
				<div aria-hidden className="absolute inset-x-0 top-0 h-6 bg-desk" />
				<header
					ref={header}
					className="relative flex flex-col gap-4 rounded-2xl bg-paper px-5 py-4 shadow-float ring-1 ring-ink/5 sm:px-7 sm:py-5"
				>
					<div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
						<div className="flex min-w-0 flex-col gap-2">
							<h1 className="truncate font-display text-title">
								{font.ownerName}'s handwriting
							</h1>
							<div className="flex items-center gap-3">
								<div
									role="progressbar"
									aria-label="Needed letters drawn"
									aria-valuemin={0}
									aria-valuemax={needed}
									aria-valuenow={drawn}
									className="h-1 w-28 overflow-hidden rounded-full bg-rule sm:w-36"
								>
									<div
										className="h-full rounded-full bg-ink-accent transition-[width] duration-500 ease-settle"
										style={{ width: `${(drawn / needed) * 100}%` }}
									/>
								</div>
								<p className="text-label text-ink tabular-nums">
									{drawn} of {needed} letters
								</p>
								<p role="status" className="text-label text-ink-muted">
									{Object.keys(errors).length > 0
										? "Not saved"
										: saving
											? "Saving…"
											: canUndo(history) || canRedo(history)
												? "Saved"
												: null}
								</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								aria-keyshortcuts="Meta+Z Control+Z"
								disabled={building || !canUndo(history)}
								onClick={stepBack}
							>
								<Undo2 />
								Undo
							</Button>
							<Button
								type="button"
								variant="ghost"
								aria-keyshortcuts="Shift+Meta+Z Shift+Control+Z Control+Y"
								disabled={building || !canRedo(history)}
								onClick={stepForward}
							>
								<Redo2 />
								Redo
							</Button>
							{Object.keys(errors).length > 0 ? (
								<Button
									type="button"
									variant="outline"
									onClick={() => session.retry()}
								>
									Retry saving
								</Button>
							) : null}
							<span aria-hidden className="mx-1 h-5 w-px bg-rule" />
							<Button
								type="button"
								size="lg"
								className="px-4"
								disabled={missing.length > 0 || building}
								onClick={() => void build()}
							>
								{building ? "Starting…" : "Build my font"}
							</Button>
							{backHref ? (
								<Link
									href={backHref}
									className={buttonVariants({
										variant: "outline",
										size: "lg",
										className: "px-4",
									})}
								>
									Back to your letter
								</Link>
							) : null}
						</div>
					</div>
					{buildError ? (
						<p role="alert" className="text-ui text-danger">
							{buildError}
						</p>
					) : null}
					<div className="border-t border-rule pt-3">
						<StrokeSpecimen glyphs={glyphs} />
					</div>
				</header>
			</div>
			{sections.map((section) => {
				const copy = SECTION_COPY[section.id];
				return (
					<section
						key={section.id}
						aria-labelledby={`section-${section.id}`}
						data-section={section.id}
						className={[
							"flex flex-col gap-5",
							section.id === "natural" ? "motion-safe:animate-settle" : "",
						].join(" ")}
					>
						<div className="flex flex-col gap-1.5">
							<div className="flex items-baseline justify-between gap-4">
								<h2
									id={`section-${section.id}`}
									className="font-display text-title"
								>
									{copy.title(section.slots.length)}
								</h2>
								<p className="text-label text-ink-muted tabular-nums">
									{countDrawn(section, history)} of {section.slots.length}
								</p>
							</div>
							<p className="max-w-prose text-ui text-ink-muted">
								{copy.description}
							</p>
						</div>
						<ul
							data-glyph-drawing-area
							className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-4 pointer-coarse:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] pointer-coarse:gap-5"
						>
							{section.slots.map((slot) => (
								<GlyphCell
									key={slot.key}
									slot={slot}
									strokes={strokesOf(history, slot.key)}
									penOnly={penSeen}
									onClaimPointer={claimPointer}
									disabled={building}
									highlighted={highlighted === slot.key}
									full={isFull(history, slot.key)}
									error={
										slot.key in errors
											? messageOf(errors[slot.key] ?? null)
											: tooLongKey === slot.key
												? STROKE_TOO_LONG
												: null
									}
									onStroke={onStroke}
									onClear={onClear}
								/>
							))}
						</ul>
					</section>
				);
			})}
			<p>
				<Link href="/fonts" className="text-ui text-ink-muted hover:text-ink">
					All handwriting
				</Link>
			</p>
		</div>
	);
}
