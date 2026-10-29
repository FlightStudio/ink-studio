"use client";

import type { Rect } from "@repo/render/html";
import type { InkColorId } from "@repo/types";
import { INK_COLORS } from "@repo/types";
import { Swatch } from "@repo/ui/components/swatch";
import { Button } from "@repo/ui/components/ui/button";
import { TextWrap } from "lucide-react";
import {
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { menuPlacement } from "../transform.ts";

const PX_PER_IN = 96;
const MENU_GAP_IN = 0.12;

export type MenuSheet = { widthIn: number; topIn: number; heightIn: number };

export type PageMenuProps = {
	label: string;
	bounds: Rect;
	sheet: MenuSheet;
	scale: number;
	warning?: string | null;
	onEscape?: () => void;
	ref?: Ref<HTMLFieldSetElement>;
	children: ReactNode;
};

export function PageMenu({
	label,
	bounds,
	sheet,
	scale,
	warning,
	onEscape,
	ref: fieldRef,
	children,
}: PageMenuProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ widthIn: 0, heightIn: 0 });

	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		const update = () =>
			setSize({
				widthIn: node.offsetWidth / (PX_PER_IN * scale),
				heightIn: node.offsetHeight / (PX_PER_IN * scale),
			});
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}, [scale]);

	const at = menuPlacement({ bounds, sheet, menu: size, gapIn: MENU_GAP_IN });
	return (
		<div
			ref={ref}
			data-element-menu=""
			className="absolute z-20 flex w-max flex-col items-center gap-1.5"
			style={{
				left: `${at.leftIn}in`,
				top: `${at.topIn}in`,
				transform: `scale(${1 / scale})`,
				transformOrigin: "top left",
			}}
		>
			<fieldset
				ref={fieldRef}
				aria-label={label}
				className="m-0 flex items-center gap-1 rounded-full border-0 bg-paper px-1.5 py-1 shadow-float ring-1 ring-[oklch(0.3_0.03_60/0.06)]"
				onMouseDown={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
				onKeyDown={(event: KeyboardEvent) => {
					if (event.key !== "Escape" || !onEscape) return;
					event.preventDefault();
					onEscape();
				}}
			>
				{children}
			</fieldset>
			{warning ? (
				<p
					aria-live="polite"
					className="max-w-72 rounded-full bg-paper px-3 py-1 text-center text-label shadow-float"
					style={{ color: "var(--danger)" }}
				>
					{warning}
				</p>
			) : null}
		</div>
	);
}

function InkSwatches({
	color,
	onColor,
}: {
	color: InkColorId;
	onColor: (color: InkColorId) => void;
}) {
	return Object.entries(INK_COLORS).map(([id, ink]) => (
		<Swatch
			key={id}
			color={ink.css}
			label={ink.label}
			selected={color === id}
			labelHidden
			onSelect={() => onColor(id as InkColorId)}
		/>
	));
}

function Divider() {
	return <span aria-hidden className="mx-0.5 h-5 w-px bg-rule" />;
}

export type ElementMenuProps = Omit<PageMenuProps, "children"> & {
	tint: InkColorId;
	wrap: boolean;
	onTint: (tint: InkColorId) => void;
	onWrap: (wrap: boolean) => void;
	onRemove: () => void;
};

export function ElementMenu({
	tint,
	wrap,
	onTint,
	onWrap,
	onRemove,
	...menu
}: ElementMenuProps) {
	return (
		<PageMenu {...menu}>
			<InkSwatches color={tint} onColor={onTint} />
			<Divider />
			<Button
				type="button"
				variant={wrap ? "secondary" : "ghost"}
				size="sm"
				className="rounded-full aria-pressed:text-ink"
				aria-pressed={wrap}
				onClick={() => onWrap(!wrap)}
			>
				<TextWrap />
				Wrap text
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="rounded-full"
				onClick={onRemove}
			>
				Remove
			</Button>
		</PageMenu>
	);
}
