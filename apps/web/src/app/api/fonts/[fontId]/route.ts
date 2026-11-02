import { ServiceError } from "@repo/errors";
import { isFontId } from "@/server/fonts";
import { handleRequest } from "@/server/handle-json";
import { getFontService } from "@/server/services";

type Context = { params: Promise<{ fontId: string }> };

async function fontIdOf(context: Context): Promise<string> {
	const { fontId } = await context.params;
	if (!isFontId(fontId)) throw new ServiceError("not_found", "not_found");
	return fontId;
}

export function DELETE(request: Request, context: Context) {
	return handleRequest(request, async ({ member }) => {
		await getFontService().deleteFont(member, await fontIdOf(context));
		return new Response(null, { status: 204 });
	});
}
