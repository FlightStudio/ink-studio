"use client";

import {
	type LetterMeasure,
	LetterPage,
	MergeChip,
	measureInputFor,
	measureLetter,
	overflowIn,
	type PlacementIssue,
	pageGapIn,
	placementIssues,
	sidesUsed,
	writingSides,
} from "@repo/render/html";
import { letterExtensions } from "@repo/render/schema";
import type { EditableLetter } from "@repo/services/letters";
import type {
	FontOption,
	FontRef,
	InkColorId,
	InkStyle,
	LetterContent,
	LetterDoc,
	LetterResources,
	LibraryDrawing,
	MergeFieldKey,
	PageSpec,
	PlacedElement,
} from "@repo/types";
import { MERGE_FIELDS, PAGE_SPECS, type SIGNATURE_WIDTHS } from "@repo/types";
import { Desk } from "@repo/ui/components/desk";
import type { FloatingToolbarProps } from "@repo/ui/components/floating-toolbar";
import type { Extensions } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import {
	EditorContent,
	NodeViewWrapper,
	type ReactNodeViewProps,
	ReactNodeViewRenderer,
	useEditor,
} from "@tiptap/react";
import { useRouter } from "next/navigation";
import {
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { StudioHeaderActions } from "@/components/studio/studio-header";
import { LibrarySheet } from "@/features/library/components/library-sheet";
import { useAutosave } from "@/lib/use-autosave";
import {
	elementsOf,
	placeElement,
	removeElement,
	signatureOf,
	signLetter,
	updateElement,
} from "../elements.ts";
import { exportBlocker } from "../export-progress.ts";
import { writeLetterIn } from "../letter-font.ts";
import { mergeFieldSuggestion } from "../merge-field-suggestion.ts";
import { placementFor, signaturePlacement } from "../transform.ts";
import { AddSide } from "./add-side.tsx";
import { EditorToolbar, useCoarsePointer } from "./editor-toolbar.tsx";
import { ElementHandles, placementSentence } from "./element-handles.tsx";
import { ExportButton } from "./export-button.tsx";
import { FontOffer } from "./font-offer.tsx";
import { FrontImagePicker } from "./front-image-picker.tsx";
import { HumanSeal } from "./human-seal.tsx";
import { KeepClearGuides } from "./keep-clear-guides.tsx";
import { LetterTitle } from "./letter-title.tsx";
import { OverflowNotice } from "./overflow-notice.tsx";
import { PrintPreview } from "./print-preview.tsx";
import { SaveLine } from "./save-line.tsx";
import { SidesIndicator } from "./sides-indicator.tsx";
import { SignButton } from "./sign-button.tsx";

function MergeFieldView({ node }: ReactNodeViewProps) {
	const field = node.attrs.field;
	if (typeof field !== "string" || !Object.hasOwn(MERGE_FIELDS, field)) {
		return <NodeViewWrapper as="span" />;
	}
	return (
		<NodeViewWrapper as="span">
			<MergeChip field={field as MergeFieldKey} />
		</NodeViewWrapper>
	);
}

function editorExtensions(): Extensions {
	return [
		...letterExtensions.map((extension) => {
			if (extension.name === "mergeField") {
				return extension.extend({
					addNodeView() {
						return ReactNodeViewRenderer(MergeFieldView);
					},
				});
			}
			return extension;
		}),
		mergeFieldSuggestion,
	];
}

const PX_PER_IN = 96;
const PLACED_LONG_SIDE_IN = 2;
const MAX_SCALE = 1.25;
const INK_READY_TIMEOUT_MS = 3000;
const REVEAL_AT = 0.25;
const SCROLL_GAP_PX = 12;

type ScrollClearance = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

const NO_CLEARANCE: ScrollClearance = {
	top: SCROLL_GAP_PX,
	right: SCROLL_GAP_PX,
	bottom: SCROLL_GAP_PX,
	left: SCROLL_GAP_PX,
};

function familyOf(font: FontRef): string {
	return font.kind === "stock" ? `stock-${font.id}` : `own-${font.fontId}`;
}

function fontQueries(content: LetterContent): string[] {
	const families = new Set([familyOf(content.defaults.font)]);
	for (const block of content.doc.content) {
		if (block.type !== "paragraph") continue;
		for (const node of block.content ?? []) {
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
	if (doc.attrs.elements.some((element) => element.kind === "signature")) {
		return false;
	}
	const [first, ...rest] = doc.content;
	return rest.length === 0 && (first?.content ?? []).length === 0;
}

type BlankFontStep = {
	pending: "undo" | "redo";
	original: InkStyle;
	chosen: InkStyle;
};

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

function stuckReach(element: HTMLElement | null, edge: "top" | "bottom") {
	if (!element) return 0;
	const style = getComputedStyle(element);
	if (style.position !== "sticky") return 0;
	return (Number.parseFloat(style[edge]) || 0) + element.offsetHeight;
}

function useScrollClearance(
	main: RefObject<HTMLElement | null>,
	toolbar: RefObject<HTMLElement | null>,
	footer: RefObject<HTMLElement | null>,
	toolbarPlacement: FloatingToolbarProps["placement"] | null,
): ScrollClearance {
	const [clearance, setClearance] = useState(NO_CLEARANCE);
	useLayoutEffect(() => {
		const root = main.current;
		const pill = footer.current;
		if (!root || !pill) return;
		const update = () => {
			const bar = toolbarPlacement === "top" ? toolbar.current : null;
			const top = stuckReach(bar, "top") + SCROLL_GAP_PX;
			const bottom = stuckReach(pill, "bottom") + SCROLL_GAP_PX;
			setClearance((current) =>
				current.top === top && current.bottom === bottom
					? current
					: { ...NO_CLEARANCE, top, bottom },
			);
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(root, { box: "border-box" });
		observer.observe(pill);
		return () => observer.disconnect();
	}, [main, toolbar, footer, toolbarPlacement]);
	return clearance;
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

function placedSize(aspect: number): { widthIn: number; heightIn: number } {
	if (aspect >= 1) {
		return {
			widthIn: PLACED_LONG_SIDE_IN,
			heightIn: PLACED_LONG_SIDE_IN / aspect,
		};
	}
	return {
		widthIn: PLACED_LONG_SIDE_IN * aspect,
		heightIn: PLACED_LONG_SIDE_IN,
	};
}

function visibleSideCentre(spec: PageSpec): {
	side: number;
	xIn: number;
	yIn: number;
} | null {
	const view = window.visualViewport;
	const left = view?.offsetLeft ?? 0;
	const top = view?.offsetTop ?? 0;
	const right = left + (view?.width ?? window.innerWidth);
	const bottom = top + (view?.height ?? window.innerHeight);
	const centreY = (top + bottom) / 2;
	const writable = new Set(writingSides(spec));
	const sheets = [
		...document.querySelectorAll<HTMLElement>(
			".letter-page[data-mode='edit'] .letter-sheet",
		),
	].filter((sheet) => writable.has(Number(sheet.dataset.side)));
	let best: {
		area: number;
		distance: number;
		rect: DOMRect;
		sheet: HTMLElement;
	} | null = null;
	for (const sheet of sheets) {
		const rect = sheet.getBoundingClientRect();
		const width = Math.max(
			0,
			Math.min(rect.right, right) - Math.max(rect.left, left),
		);
		const height = Math.max(
			0,
			Math.min(rect.bottom, bottom) - Math.max(rect.top, top),
		);
		const area = width * height;
		const distance = Math.max(0, rect.top - centreY, centreY - rect.bottom);
		if (
			!best ||
			area > best.area ||
			(area === best.area && distance < best.distance)
		) {
			best = { area, distance, rect, sheet };
		}
	}
	if (!best || best.rect.width === 0 || best.rect.height === 0) return null;
	const sheetWidthIn = Number.parseFloat(best.sheet.style.width);
	const sheetHeightIn = Number.parseFloat(best.sheet.style.height);
	if (!sheetWidthIn || !sheetHeightIn) return null;
	const { rect } = best;
	const visLeft = Math.min(Math.max(rect.left, left), rect.right);
	const visRight = Math.max(Math.min(rect.right, right), rect.left);
	const visTop = Math.min(Math.max(rect.top, top), rect.bottom);
	const visBottom = Math.max(Math.min(rect.bottom, bottom), rect.top);
	return {
		side: Number(best.sheet.dataset.side ?? 0),
		xIn: (((visLeft + visRight) / 2 - rect.left) / rect.width) * sheetWidthIn,
		yIn: (((visTop + visBottom) / 2 - rect.top) / rect.height) * sheetHeightIn,
	};
}

function flowBottomOf(column: HTMLElement, spec: PageSpec): number | null {
	const page = column.closest(".letter-page");
	const text = column.querySelector(".letter-text");
	if (!(page instanceof HTMLElement) || !text) return null;
	const origin = page.getBoundingClientRect();
	const pxPerIn = origin.width / spec.widthIn;
	return (
		(text.getBoundingClientRect().bottom - origin.top) / pxPerIn + spec.marginIn
	);
}

function revealSheet(page: HTMLElement, side: number): boolean {
	const sheet = page.querySelector(`.letter-sheet[data-side="${side}"]`);
	if (!sheet) return false;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	window.scrollTo({
		top:
			sheet.getBoundingClientRect().top +
			window.scrollY -
			window.innerHeight * REVEAL_AT,
		behavior: reduced ? "auto" : "smooth",
	});
	return true;
}

export type LetterEditorProps = {
	letter: EditableLetter;
	doodles: LibraryDrawing[];
	signatures?: LibraryDrawing[];
	fonts?: FontOption[];
	fontOffer?: FontOption | null;
};

function withoutFontParam(): void {
	const url = new URL(window.location.href);
	if (!url.searchParams.has("font")) return;
	url.searchParams.delete("font");
	window.history.replaceState(null, "", url);
}

export function LetterEditor({
	letter,
	doodles,
	signatures = [],
	fonts = [],
	fontOffer = null,
}: LetterEditorProps) {
	const router = useRouter();
	const spec = PAGE_SPECS[letter.content.format];
	const [title, setTitle] = useState(letter.title);
	const [doc, setDoc] = useState(letter.content.doc);
	const [pageState, setPageState] = useState(() =>
		restingState(letter.content.doc),
	);
	const [flowBottomIn, setFlowBottomIn] = useState(0);
	const [resources, setResources] = useState<LetterResources>(letter.resources);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const [libraryTab, setLibraryTab] = useState<"doodle" | "signature">(
		"doodle",
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [preview, setPreview] = useState<PlacedElement | null>(null);
	const [revealSide, setRevealSide] = useState<number | null>(null);
	const pageRef = useRef<HTMLDivElement>(null);
	const mainRef = useRef<HTMLElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const footerRef = useRef<HTMLElement>(null);
	const caretPlaced = useRef(false);
	const inkReady = useInkReady(letter.content);
	const desk = useDeskScale(spec.widthIn);
	const coarsePointer = useCoarsePointer();
	const [keyboardClearancePx, setKeyboardClearancePx] = useState(0);
	const [offer, setOffer] = useState(fontOffer);
	const [defaults, setDefaults] = useState(letter.content.defaults);
	const defaultsRef = useRef(letter.content.defaults);
	const blankFont = useRef<BlankFontStep | null>(null);
	const [blankFontPending, setBlankFontPending] = useState<
		"undo" | "redo" | null
	>(null);
	const offerKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);
	const toolbarPlacement = letter.editable
		? coarsePointer
			? "bottom"
			: "top"
		: null;
	const scrollClearance = useScrollClearance(
		mainRef,
		toolbarRef,
		footerRef,
		toolbarPlacement,
	);

	const extensions = useMemo(() => editorExtensions(), []);
	const editor = useEditor({
		extensions,
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
			scrollMargin: scrollClearance,
			scrollThreshold: scrollClearance,
			handleKeyDown: (_view, event) => offerKeys.current(event),
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
				defaults: defaultsRef.current,
				doc: (editor?.getJSON() as LetterDoc | undefined) ?? letter.content.doc,
			},
		}),
		onNewerVersion: () => router.refresh(),
	});
	const { edited } = autosave;

	const moveBlankFont = useCallback(
		(direction: "undo" | "redo") => {
			const step = blankFont.current;
			if (!step || step.pending !== direction) return;
			const next = direction === "undo" ? step.original : step.chosen;
			const pending = direction === "undo" ? "redo" : "undo";
			defaultsRef.current = next;
			blankFont.current = { ...step, pending };
			setDefaults(next);
			setBlankFontPending(pending);
			edited();
			editor?.commands.focus();
		},
		[edited, editor],
	);

	useLayoutEffect(() => {
		offerKeys.current = (event) => {
			if (!editor) return false;
			const mod = event.metaKey || event.ctrlKey;
			if (!mod || event.altKey) return false;
			const key = event.key.toLowerCase();
			const wantsRedo = key === "y" || (key === "z" && event.shiftKey);
			const wantsUndo = key === "z" && !event.shiftKey;
			if (!wantsUndo && !wantsRedo) return false;
			if (wantsUndo && undo(editor.state)) return false;
			if (wantsRedo && redo(editor.state)) return false;
			const step = blankFont.current;
			if (wantsUndo && step?.pending === "undo") {
				moveBlankFont("undo");
				return true;
			}
			if (wantsRedo && step?.pending === "redo") {
				moveBlankFont("redo");
				return true;
			}
			return false;
		};
	}, [editor, moveBlankFont]);

	const [empty, setEmpty] = useState(() => isBlank(letter.content.doc));

	const measure = useCallback(() => {
		const column =
			pageRef.current?.querySelector<HTMLElement>(".letter-column");
		if (!column || !editor) return;
		const nextDoc = editor.getJSON() as LetterDoc;
		setDoc(nextDoc);
		setPageState(pageStateOf(spec, column, nextDoc));
		setFlowBottomIn(flowBottomOf(column, spec) ?? 0);
	}, [editor, spec]);

	useEffect(() => {
		if (!editor) return;
		const onUpdate = () => {
			edited();
			setEmpty(editor.isEmpty);
			setDoc(editor.getJSON() as LetterDoc);
			measure();
		};
		const onFocus = () => setSelectedId(null);
		editor.on("update", onUpdate);
		editor.on("focus", onFocus);
		return () => {
			editor.off("update", onUpdate);
			editor.off("focus", onFocus);
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
		if (!editor || !inkReady || !letter.editable || caretPlaced.current) {
			return;
		}
		caretPlaced.current = true;
		const active = document.activeElement;
		if (!isBlank(letter.content.doc) || (active && active !== document.body)) {
			return;
		}
		editor.view.focus();
	}, [editor, inkReady, letter.editable, letter.content.doc]);

	useEffect(() => {
		const page = pageRef.current;
		if (!page || !editor || !letter.editable) return;
		const onPress = (event: MouseEvent) => {
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest(
					"[data-element-menu], [data-front-picker], .letter-handles [data-element-id]",
				)
			) {
				return;
			}
			setSelectedId(null);
			if (target instanceof Node && editor.view.dom.contains(target)) return;
			event.preventDefault();
			editor.commands.focus("end");
		};
		page.addEventListener("mousedown", onPress);
		return () => page.removeEventListener("mousedown", onPress);
	}, [editor, letter.editable]);

	useEffect(() => {
		if (!editor || !letter.editable) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.altKey) return;
			if (!event.metaKey && !event.ctrlKey) return;
			const key = event.key.toLowerCase();
			const redoing = event.shiftKey ? key === "z" : key === "y";
			if (key !== "z" && !redoing) return;
			const target = event.target;
			if (
				target instanceof Element &&
				target.closest(
					"input, textarea, select, [contenteditable='true'], [role='dialog']",
				)
			) {
				return;
			}
			event.preventDefault();
			(redoing ? redo : undo)(editor.state, (transaction) =>
				editor.view.dispatch(transaction),
			);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [editor, letter.editable]);

	const gapIn = pageGapIn("edit");
	const sheets = pageState.sides + (pageState.overflowIn > 0 ? 1 : 0);
	const stackIn = sheets * spec.heightIn + Math.max(0, sheets - 1) * gapIn;
	const heightIn = Math.max(stackIn, flowBottomIn);
	const scale = desk.scale ?? 1;

	useEffect(() => {
		const page = pageRef.current;
		if (revealSide === null || !page || revealSide >= sheets) return;
		if (revealSheet(page, revealSide)) setRevealSide(null);
	}, [revealSide, sheets]);

	const live = { ...letter.content, defaults, doc };
	const shownElements = live.doc.attrs.elements.map((element) =>
		preview?.id === element.id ? preview : element,
	);
	const shown = {
		...live,
		doc: {
			...live.doc,
			attrs: { ...live.doc.attrs, elements: shownElements },
		},
	};
	const placementWarning = placementSentence(
		pageState.issues.filter(
			(issue) =>
				issue.elementId !== selectedId &&
				shownElements.some((element) => element.id === issue.elementId),
		),
		spec.product,
		shownElements,
	);

	function registerOwnFont(fontId: string) {
		const assetId = fonts.find((font) => font.id === fontId)?.assetId;
		if (!assetId) return;
		setResources((current) =>
			current.fonts[fontId] === assetId
				? current
				: { ...current, fonts: { ...current.fonts, [fontId]: assetId } },
		);
	}

	function closeOffer() {
		setOffer(null);
		withoutFontParam();
	}

	function placeDrawing(drawing: LibraryDrawing) {
		if (!editor) return;
		const centre = visibleSideCentre(spec) ?? {
			side: writingSides(spec)[0] ?? 0,
			xIn: spec.widthIn / 2,
			yIn: spec.heightIn / 2,
		};
		const size = placedSize(drawing.aspect);
		const element: PlacedElement = {
			id: crypto.randomUUID(),
			kind: "drawing",
			drawingId: drawing.id,
			...placementFor(spec, centre, size, elementsOf(editor.state)),
			...size,
			rotationDeg: 0,
			tint: letter.content.defaults.color,
			wrap: false,
		};
		setResources((current) => ({
			...current,
			drawings: {
				...current.drawings,
				[drawing.id]: {
					maskAssetId: drawing.maskAssetId,
					aspect: drawing.aspect,
				},
			},
		}));
		editor.view.dispatch(placeElement(editor.state, element));
		setSelectedId(element.id);
		setLibraryOpen(false);
	}

	function signDrawing(
		drawing: LibraryDrawing,
		choice: {
			widthIn: (typeof SIGNATURE_WIDTHS)[number];
			color: InkColorId;
		},
	) {
		if (!editor) return;
		setResources((current) => ({
			...current,
			drawings: {
				...current.drawings,
				[drawing.id]: {
					maskAssetId: drawing.maskAssetId,
					aspect: drawing.aspect,
				},
			},
		}));
		const size = {
			widthIn: choice.widthIn,
			heightIn: choice.widthIn / drawing.aspect,
		};
		editor.view.dispatch(
			signLetter(editor.state, {
				id: crypto.randomUUID(),
				kind: "signature",
				drawingId: drawing.id,
				...signaturePlacement(
					spec,
					pageState.measure.textBottomIn,
					size,
					elementsOf(editor.state),
				),
				...size,
				rotationDeg: 0,
				tint: choice.color,
				wrap: false,
			}),
		);
		setSelectedId(signatureOf(editor.state)?.id ?? null);
		setLibraryOpen(false);
	}

	return (
		<Desk className="flex flex-col">
			{letter.editable ? (
				<StudioHeaderActions>
					<ExportButton
						letterId={letter.id}
						spec={spec}
						revision={
							autosave.state.status === "saved" ? autosave.state.revision : null
						}
						blocker={exportBlocker({
							wordsPastLimit: pageState.measure.wordsPastLimit,
							maxPages: spec.maxPages,
							placement: placementSentence(
								pageState.issues,
								spec.product,
								shownElements,
							),
							frontMissing:
								spec.front === "image" && doc.attrs.frontImageAssetId === null,
						})}
					/>
				</StudioHeaderActions>
			) : null}
			<main
				ref={mainRef}
				className="flex flex-1 flex-col items-center px-4 pt-4 pb-6 sm:px-8"
				style={
					keyboardClearancePx > 0
						? { paddingBottom: `calc(1.5rem + ${keyboardClearancePx}px)` }
						: undefined
				}
			>
				{editor && letter.editable ? (
					<EditorToolbar
						ref={toolbarRef}
						editor={editor}
						letterId={letter.id}
						defaults={defaults}
						fonts={fonts}
						coarsePointer={coarsePointer}
						offerUndo={blankFontPending === "undo"}
						offerRedo={blankFontPending === "redo"}
						onUndoOffer={() => moveBlankFont("undo")}
						onRedoOffer={() => moveBlankFont("redo")}
						onKeyboardClearance={setKeyboardClearancePx}
						onLibrary={() => {
							setLibraryTab("doodle");
							setLibraryOpen(true);
						}}
						onOwnFont={registerOwnFont}
					/>
				) : null}
				{editor && offer ? (
					<FontOffer
						ownerName={offer.ownerName}
						onDismiss={closeOffer}
						onUse={() => {
							registerOwnFont(offer.id);
							const font = { kind: "own", fontId: offer.id } as const;
							if (isBlank(editor.getJSON() as LetterDoc)) {
								const original = defaultsRef.current;
								const chosen = { ...original, font };
								defaultsRef.current = chosen;
								blankFont.current = { pending: "undo", original, chosen };
								setDefaults(chosen);
								setBlankFontPending("undo");
								edited();
							} else {
								editor.view.dispatch(writeLetterIn(editor.state, font));
							}
							editor.view.focus();
							closeOffer();
						}}
					/>
				) : null}
				<div ref={desk.ref} className="flex w-full justify-center">
					<div
						className="pointer-events-none -mx-4 -mt-6 -mb-10 overflow-hidden px-4 pt-6 pb-10 transition-opacity duration-(--duration-settle) ease-settle data-[ready=false]:opacity-0 sm:-mx-6 sm:px-6"
						data-ready={desk.scale !== null}
					>
						<div
							ref={pageRef}
							className="pointer-events-auto relative"
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
									content={shown}
									resources={resources}
									mode="edit"
									mergeValues={null}
									sheets={sheets}
									handles={
										editor && letter.editable ? (
											<>
												<KeepClearGuides
													spec={spec}
													sheets={sheets}
													gapIn={gapIn}
													scale={scale}
												/>
												<ElementHandles
													elements={shownElements}
													spec={spec}
													gapIn={gapIn}
													scale={scale}
													coarsePointer={coarsePointer}
													issues={pageState.issues}
													selectedId={selectedId}
													onSelect={setSelectedId}
													onRelease={() => {
														setSelectedId(null);
														editor.commands.focus(undefined, {
															scrollIntoView: false,
														});
													}}
													onPreview={setPreview}
													onCommit={(id, change) => {
														editor.view.dispatch(
															updateElement(editor.state, id, change),
														);
													}}
													onRemove={(id) => {
														editor.view.dispatch(
															removeElement(editor.state, id),
														);
														setSelectedId(null);
														setPreview(null);
														editor.commands.focus(undefined, {
															scrollIntoView: false,
														});
													}}
												/>
											</>
										) : undefined
									}
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
							{editor && letter.editable && spec.front === "image" ? (
								<FrontImagePicker
									editor={editor}
									assetId={doc.attrs.frontImageAssetId}
									style={{ height: `${spec.heightIn * PX_PER_IN * scale}px` }}
								/>
							) : null}
						</div>
					</div>
				</div>
				<div className="mt-6 flex w-full max-w-xl flex-col items-center gap-3">
					{placementWarning ? (
						<p
							className="text-center text-ui"
							style={{ color: "var(--danger)" }}
						>
							{placementWarning}
						</p>
					) : null}
					<OverflowNotice
						words={pageState.measure.wordsPastLimit}
						maxPages={spec.maxPages}
					/>
					<div className="flex flex-wrap items-center justify-center gap-3">
						<SidesIndicator sides={pageState.sides} maxPages={spec.maxPages} />
						{editor && letter.editable ? (
							<AddSide
								editor={editor}
								sides={pageState.sides}
								maxPages={spec.maxPages}
								onAdded={setRevealSide}
							/>
						) : null}
						{editor && letter.editable ? (
							<SignButton
								onClick={() => {
									setLibraryTab("signature");
									setLibraryOpen(true);
								}}
							/>
						) : null}
						<PrintPreview
							letterId={letter.id}
							content={live}
							resources={resources}
							sides={pageState.sides}
						/>
					</div>
					<HumanSeal
						letterId={letter.id}
						content={live}
						sealFonts={letter.sealFonts}
						fonts={fonts}
					/>
				</div>
				<footer
					ref={footerRef}
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
			{letter.editable ? (
				<LibrarySheet
					open={libraryOpen}
					onOpenChange={setLibraryOpen}
					doodles={doodles}
					signatures={signatures}
					tab={libraryTab}
					onTab={setLibraryTab}
					onPlace={placeDrawing}
					onSign={signDrawing}
				/>
			) : null}
		</Desk>
	);
}
