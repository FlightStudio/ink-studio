import { type LetterState, saveLetterRequestSchema } from "@repo/api";
import { ServiceError } from "@repo/errors";
import { handleJson, handleRequest } from "@/server/handle-json";
import { isLetterId } from "@/server/letters";
import { getLetterService } from "@/server/services";

type Context = { params: Promise<{ letterId: string }> };

async function letterIdOf(context: Context): Promise<string> {
	const { letterId } = await context.params;
	if (!isLetterId(letterId)) throw new ServiceError("not_found", "not_found");
	return letterId;
}

export function GET(request: Request, context: Context) {
	return handleRequest(request, async ({ member }) => {
		const letter = await getLetterService().getLetter(
			member,
			await letterIdOf(context),
		);
		if (!letter) throw new ServiceError("not_found", "not_found");
		const state: LetterState = {
			title: letter.title,
			revision: letter.revision,
			content: letter.content,
			resources: letter.resources,
		};
		return Response.json(state);
	});
}

export function PUT(request: Request, context: Context) {
	return handleJson(
		request,
		{ body: saveLetterRequestSchema },
		async ({ member, body }) =>
			Response.json(
				await getLetterService().saveLetter(
					member,
					await letterIdOf(context),
					body,
				),
			),
	);
}

export function DELETE(request: Request, context: Context) {
	return handleRequest(request, async ({ member }) => {
		await getLetterService().deleteLetter(member, await letterIdOf(context));
		return new Response(null, { status: 204 });
	});
}
