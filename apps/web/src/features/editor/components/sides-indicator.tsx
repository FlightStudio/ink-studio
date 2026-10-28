export type SidesIndicatorProps = { sides: number; maxPages: number };

export function SidesIndicator({ sides, maxPages }: SidesIndicatorProps) {
	return (
		<p data-sides={sides} className="text-ui text-ink">
			{sides} of {maxPages} sides
		</p>
	);
}
