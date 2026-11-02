import { saveGlyphRequestSchema } from "@repo/api";
import { ServiceError } from "@repo/errors";
import { isFontId } from "@/server/fonts";
import { handleJson } from "@/server/handle-json";
import { getFontService } from "@/server/services";

type Context = { params: Promise<{ fontId: string }> };

async function fontIdOf(context: Context): Promise<string> {
	const { fontId } = await context.params;
	if (!isFontId(fontId)) throw new ServiceError("not_found", "not_found");
	return fontId;
}

export function PUT(request: Request, context: Context) {
	return handleJson(
		request,
		{ body: saveGlyphRequestSchema },
		async ({ member, body }) => {
			await getFontService().saveGlyph(member, await fontIdOf(context), body);
			return new Response(null, { status: 204 });
		},
	);
}
