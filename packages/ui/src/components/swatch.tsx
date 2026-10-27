"use client";

export type SwatchProps = {
	color: string;
	label: string;
	selected: boolean;
	onSelect: () => void;
	labelHidden?: boolean;
};

export function Swatch({
	color,
	label,
	selected,
	onSelect,
	labelHidden = false,
}: SwatchProps) {
	return (
		<label
			data-slot="swatch"
			data-selected={selected}
			data-label-hidden={labelHidden}
			className="swatch"
		>
			<input type="radio" checked={selected} onChange={onSelect} />
			<span
				aria-hidden="true"
				className="swatch-dot"
				style={{ background: color }}
			/>
			<span className={labelHidden ? "sr-only" : undefined}>{label}</span>
		</label>
	);
}
