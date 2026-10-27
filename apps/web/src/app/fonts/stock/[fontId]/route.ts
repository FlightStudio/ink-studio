import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { STOCK_FONTS, type StockFontId } from "@repo/types";
import { errorResponse } from "@/server/handle-json";

const STOCK_FONT_DIR = resolve(process.cwd(), "../../packages/render/fonts");

function isStockFontId(value: string): value is StockFontId {
	return Object.hasOwn(STOCK_FONTS, value);
}

export async function GET(
	_request: Request,
	context: { params: Promise<{ fontId: string }> },
) {
	const { fontId } = await context.params;
	if (!isStockFontId(fontId)) return errorResponse(404, "not_found");
	const bytes = await readFile(
		resolve(STOCK_FONT_DIR, STOCK_FONTS[fontId].file),
	);
	return new Response(bytes, {
		headers: {
			"Content-Type": "font/ttf",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
