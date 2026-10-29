import {
	createLetterRequestSchema,
	type LetterListPage,
	listLettersParamsSchema,
} from "@repo/api";
import { ServiceError } from "@repo/errors";
import { handleJson, handleRequest } from "@/server/handle-json";
import { getLetterService } from "@/server/services";

export function GET(request: Request) {
	return handleRequest(request, async ({ member }) => {
		const params = listLettersParamsSchema.safeParse(
			Object.fromEntries(new URL(request.url).searchParams),
		);
		if (!params.success) {
			throw new ServiceError("invalid_input", "invalid_request");
		}
		const page = await getLetterService().listLetters(member, params.data);
		const body: LetterListPage = {
			items: page.items.map((item) => ({
				...item,
				updatedAt: item.updatedAt.toISOString(),
			})),
			nextCursor: page.nextCursor,
		};
		return Response.json(body);
	});
}

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
