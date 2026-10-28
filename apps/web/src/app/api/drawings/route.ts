import { createDrawingRequestSchema } from "@repo/api";
import { handleJson } from "@/server/handle-json";
import { getDrawingService } from "@/server/services";

export function POST(request: Request) {
	return handleJson(
		request,
		{ body: createDrawingRequestSchema },
		async ({ member, body }) =>
			Response.json(await getDrawingService().createDrawing(member, body), {
				status: 201,
			}),
	);
}
