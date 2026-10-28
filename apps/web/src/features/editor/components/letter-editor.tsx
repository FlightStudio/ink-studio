"use client";

import {
	type LetterMeasure,
	LetterPage,
	measureInputFor,
	measureLetter,
	overflowIn,
	type PlacementIssue,
	pageGapIn,
	placementIssues,
	sidesUsed,
} from "@repo/render/html";
import { letterExtensions } from "@repo/render/schema";
import type { EditableLetter } from "@repo/services/letters";
import type { FontRef, LetterContent, LetterDoc, PageSpec } from "@repo/types";
import { PAGE_SPECS } from "@repo/types";
import { Desk } from "@repo/ui/components/desk";
import { EditorContent, useEditor } from "@tiptap/react";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useAutosave } from "@/lib/use-autosave";
import { AddSide } from "./add-side.tsx";
import { EditorToolbar, useCoarsePointer } from "./editor-toolbar.tsx";
import { HumanSeal } from "./human-seal.tsx";
import { LetterTitle } from "./letter-title.tsx";
import { OverflowNotice } from "./overflow-notice.tsx";
import { PrintPreview } from "./print-preview.tsx";
import { SaveLine } from "./save-line.tsx";
import { SidesIndicator } from "./sides-indicator.tsx";

const PX_PER_IN = 96;
const MAX_SCALE = 1.25;
const INK_READY_TIMEOUT_MS = 3000;

function familyOf(font: FontRef): string {
	return font.kind === "stock" ? `stock-${font.id}` : `own-${font.fontId}`;
}

function fontQueries(content: LetterContent): string[] {
	const families = new Set([familyOf(content.defaults.font)]);
	for (const paragraph of content.doc.content) {
		for (const node of paragraph.content ?? []) {
			for (const mark of node.marks ?? []) {
				if (mark.attrs.font) families.add(familyOf(mark.attrs.font));
			}
		}
	}
	return [...families].map(
		(family) => `${content.defaults.sizePt}pt "${family}"`,
	);
}

function isBlank(doc: LetterDoc): boolean {
	const [first, ...rest] = doc.content;
	return rest.length === 0 && (first?.content ?? []).length === 0;
}

function useInkReady(content: LetterContent): boolean {
	const [ready, setReady] = useState(false);
	const [queries] = useState(() => fontQueries(content));
	useEffect(() => {
		let live = true;
		const loaded = Promise.all(
			queries.map((query) => document.fonts.load(query)),
		).then(() => document.fonts.ready);
		const timeout = new Promise((done) =>
			setTimeout(done, INK_READY_TIMEOUT_MS),
		);
		Promise.race([loaded, timeout])
			.catch(() => undefined)
			.then(() => {
				if (live) setReady(true);
			});
		return () => {
			live = false;
		};
	}, [queries]);
	return ready;
}

function useDeskScale(widthIn: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState<number | null>(null);
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const update = () =>
			setScale(
				Math.min(MAX_SCALE, element.clientWidth / (widthIn * PX_PER_IN)),
			);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, [widthIn]);
	return { ref, scale };
}

export type PageState = {
	measure: LetterMeasure;
	sides: number;
	overflowIn: number;
	issues: PlacementIssue[];
};

export type LetterEditorProps = { letter: EditableLetter };

function placedBoxes(doc: LetterDoc) {
	return (doc.attrs.elements ?? []).map((element) => ({
		id: element.id,
		side: element.side,
		xIn: element.xIn,
		yIn: element.yIn,
		widthIn: element.widthIn,
		heightIn: element.heightIn,
		rotationDeg: element.rotationDeg,
	}));
}

function pageStateOf(
	spec: PageSpec,
	column: HTMLElement,
	doc: LetterDoc,
): PageState {
	const measure = measureLetter(column, measureInputFor(spec, "edit"));
	const boxes = placedBoxes(doc);
	const minSides = Number(doc.attrs.minSides) || 1;
	const sides = sidesUsed(spec, {
		textBottomIn: measure.textBottomIn,
		boxes,
		minSides,
	});
	return {
		measure,
		sides,
		overflowIn: overflowIn(spec, { textBottomIn: measure.textBottomIn }),
		issues: placementIssues(spec, { boxes, sides }),
	};
}

