"use client";

import { requestFontBuild, saveGlyph } from "@repo/api";
import { errorMessages, isApiErrorCode } from "@repo/errors";
import type { EditableFont, Stroke } from "@repo/types";
import { missingChars } from "@repo/types";
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
import { buildMessage } from "../font-errors.ts";
import { fontHome, letterWithFont } from "../font-links.ts";
import {
	addStroke,
	canRedo,
	canUndo,
	clearCell,
	drawnGlyphs,
	type GlyphHistory,
	glyphHistory,
	isFull,
	parseCellKey,
	redo,
	redoTarget,
	rollback,
	strokesOf,
	undo,
	undoTarget,
} from "../glyph-history.ts";
import {
	type GlyphSaves,
	glyphSaves,
	type SaveResult,
} from "../glyph-saves.ts";
import {
	type GlyphSection,
	type GlyphSectionId,
	glyphSections,
	startSlot,
} from "../glyph-sections.ts";
import { useTwoFingerTap } from "../use-two-finger-tap.ts";
import { GlyphCell } from "./glyph-cell.tsx";
import { StrokeSpecimen } from "./stroke-specimen.tsx";

export const SAVE_FAILED =
	"Not saved. Check your connection and draw it again.";

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
			"Quotes, brackets and symbols. Any you skip are written in Caveat.",
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

async function sendGlyph(
	fontId: string,
	key: string,
	strokes: readonly Stroke[],
): Promise<SaveResult> {
	const saved = await saveGlyph(fontId, {
		...parseCellKey(key),
		strokes: strokes.map((stroke) => ({
			input: stroke.input,
			points: stroke.points.map((point) => [...point]),
		})),
	});
	return saved.status === 204
		? { ok: true }
		: { ok: false, error: saved.data.code };
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
	const [history, setHistory] = useState(() => glyphHistory(font.glyphs));
	const current = useRef(history);
	const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
	const [penSeen, setPenSeen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [building, setBuilding] = useState(false);
	const [buildError, setBuildError] = useState<string | null>(null);
	const [start] = useState(() => startSlot(font.glyphs, glyph));
	const grid = useRef<HTMLDivElement>(null);
	const header = useRef<HTMLElement>(null);

	const show = useCallback((next: GlyphHistory) => {
		current.current = next;
		setHistory(next);
	}, []);

	const [saves] = useState<GlyphSaves>(() =>
		glyphSaves({
			saved: glyphHistory(font.glyphs).cells,
			send: (key, strokes) => sendGlyph(font.id, key, strokes),
			onFailed: (key, saved, error) => {
				show(rollback(current.current, key, saved));
				setErrors((shown) => ({ ...shown, [key]: messageOf(error) }));
			},
			onPending: setSaving,
		}),
	);

	const apply = useCallback(
		(next: GlyphHistory, key: string | null) => {
			if (key === null || next === current.current) return;
			show(next);
			setErrors((shown) => {
				if (!(key in shown)) return shown;
				const { [key]: _, ...rest } = shown;
				return rest;
			});
			setBuildError(null);
			saves.save(key, strokesOf(next, key));
		},
		[saves, show],
	);

	const onClear = useCallback(
		(key: string) => apply(clearCell(current.current, key), key),
		[apply],
	);

	const stepBack = useCallback(
		() => apply(undo(current.current), undoTarget(current.current)),
		[apply],
	);

	const stepForward = useCallback(
		() => apply(redo(current.current), redoTarget(current.current)),
		[apply],
	);

	const severalFingers = useTwoFingerTap(stepBack);

	const onStroke = useCallback(
		(key: string, stroke: Stroke) => {
			if (stroke.input === "touch" && severalFingers.current) return;
			apply(addStroke(current.current, key, stroke), key);
		},
		[apply, severalFingers],
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
		if (!saving) return;
		const hold = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", hold);
		return () => window.removeEventListener("beforeunload", hold);
	}, [saving]);

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

	async function requestBuild(): Promise<string | null> {
		await saves.idle();
		if (missingChars(drawnGlyphs(current.current)).length > 0) {
			return errorMessages.font_incomplete;
		}
		const requested = await requestFontBuild(font.id).catch(() => null);
		return requested?.status === 201
			? null
			: buildMessage(requested?.data.code);
	}

	async function build() {
		if (building) return;
		setBuilding(true);
		setBuildError(null);
		const failure = await requestBuild();
		if (failure === null) {
			router.push(fontHome(font.id, from));
			return;
		}
		setBuilding(false);
		setBuildError(failure);
	}

	return (
		<div
			ref={grid}
			className="flex flex-col gap-12"
			onPointerDownCapture={(event) => {
				if (event.pointerType === "pen") setPenSeen(true);
			}}
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
									{saving ? "Saving…" : canUndo(history) ? "Saved" : null}
								</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								aria-keyshortcuts="Meta+Z Control+Z"
								disabled={!canUndo(history)}
								onClick={stepBack}
							>
								<Undo2 />
								Undo
							</Button>
							<Button
								type="button"
								variant="ghost"
								aria-keyshortcuts="Shift+Meta+Z Shift+Control+Z Control+Y"
								disabled={!canRedo(history)}
								onClick={stepForward}
							>
								<Redo2 />
								Redo
							</Button>
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
						<ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-4 pointer-coarse:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] pointer-coarse:gap-5">
							{section.slots.map((slot) => (
								<GlyphCell
									key={slot.key}
									slot={slot}
									strokes={strokesOf(history, slot.key)}
									penOnly={penSeen}
									highlighted={highlighted === slot.key}
									full={isFull(history, slot.key)}
									error={errors[slot.key] ?? null}
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
