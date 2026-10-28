"use client";

import type {
	Align,
	FontOption,
	FontRef,
	InkColorId,
	InkMark,
	InkStyle,
	StockFontId,
	TextSizePt,
} from "@repo/types";
import { INK_COLORS, STOCK_FONTS, TEXT_SIZES } from "@repo/types";
import { FloatingToolbar, Toolbar } from "@repo/ui/components/floating-toolbar";
import { Swatch } from "@repo/ui/components/swatch";
import { Button } from "@repo/ui/components/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/ui/select";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@repo/ui/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import type { Editor } from "@tiptap/core";
import {
	closeHistory,
	redo,
	redoDepth,
	undo,
	undoDepth,
} from "@tiptap/pm/history";
import type { Mark } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	AtSign,
	Images,
	Redo2,
	Undo2,
} from "lucide-react";
import Link from "next/link";
import {
	type CSSProperties,
	type ReactNode,
	type RefObject,
	useLayoutEffect,
	useRef,
	useSyncExternalStore,
} from "react";
import { openMergeFieldMenu } from "../merge-field-suggestion.ts";

const COARSE_POINTER = "(pointer: coarse)";
const KEYBOARD_GAP_PX = 12;
const KEYBOARD_PLACEMENT: CSSProperties = {
	position: "fixed",
	top: 0,
	left: 0,
	bottom: "auto",
};

type InkAttrs = InkMark["attrs"];

type ResolvedStyle = {
	font: FontRef | null;
	sizePt: TextSizePt | null;
	color: InkColorId | null;
	align: Align | null;
	canUndo: boolean;
	canRedo: boolean;
};

const ALIGN_ITEMS: { value: Align; label: string; icon: ReactNode }[] = [
	{ value: "left", label: "Align left", icon: <AlignLeft /> },
	{ value: "center", label: "Align centre", icon: <AlignCenter /> },
	{ value: "right", label: "Align right", icon: <AlignRight /> },
];

const FONT_ITEMS = Object.entries(STOCK_FONTS).map(([id, font]) => ({
	value: id as StockFontId,
	label: font.label,
}));

const INK_ITEMS = Object.entries(INK_COLORS).map(([id, color]) => ({
	id: id as InkColorId,
	...color,
}));

function inkOf(marks: readonly Mark[]): InkAttrs {
	const ink = marks.find((mark) => mark.type.name === "ink");
	return ink
		? (ink.attrs as InkAttrs)
		: { font: null, sizePt: null, color: null };
}

function fontKey(font: FontRef): string {
	return font.kind === "stock" ? `stock:${font.id}` : `own:${font.fontId}`;
}

function agreed<T>(values: T[], key: (value: T) => string): T | null {
	const [first, ...rest] = values;
	if (first === undefined) return null;
	const firstKey = key(first);
	return rest.every((value) => key(value) === firstKey) ? first : null;
}

function resolvedStyle(state: EditorState, defaults: InkStyle): ResolvedStyle {
	const { selection, doc } = state;
	const inks: InkAttrs[] = [];
	const aligns: Align[] = [];
	doc.nodesBetween(selection.from, selection.to, (node) => {
		if (node.type.name === "paragraph") aligns.push(node.attrs.align);
		if (!selection.empty && node.isInline) inks.push(inkOf(node.marks));
	});
	if (inks.length === 0) {
		inks.push(inkOf(state.storedMarks ?? selection.$from.marks()));
	}
	return {
		font: agreed(
			inks.map((ink) => ink.font ?? defaults.font),
			fontKey,
		),
		sizePt: agreed(
			inks.map((ink) => ink.sizePt ?? defaults.sizePt),
			String,
		),
		color: agreed(
			inks.map((ink) => ink.color ?? defaults.color),
			String,
		),
		align: agreed(aligns, String),
		canUndo: undoDepth(state) > 0,
		canRedo: redoDepth(state) > 0,
	};
}

function ownUndoStep({ tr }: { tr: Transaction }): boolean {
	closeHistory(tr);
	return true;
}

function formatInk(editor: Editor, attrs: Partial<InkAttrs>): void {
	editor.chain().focus().command(ownUndoStep).setMark("ink", attrs).run();
}

function alignParagraphs(editor: Editor, align: Align): void {
	editor
		.chain()
		.focus()
		.command(ownUndoStep)
		.updateAttributes("paragraph", { align })
		.run();
}

function runHistory(editor: Editor, command: typeof undo): void {
	command(editor.state, editor.view.dispatch);
	editor.commands.focus();
}