function restingState(doc: LetterDoc): PageState {
	return {
		measure: { lineTopsIn: [], textBottomIn: 0, wordsPastLimit: 0 },
		sides: Number(doc.attrs.minSides) || 1,
		overflowIn: 0,
		issues: [],
	};
}

export function LetterEditor({ letter }: LetterEditorProps) {
	const router = useRouter();
	const spec = PAGE_SPECS[letter.content.format];
	const [title, setTitle] = useState(letter.title);
	const [doc, setDoc] = useState(letter.content.doc);
	const [pageState, setPageState] = useState(() =>
		restingState(letter.content.doc),
	);
	const [flowHeightIn, setFlowHeightIn] = useState(0);
	const pageRef = useRef<HTMLDivElement>(null);
	const inkReady = useInkReady(letter.content);
	const desk = useDeskScale(spec.widthIn);
	const coarsePointer = useCoarsePointer();
	const [keyboardClearancePx, setKeyboardClearancePx] = useState(0);

	const editor = useEditor({
		extensions: letterExtensions,
		content: letter.content.doc,
		editable: letter.editable,
		injectCSS: false,
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class: "letter-text",
				"aria-label": "Letter",
				"aria-multiline": "true",
				role: "textbox",
			},
		},
	});

	const autosave = useAutosave({
		letterId: letter.id,
		revision: letter.revision,
		enabled: letter.editable,
		draft: () => ({
			title,
			content: {
				...letter.content,
				doc: (editor?.getJSON() as LetterDoc | undefined) ?? letter.content.doc,
			},
		}),
		onNewerVersion: () => router.refresh(),
	});
	const { edited } = autosave;

	const [empty, setEmpty] = useState(() => isBlank(letter.content.doc));

	const measure = useCallback(() => {
		const column =
			pageRef.current?.querySelector<HTMLElement>(".letter-column");
		if (!column || !editor) return;
		const nextDoc = editor.getJSON() as LetterDoc;
		setDoc(nextDoc);
		setPageState(pageStateOf(spec, column, nextDoc));
		const pageBox = column.closest(".letter-page");
		if (pageBox instanceof HTMLElement) {
			setFlowHeightIn(pageBox.offsetHeight / PX_PER_IN);
		}
	}, [editor, spec]);

	useEffect(() => {
		if (!editor) return;
		const onUpdate = () => {
			edited();
			setEmpty(editor.isEmpty);
			measure();
		};
		editor.on("update", onUpdate);
		return () => {
			editor.off("update", onUpdate);
		};
	}, [editor, edited, measure]);

	useEffect(() => {
		if (inkReady && desk.scale !== null) measure();
	}, [inkReady, desk.scale, measure]);

	useEffect(() => {
		let live = true;
		void document.fonts.ready.then(() => {
			if (live) measure();
		});
		return () => {
			live = false;
		};
	}, [measure]);

	useEffect(() => {
		const page = pageRef.current;
		if (!page || !editor || !letter.editable) return;
		const focusEnd = (event: MouseEvent) => {
			if (
				event.target instanceof Node &&
				editor.view.dom.contains(event.target)
			)
				return;
			event.preventDefault();
			editor.commands.focus("end");
		};
		page.addEventListener("mousedown", focusEnd);
		return () => page.removeEventListener("mousedown", focusEnd);
	}, [editor, letter.editable]);

	const gapIn = pageGapIn("edit");
	const sheets = pageState.sides + (pageState.overflowIn > 0 ? 1 : 0);
	const stackIn = sheets * spec.heightIn + Math.max(0, sheets - 1) * gapIn;
	const heightIn = Math.max(stackIn, flowHeightIn);
	const scale = desk.scale ?? 1;
	const live = { ...letter.content, doc };

	return (
		<Desk className="flex flex-col">
			<header className="flex items-center px-4 pt-4 sm:px-6">
				<Link
					href="/letters"
					className="inline-flex items-center gap-1 rounded-full py-1.5 pr-3 pl-2 text-ui text-ink-muted transition-colors duration-(--duration-quick) hover:bg-paper/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
				>
					<ChevronLeft className="size-4" />
					Letters
				</Link>
			</header>
			<main
				className="flex flex-1 flex-col items-center px-4 pt-4 pb-6 sm:px-8"
				style={
					keyboardClearancePx > 0
						? { paddingBottom: `calc(1.5rem + ${keyboardClearancePx}px)` }
						: undefined
				}
			>
				{editor && letter.editable ? (
					<EditorToolbar
						editor={editor}
						defaults={letter.content.defaults}
						coarsePointer={coarsePointer}
						onKeyboardClearance={setKeyboardClearancePx}
					/>
				) : null}
				<div ref={desk.ref} className="flex w-full justify-center">
					<div
						className="-mx-2 -mt-2 -mb-10 overflow-hidden px-2 pt-2 pb-10 transition-opacity duration-(--duration-settle) ease-settle data-[ready=false]:opacity-0"
						data-ready={desk.scale !== null}
					>
						<div
							ref={pageRef}
							style={{
								width: `${spec.widthIn * PX_PER_IN * scale}px`,
								height: `${heightIn * PX_PER_IN * scale}px`,
							}}
						>
							<div
								style={{
									width: `${spec.widthIn}in`,
									transform: `scale(${scale})`,
									transformOrigin: "top left",
								}}
							>
								<style>
									{`.letter-page[data-mode="edit"] .letter-sheet[data-side="${spec.maxPages}"] {
										background-image: none;
										background-color: oklch(0.97 0.008 85 / 0.45);
										box-shadow: none;
										outline: 1px dashed var(--ink-muted);
										outline-offset: -1px;
									}`}
								</style>
								<LetterPage
									letterId={letter.id}
									content={live}
									resources={letter.resources}
									mode="edit"
									mergeValues={null}
									sheets={sheets}
									flow={
										<div
											className={
												inkReady
													? "relative animate-settle"
													: "relative invisible"
											}
										>
											{empty && letter.editable ? (
												<p
													aria-hidden
													className="pointer-events-none absolute top-0 left-0 leading-[1.5] whitespace-nowrap opacity-40 select-none"
												>
													Start writing…
												</p>
											) : null}
											<EditorContent editor={editor} />
										</div>
									}
								/>
							</div>
						</div>
					</div>
				</div>
				<div className="mt-6 flex w-full max-w-xl flex-col items-center gap-3">
					<OverflowNotice
						words={pageState.measure.wordsPastLimit}
						maxPages={spec.maxPages}
					/>
					<div className="flex flex-wrap items-center justify-center gap-3">
						<SidesIndicator sides={pageState.sides} maxPages={spec.maxPages} />
						{editor && letter.editable ? (
							<AddSide editor={editor} maxPages={spec.maxPages} />
						) : null}
						<PrintPreview
							letterId={letter.id}
							content={live}
							resources={letter.resources}
						/>
					</div>
					<HumanSeal content={live} />
				</div>
				<footer
					className="sticky bottom-4 z-10 mt-8 flex max-w-full items-center gap-4 rounded-full bg-paper py-1.5 pr-2 pl-5 shadow-float ring-1 ring-[oklch(0.3_0.03_60/0.06)]"
					style={
						keyboardClearancePx > 0
							? { bottom: `calc(1rem + ${keyboardClearancePx}px)` }
							: undefined
					}
				>
					<LetterTitle
						title={title}
						editable={letter.editable}
						onTitle={(next) => {
							setTitle(next);
							edited();
						}}
						onDone={() => editor?.commands.focus("end")}
					/>
					{letter.editable ? (
						<SaveLine
							state={autosave.state}
							onLoadLatest={() => router.refresh()}
							onKeepMine={() => void autosave.keepMine()}
						/>
					) : (
						<p className="pr-3 text-ui text-ink-muted">
							Written in a teammate's own hand, so it opens read-only.
						</p>
					)}
				</footer>
			</main>
		</Desk>
	);
}
