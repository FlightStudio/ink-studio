"use client";

import type { ComponentProps } from "react";

export type SwatchSource = "pointer" | "keyboard";

export type SwatchProps = Omit<ComponentProps<"label">, "onSelect"> & {
	color: string;
	label: string;
	selected: boolean;
	onSelect: (source: SwatchSource) => void;
	labelHidden?: boolean;
	name?: string;
};

export function Swatch({
	color,
	label,
	selected,
	onSelect,
	labelHidden = false,
	name,
	...props
}: SwatchProps) {
	return (
		<label
			{...props}
			data-slot="swatch"
			data-selected={selected}
			data-label-hidden={labelHidden}
			className="swatch"
			onClickCapture={(event) => {
				if (event.target instanceof HTMLInputElement) return;
				event.preventDefault();
				if (!selected) onSelect("pointer");
			}}
		>
			<input
				type="radio"
				name={name}
				checked={selected}
				onChange={() => onSelect("keyboard")}
			/>
			<span
				aria-hidden="true"
				className="swatch-dot"
				style={{ background: color }}
			/>
			<span className={labelHidden ? "sr-only" : undefined}>{label}</span>
		</label>
	);
}
