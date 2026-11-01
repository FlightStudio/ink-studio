import { ServiceError } from "@repo/errors";
import { isFontId } from "@/server/fonts";
import { handleRequest } from "@/server/handle-json";
import { getFontService } from "@/server/services";

type Context = { params: Promise<{ fontId: string }> };

export function POST(request: Request, context: Context) {
	return handleRequest(request, async ({ member }) => {
		const { fontId } = await context.params;
		if (!isFontId(fontId)) throw new ServiceError("not_found", "not_found");
		return Response.json(await getFontService().requestBuild(member, fontId), {
			status: 201,
		});
	});
}
