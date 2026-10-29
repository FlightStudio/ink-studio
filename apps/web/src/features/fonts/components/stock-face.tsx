export const STOCK_FAMILY = "stock-caveat";

const STOCK_FACE = `@font-face{font-family:"${STOCK_FAMILY}";src:url("/fonts/stock/caveat");font-display:swap}`;

export function StockFace() {
	return (
		<style href="stock-caveat-face" precedence="default">
			{STOCK_FACE}
		</style>
	);
}