function subscribeCoarsePointer(onChange: () => void): () => void {
	const query = window.matchMedia(COARSE_POINTER);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

export function useCoarsePointer(): boolean {
	return useSyncExternalStore(
		subscribeCoarsePointer,
		() => window.matchMedia(COARSE_POINTER).matches,
		() => false,
	);
}

function useFollowKeyboard(
	ref: RefObject<HTMLDivElement | null>,
	enabled: boolean,
	onHeight: (heightPx: number) => void,
): void {
	useLayoutEffect(() => {
		const toolbar = ref.current;
		const viewport = window.visualViewport;
		if (!enabled || !toolbar || !viewport) return;
		const place = () => {
			const x = viewport.offsetLeft + viewport.width / 2;
			const y = viewport.offsetTop + viewport.height - KEYBOARD_GAP_PX;
			toolbar.style.translate = `calc(${x}px - 50%) calc(${y}px - 100%)`;
		};
		const measure = () => onHeight(toolbar.offsetHeight + KEYBOARD_GAP_PX);
		place();
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(toolbar);
		viewport.addEventListener("resize", place);
		viewport.addEventListener("scroll", place);
		return () => {
			observer.disconnect();
			viewport.removeEventListener("resize", place);
			viewport.removeEventListener("scroll", place);
			toolbar.style.translate = "";
			onHeight(0);
		};
	}, [ref, enabled, onHeight]);
}

function HistoryButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Toolbar.Button
						disabled={disabled}
						onClick={onClick}
						aria-label={label}
						render={
							<Button
								variant="ghost"
								size="icon"
								className="data-disabled:opacity-40"
							/>
						}
					/>
				}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}

export type EditorToolbarProps = {
	editor: Editor;
	defaults: InkStyle;
	fonts?: FontOption[];
	coarsePointer: boolean;
	onKeyboardClearance: (heightPx: number) => void;
	onLibrary: () => void;
	onOwnFont?: (fontId: string) => void;
};

function fontFromKey(key: string): FontRef | null {
	if (key.startsWith("stock:")) {
		const id = key.slice("stock:".length);
		if (id in STOCK_FONTS) return { kind: "stock", id: id as StockFontId };
		return null;
	}
	if (key.startsWith("own:")) {
		return { kind: "own", fontId: key.slice("own:".length) };
	}
	return null;
}

