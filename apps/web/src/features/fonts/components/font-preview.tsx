import { STOCK_FAMILY, StockFace } from "./stock-face.tsx";

export type FontPreviewProps = {
	fontId: string;
	assetId: string;
	text: string;
	className?: string;
};

export function fontFamilyOf(fontId: string): string {
	return `own-${fontId}`;
}

export function FontPreview({
	fontId,
	assetId,
	text,
	className,
}: FontPreviewProps) {
	const family = fontFamilyOf(fontId);
	return (
		<>
			<StockFace />
			<style href={`own-font-${assetId}`} precedence="default">
				{`@font-face{font-family:"${family}";src:url("/api/assets/${assetId}");font-display:block}`}
			</style>
			<p
				data-font-preview=""
				data-built={assetId}
				className={className}
				style={{ fontFamily: `"${family}", "${STOCK_FAMILY}", cursive` }}
			>
				{text}
			</p>
		</>
	);
}
