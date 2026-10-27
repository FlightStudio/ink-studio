import { ServiceError } from "@repo/errors";
import { assetIdOf } from "@/server/assets";
import { handleRequest } from "@/server/handle-json";
import { getAssetService } from "@/server/services";

type Context = { params: Promise<{ assetId: string }> };

export function GET(request: Request, context: Context) {
	return handleRequest(request, async ({ member }) => {
		const url = await getAssetService().getAssetReadUrl(
			member.userOrganization,
			await assetIdOf(context),
		);
		if (!url) throw new ServiceError("not_found", "not_found");
		return new Response(null, {
			status: 302,
			headers: { Location: url, "Cache-Control": "private, no-store" },
		});
	});
}
