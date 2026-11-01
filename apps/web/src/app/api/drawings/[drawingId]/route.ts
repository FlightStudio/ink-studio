import { renameDrawingRequestSchema } from "@repo/api";
import { ServiceError } from "@repo/errors";
import { isDrawingId } from "@/server/drawings";
import { handleJson, handleRequest } from "@/server/handle-json";
import { getDrawingService } from "@/server/services";

type Context = { params: Promise<{ drawingId: string }> };

async function drawingIdOf(context: Context): Promise<string> {
	const { drawingId } = await context.params;
	if (!isDrawingId(drawingId)) throw new ServiceError("not_found", "not_found");
	return drawingId;
}

export function PATCH(request: Request, context: Context) {
	return handleJson(
		request,
		{ body: renameDrawingRequestSchema },
		async ({ member, body }) => {
			await getDrawingService().renameDrawing(
				member,
				await drawingIdOf(context),
				body.name,
			);
			return new Response(null, { status: 204 });
		},
	);
}

export function DELETE(request: Request, context: Context) {
	return handleRequest(request, async ({ member }) => {
		await getDrawingService().deleteDrawing(member, await drawingIdOf(context));
		return new Response(null, { status: 204 });
	});
}
