"use client";

export type SwatchProps = {
	color: string;
	label: string;
	selected: boolean;
	onSelect: () => void;
};

export function Swatch({ color, label, selected, onSelect }: SwatchProps) {
	return (
		<input
			type="radio"
			checked={selected}
			aria-label={label}
			data-selected={selected}
			className="studio-swatch"
			style={{ background: color }}
			onChange={onSelect}
		/>
	);
}
