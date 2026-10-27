import { createLetterRequestSchema } from "@repo/api";
import { handleJson } from "@/server/handle-json";
import { getLetterService } from "@/server/services";

export function POST(request: Request) {
	return handleJson(
		request,
		{ body: createLetterRequestSchema },
		async ({ member, body }) =>
			Response.json(await getLetterService().createLetter(member, body), {
				status: 201,
			}),
	);
}
