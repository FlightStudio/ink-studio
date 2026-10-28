export type OverflowNoticeProps = { words: number; maxPages: number };

export function OverflowNotice({ words, maxPages }: OverflowNoticeProps) {
	if (words < 1) return null;
	return (
		<p
			data-overflow-notice=""
			className="max-w-md text-center text-ui text-ink"
		>
			About {words} words won't fit on {maxPages} sides.
		</p>
	);
}
