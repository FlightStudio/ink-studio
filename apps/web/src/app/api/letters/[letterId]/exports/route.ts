import { requestExportRequestSchema } from "@repo/api";
import { ServiceError } from "@repo/errors";
import { handleJson } from "@/server/handle-json";
import { isLetterId } from "@/server/letters";
import { getLetterService } from "@/server/services";

type Context = { params: Promise<{ letterId: string }> };

export function POST(request: Request, context: Context) {
	return handleJson(
		request,
		{ body: requestExportRequestSchema },
		async ({ member, body }) => {
			const { letterId } = await context.params;
			if (!isLetterId(letterId))
				throw new ServiceError("not_found", "not_found");
			return Response.json(
				await getLetterService().requestExport(member, letterId, body),
				{ status: 201 },
			);
		},
	);
}
