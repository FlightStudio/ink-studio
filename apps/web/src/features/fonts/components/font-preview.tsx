export type FontPreviewProps = {
	fontId: string;
	assetId: string | null;
	text: string;
};

export function FontPreview({ fontId, assetId, text }: FontPreviewProps) {
	if (!assetId) {
		return (
			<p data-font-preview="" className="text-ui text-ink-muted">
				Nothing built yet.
			</p>
		);
	}
	const family = `own-${fontId}`;
	return (
		<div data-font-preview="" data-built={assetId}>
			<style>{`@font-face { font-family: "${family}"; src: url("/api/assets/${assetId}"); font-display: block; }`}</style>
			<p
				className="text-title text-ink"
				style={{ fontFamily: `"${family}", "stock-caveat"` }}
			>
				{text}
			</p>
		</div>
	);
}
