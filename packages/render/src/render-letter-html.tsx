import { PAGE_SPECS } from "@repo/types";
import { renderToStaticMarkup } from "react-dom/server";
import { LetterPrint, type LetterPrintProps } from "./html/letter-print.tsx";

export function renderLetterHtml(params: LetterPrintProps): string {
	const spec = PAGE_SPECS[params.content.format];
	const body = renderToStaticMarkup(<LetterPrint {...params} />);
	const page = `@page { size: ${spec.widthIn}in ${spec.heightIn}in; margin: 0 } html, body { margin: 0; padding: 0 }`;
	return `<!doctype html><html><head><meta charset="utf-8"><style>${page}</style></head><body>${body}</body></html>`;
}
