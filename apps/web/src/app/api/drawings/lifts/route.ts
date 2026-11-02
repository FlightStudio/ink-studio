import { requestLiftRequestSchema } from "@repo/api";
import { handleJson } from "@/server/handle-json";
import { getDrawingService } from "@/server/services";

export function POST(request: Request) {
	return handleJson(
		request,
		{ body: requestLiftRequestSchema },
		async ({ member, body }) =>
			Response.json(await getDrawingService().requestLift(member, body), {
				status: 201,
			}),
	);
}
