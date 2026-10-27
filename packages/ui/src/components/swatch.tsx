"use client";

export type SwatchProps = {
	color: string;
	label: string;
	selected: boolean;
	onSelect: () => void;
};

export function Swatch({ color, label, selected, onSelect }: SwatchProps) {
	return (
		<label data-slot="swatch" data-selected={selected} className="swatch">
			<input type="radio" checked={selected} onChange={onSelect} />
			<span
				aria-hidden="true"
				className="swatch-dot"
				style={{ background: color }}
			/>
			<span>{label}</span>
		</label>
	);
}
