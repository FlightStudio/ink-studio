import { createFontRequestSchema } from "@repo/api";
import { handleJson } from "@/server/handle-json";
import { getFontService } from "@/server/services";

export function POST(request: Request) {
	return handleJson(
		request,
		{ body: createFontRequestSchema },
		async ({ member, body }) =>
			Response.json(await getFontService().createFont(member, body), {
				status: 201,
			}),
	);
}
