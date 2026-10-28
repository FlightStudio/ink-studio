"use client";

import type { InkMark, MergeFieldKey } from "@repo/types";
import { MERGE_FIELDS } from "@repo/types";
import type { Editor, Range } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import Suggestion from "@tiptap/suggestion";
import {
	type MergeFieldItem,
	MergeFieldMenu,
	placeMergeFieldMenu,
} from "./merge-field-menu.tsx";

const mergeFieldSuggestionKey = new PluginKey("mergeFieldSuggestion");

type FieldProps = SuggestionProps<MergeFieldItem, MergeFieldItem>;

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

export function mergeFieldItems(query: string): MergeFieldItem[] {
	const needle = query.toLocaleLowerCase();
	return (
		Object.entries(MERGE_FIELDS) as [
			MergeFieldKey,
			(typeof MERGE_FIELDS)[MergeFieldKey],
		][]
	)
		.filter(([, field]) => field.label.toLocaleLowerCase().includes(needle))
		.map(([field, value]) => ({ field, label: value.label }));
}

let manualClose: (() => void) | null = null;

function closeManualMenu(): void {
	manualClose?.();
	manualClose = null;
}

function caretRect(editor: Editor): DOMRect | null {
	try {
		const coords = editor.view.coordsAtPos(editor.state.selection.from);
		return new DOMRect(
			coords.left,
			coords.top,
			Math.max(1, coords.right - coords.left),
			Math.max(1, coords.bottom - coords.top),
		);
	} catch {
		return null;
	}
}

export function openMergeFieldMenu(editor: Editor): void {
	if (mergeFieldSuggestionKey.getState(editor.state)?.active) return;
	closeManualMenu();
	editor.commands.focus();
	const items = mergeFieldItems("");
	let selected = 0;
	const pick = (field: MergeFieldKey) => {
		insertMergeField(editor, field);
		close();
	};
	const renderer = new ReactRenderer(MergeFieldMenu, {
		editor,
		props: { items, selectedIndex: selected, onPick: pick },
	});
	const onKey = (event: KeyboardEvent) => {
		if (event.key === "ArrowDown") {
			if (items.length === 0) return;
			selected = (selected + 1) % items.length;
			renderer.updateProps({ selectedIndex: selected });
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.key === "ArrowUp") {
			if (items.length === 0) return;
			selected = (selected + items.length - 1) % items.length;
			renderer.updateProps({ selectedIndex: selected });
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.key === "Enter") {
			const item = items[selected];
			if (item) pick(item.field);
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.key === "Escape") {
			close();
			event.preventDefault();
			event.stopPropagation();
		}
	};
	function close() {
		window.removeEventListener("keydown", onKey, true);
		renderer.destroy();
		renderer.element.remove();
		if (manualClose === close) manualClose = null;
	}
	document.body.append(renderer.element);
	window.addEventListener("keydown", onKey, true);
	void placeMergeFieldMenu(renderer.element, () => caretRect(editor));
	manualClose = close;
}

export const mergeFieldSuggestion = Extension.create({
	name: "mergeFieldSuggestion",
	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			Suggestion<MergeFieldItem, MergeFieldItem>({
				pluginKey: mergeFieldSuggestionKey,
				editor,
				char: "@",
				allowSpaces: false,
				allowedPrefixes: [" "],
				decorationClass: "merge-query",
				items: ({ query }) => mergeFieldItems(query),
				command: ({ editor: current, range, props }) => {
					insertMergeField(current, props.field, range);
				},
				render: () => {
					let renderer: ReactRenderer<unknown, Record<string, unknown>> | null =
						null;
					let selected = 0;
					let latest: FieldProps | null = null;
					let items: MergeFieldItem[] = [];
					const reposition = () => {
						if (!renderer || !latest?.clientRect) return;
						void placeMergeFieldMenu(renderer.element, latest.clientRect);
					};
					const show = (props: FieldProps) => {
						latest = props;
						items = props.items;
						if (selected >= items.length) selected = 0;
						renderer?.updateProps({
							items,
							selectedIndex: selected,
							onPick: (field: MergeFieldKey) =>
								props.command({
									field,
									label: MERGE_FIELDS[field].label,
								}),
						});
						reposition();
					};
					return {
						onStart: (props) => {
							closeManualMenu();
							selected = 0;
							renderer = new ReactRenderer(MergeFieldMenu, {
								editor: props.editor,
								props: {
									items: props.items,
									selectedIndex: 0,
									onPick: (field: MergeFieldKey) =>
										props.command({
											field,
											label: MERGE_FIELDS[field].label,
										}),
								},
							});
							document.body.append(renderer.element);
							window.addEventListener("scroll", reposition, true);
							window.addEventListener("resize", reposition);
							show(props);
						},
						onUpdate: show,
						onExit: () => {
							window.removeEventListener("scroll", reposition, true);
							window.removeEventListener("resize", reposition);
							renderer?.destroy();
							renderer?.element.remove();
							renderer = null;
							latest = null;
						},
						onKeyDown: ({ event }) => {
							if (event.key === "ArrowDown") {
								if (items.length === 0) return true;
								selected = (selected + 1) % items.length;
								renderer?.updateProps({ selectedIndex: selected });
								return true;
							}
							if (event.key === "ArrowUp") {
								if (items.length === 0) return true;
								selected = (selected + items.length - 1) % items.length;
								renderer?.updateProps({ selectedIndex: selected });
								return true;
							}
							if (event.key === "Enter") {
								const item = items[selected];
								if (item) latest?.command(item);
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