export function EditorToolbar({
	editor,
	defaults,
	fonts = [],
	coarsePointer,
	onKeyboardClearance,
	onLibrary,
	onOwnFont,
}: EditorToolbarProps) {
	const ref = useRef<HTMLDivElement>(null);
	const style = useEditorState({
		editor,
		selector: ({ editor: current }) => resolvedStyle(current.state, defaults),
	});
	useFollowKeyboard(ref, coarsePointer, onKeyboardClearance);
	const built = fonts.filter((font) => font.assetId !== null);
	const items = [
		...FONT_ITEMS.map((item) => ({
			value: `stock:${item.value}`,
			label: item.label,
		})),
		...built.map((font) => ({
			value: `own:${font.id}`,
			label: `${font.ownerName}'s handwriting`,
		})),
	];
	const font = style.font ? fontKey(style.font) : null;

	return (
		<TooltipProvider delay={400}>
			<FloatingToolbar
				ref={ref}
				placement={coarsePointer ? "bottom" : "top"}
				aria-label="Formatting"
				className="mb-5 max-w-[calc(100vw-1rem)] overflow-x-auto"
				style={coarsePointer ? KEYBOARD_PLACEMENT : undefined}
			>
				<Toolbar.Group aria-label="History" className="flex">
					<HistoryButton
						label="Undo"
						disabled={!style.canUndo}
						onClick={() => runHistory(editor, undo)}
					>
						<Undo2 />
					</HistoryButton>
					<HistoryButton
						label="Redo"
						disabled={!style.canRedo}
						onClick={() => runHistory(editor, redo)}
					>
						<Redo2 />
					</HistoryButton>
				</Toolbar.Group>
				<Toolbar.Separator />
				<Select
					items={items}
					value={font}
					onValueChange={(next) => {
						if (!next) return;
						const chosen = fontFromKey(next);
						if (!chosen) return;
						formatInk(editor, { font: chosen });
						if (chosen.kind === "own") onOwnFont?.(chosen.fontId);
					}}
					onOpenChange={(open) => {
						if (!open) editor.commands.focus();
					}}
				>
					<Toolbar.Button
						render={
							<SelectTrigger
								aria-label="Font"
								className="w-38 rounded-full border-transparent pl-3.5 hover:bg-muted"
							/>
						}
					>
						<SelectValue placeholder="Mixed fonts" />
					</Toolbar.Button>
					<SelectContent
						finalFocus={false}
						alignItemWithTrigger={false}
						align="start"
						sideOffset={8}
						className="w-auto min-w-(--anchor-width) p-1"
					>
						{built.map((item) =>
							item.assetId ? (
								<style
									key={item.id}
								>{`@font-face { font-family: "own-${item.id}"; src: url("/api/assets/${item.assetId}"); font-display: block; }`}</style>
							) : null,
						)}
						<SelectGroup>
							<SelectLabel>Stock</SelectLabel>
							{FONT_ITEMS.map((item) => (
								<SelectItem
									key={item.value}
									value={`stock:${item.value}`}
									className="overflow-hidden py-1.5 pl-2.5 text-title"
									style={{ fontFamily: `"stock-${item.value}"` }}
								>
									{item.label}
								</SelectItem>
							))}
						</SelectGroup>
						<SelectGroup>
							<SelectLabel>My handwriting</SelectLabel>
							{built.length === 0 ? (
								<Link
									href="/fonts/new"
									className="block rounded-md px-2.5 py-1.5 text-ui text-ink hover:bg-muted"
								>
									Make a handwriting font
								</Link>
							) : (
								built.map((item) => (
									<SelectItem
										key={item.id}
										value={`own:${item.id}`}
										className="overflow-hidden py-1.5 pl-2.5 text-title"
										style={{ fontFamily: `"own-${item.id}", "stock-caveat"` }}
									>
										{item.ownerName}'s handwriting
									</SelectItem>
								))
							)}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Toolbar.Separator />
				<ToggleGroup
					aria-label="Size"
					spacing={0}
					value={style.sizePt === null ? [] : [String(style.sizePt)]}
					onValueChange={(next) => {
						const sizePt = TEXT_SIZES.find((size) => String(size) === next[0]);
						if (sizePt !== undefined) formatInk(editor, { sizePt });
					}}
				>
					{TEXT_SIZES.map((size) => (
						<Toolbar.Button
							key={size}
							aria-label={`${size} pt`}
							render={
								<ToggleGroupItem
									value={String(size)}
									className="tabular-nums"
								/>
							}
						>
							{size}
						</Toolbar.Button>
					))}
				</ToggleGroup>
				<Toolbar.Separator />
				<div role="radiogroup" aria-label="Ink" className="flex">
					{INK_ITEMS.map((ink) => (
						<Swatch
							key={ink.id}
							color={ink.css}
							label={ink.label}
							labelHidden
							selected={style.color === ink.id}
							onSelect={() => formatInk(editor, { color: ink.id })}
						/>
					))}
				</div>
				<Toolbar.Separator />
				<ToggleGroup
					aria-label="Align"
					spacing={0}
					value={style.align === null ? [] : [style.align]}
					onValueChange={(next) => {
						const align = ALIGN_ITEMS.find((item) => item.value === next[0]);
						if (align) alignParagraphs(editor, align.value);
					}}
				>
					{ALIGN_ITEMS.map((item) => (
						<Tooltip key={item.value}>
							<TooltipTrigger
								render={
									<Toolbar.Button
										aria-label={item.label}
										render={<ToggleGroupItem value={item.value} />}
									/>
								}
							>
								{item.icon}
							</TooltipTrigger>
							<TooltipContent side="bottom">{item.label}</TooltipContent>
						</Tooltip>
					))}
				</ToggleGroup>
				<Toolbar.Separator />
				<Tooltip>
					<TooltipTrigger
						render={
							<Toolbar.Button
								aria-label="Insert field"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => openMergeFieldMenu(editor)}
								render={<Button variant="ghost" size="icon" />}
							/>
						}
					>
						<AtSign />
					</TooltipTrigger>
					<TooltipContent side="bottom">Insert field</TooltipContent>
				</Tooltip>
				<Toolbar.Separator />
				<Tooltip>
					<TooltipTrigger
						render={
							<Toolbar.Button
								aria-label="Library"
								onClick={onLibrary}
								render={<Button variant="ghost" size="icon" />}
							/>
						}
					>
						<Images />
					</TooltipTrigger>
					<TooltipContent side="bottom">Library</TooltipContent>
				</Tooltip>
			</FloatingToolbar>
		</TooltipProvider>
	);
}
