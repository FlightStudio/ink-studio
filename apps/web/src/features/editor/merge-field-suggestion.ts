"use client";

import { shift } from "@floating-ui/dom";
import type { InkMark, MergeFieldKey } from "@repo/types";
import { MERGE_FIELDS } from "@repo/types";
import type { Editor, Range } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import Suggestion, { exitSuggestion } from "@tiptap/suggestion";
import { MergeFieldMenu } from "./merge-field-menu.tsx";
import {
	fieldTrigger,
	type MergeFieldItem,
	mergeFieldItems,
} from "./merge-fields.ts";

const mergeFieldSuggestionKey = new PluginKey("mergeFieldSuggestion");

const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

type FieldProps = SuggestionProps<MergeFieldItem, MergeFieldItem>;

const toolbarTriggerKey = new PluginKey<number | null>(
	"mergeFieldToolbarTrigger",
);

const toolbarTrigger = new Plugin<number | null>({
	key: toolbarTriggerKey,
	state: {
		init: () => null,
		apply: (tr) => tr.getMeta(toolbarTriggerKey) ?? null,
	},
});

function inkOf(editor: Editor): InkMark | null {
	const { state } = editor;
	const marks = state.storedMarks ?? state.selection.$from.marks();
	const ink = marks.find((mark) => mark.type.name === "ink");
	if (!ink) return null;
	return { type: "ink", attrs: ink.attrs as InkMark["attrs"] };
}

export function insertMergeField(
	editor: Editor,
	field: MergeFieldKey,
	range?: Range,
): void {
	const { state } = editor;
	const type = state.schema.nodes.mergeField;
	const inkType = state.schema.marks.ink;
	if (!type || !inkType) return;
	const ink = inkOf(editor);
	const mark = ink ? inkType.create(ink.attrs) : null;
	const node = type.create({ field }, null, mark ? [mark] : undefined);
	const tr = state.tr;
	if (range) tr.replaceWith(range.from, range.to, node);
	else tr.replaceSelectionWith(node, false);
	if (mark) tr.setStoredMarks([mark]);
	editor.view.dispatch(tr.scrollIntoView());
}

export function startMergeField(editor: Editor): void {
	if (mergeFieldSuggestionKey.getState(editor.state)?.active) {
		editor.view.focus();
		return;
	}
	const { state } = editor;
	const at = state.selection.to;
	const trigger = fieldTrigger(state);
	const tr = state.tr.insertText(trigger, at);
	tr.setSelection(TextSelection.create(tr.doc, at + trigger.length));
	tr.setMeta(toolbarTriggerKey, trigger.length - 1);
	editor.view.dispatch(tr.scrollIntoView());
	editor.view.focus();
}

export const mergeFieldSuggestion = Extension.create({
	name: "mergeFieldSuggestion",
	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			toolbarTrigger,
			Suggestion<MergeFieldItem, MergeFieldItem>({
				pluginKey: mergeFieldSuggestionKey,
				editor,
				char: "@",
				allowSpaces: false,
				allowedPrefixes: [" "],
				decorationClass: "merge-query",
				offset: { mainAxis: 6 },
				floatingUi: { strategy: "fixed", middleware: [shift({ padding: 8 })] },
				dismissOnOutsideClick: false,
				command: ({ editor: current, range, props }) => {
					insertMergeField(current, props.field, range);
				},
				render: () => {
					let renderer: ReactRenderer<unknown, Record<string, unknown>> | null =
						null;
					let unmount: (() => void) | null = null;
					let selected = 0;
					let latest: FieldProps | null = null;
					let items: MergeFieldItem[] = [];
					let lead: number | null = null;

					const pick = (field: MergeFieldKey) =>
						latest?.command({ field, label: MERGE_FIELDS[field].label });

					const takeBackTrigger = (): boolean => {
						if (lead === null || !latest || latest.query !== "") return false;
						const { view } = latest.editor;
						view.dispatch(
							view.state.tr.delete(latest.range.from - lead, latest.range.to),
						);
						return true;
					};

					const dismiss = () => {
						if (!latest) return;
						const { view } = latest.editor;
						if (!takeBackTrigger()) {
							exitSuggestion(view, mergeFieldSuggestionKey);
						}
					};

					const onQuery = (event: PointerEvent): boolean => {
						if (!latest) return false;
						const { view } = latest.editor;
						if (!(event.target instanceof Node)) return false;
						if (!view.dom.contains(event.target)) return false;
						const at = view.posAtCoords({
							left: event.clientX,
							top: event.clientY,
						});
						return (
							at !== null &&
							at.pos >= latest.range.from &&
							at.pos <= latest.range.to
						);
					};

					const outside = (event: Event) => {
						const target = event.target;
						if (!(target instanceof Node) || !latest) return;
						if (renderer?.element.contains(target)) return;
						if (event instanceof PointerEvent && onQuery(event)) return;
						dismiss();
					};

					const render = () =>
						renderer?.updateProps({
							items,
							selectedIndex: selected,
							onPick: pick,
						});

					const scrollOptions = { capture: true, passive: true } as const;

					return {
						onStart: (props) => {
							lead = toolbarTriggerKey.getState(props.editor.state) ?? null;
							latest = props;
							items = mergeFieldItems(props.query);
							selected = 0;
							renderer = new ReactRenderer(MergeFieldMenu, {
								editor: props.editor,
								props: { items, selectedIndex: selected, onPick: pick },
							});
							renderer.element.style.zIndex = "40";
							unmount = props.mount(renderer.element);
							props.editor.on("blur", dismiss);
							document.addEventListener("pointerdown", outside, true);
							window.addEventListener("wheel", outside, scrollOptions);
							window.addEventListener("touchmove", outside, scrollOptions);
						},
						onUpdate: (props) => {
							latest = props;
							items = mergeFieldItems(props.query);
							if (selected >= items.length) selected = 0;
							render();
						},
						onExit: (props) => {
							props.editor.off("blur", dismiss);
							document.removeEventListener("pointerdown", outside, true);
							window.removeEventListener("wheel", outside, scrollOptions);
							window.removeEventListener("touchmove", outside, scrollOptions);
							unmount?.();
							renderer?.destroy();
							renderer = null;
							unmount = null;
							latest = null;
						},
						onKeyDown: ({ event }) => {
							if (event.key === "Escape" || CARET_KEYS.has(event.key)) {
								return takeBackTrigger();
							}
							if (items.length === 0) return false;
							if (event.key === "ArrowDown") {
								selected = (selected + 1) % items.length;
								render();
								return true;
							}
							if (event.key === "ArrowUp") {
								selected = (selected + items.length - 1) % items.length;
								render();
								return true;
							}
							if (event.key === "Enter" || event.key === "Tab") {
								const item = items[selected];
								if (item) pick(item.field);
								return true;
							}
							return false;
						},
					};
				},
			}),
		];
	},
});
