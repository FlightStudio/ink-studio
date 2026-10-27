"use client";

import {
	LetterPage,
	measureInputFor,
	measureLetter,
	pageGapIn,
	sidesUsed,
} from "@repo/render/html";
import { letterExtensions } from "@repo/render/schema";
import type { EditableLetter } from "@repo/services/letters";
import type { FontRef, LetterContent, LetterDoc } from "@repo/types";
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
import { LetterTitle } from "./letter-title.tsx";
import { SaveLine } from "./save-line.tsx";

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

export type LetterEditorProps = { letter: EditableLetter };

export function LetterEditor({ letter }: LetterEditorProps) {
	const router = useRouter();
	const spec = PAGE_SPECS[letter.content.format];
	const [title, setTitle] = useState(letter.title);
	const [sheets, setSheets] = useState(letter.content.doc.attrs.minSides);
	const pageRef = useRef<HTMLDivElement>(null);
	const inkReady = useInkReady(letter.content);
	const desk = useDeskScale(spec.widthIn);

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
		const { textBottomIn } = measureLetter(
			column,
			measureInputFor(spec, "edit"),
		);
		const minSides = Number(editor.state.doc.attrs.minSides) || 1;
		setSheets(sidesUsed(spec, { textBottomIn, boxes: [], minSides }));
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
	const heightIn = sheets * spec.heightIn + (sheets - 1) * gapIn;
	const scale = desk.scale ?? 1;

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
			<main className="flex flex-1 flex-col items-center px-4 pt-4 pb-6 sm:px-8">
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
								<LetterPage
									letterId={letter.id}
									content={letter.content}
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
				<footer className="sticky bottom-4 z-10 mt-8 flex max-w-full items-center gap-4 rounded-full bg-paper py-1.5 pr-2 pl-5 shadow-float ring-1 ring-[oklch(0.3_0.03_60/0.06)]">
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
