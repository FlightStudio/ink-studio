import type { AssetStatus } from "@repo/api";
import { ServiceError } from "@repo/errors";
import { assetIdOf } from "@/server/assets";
import { handleRequest } from "@/server/handle-json";
import { getAssetService } from "@/server/services";

type Context = { params: Promise<{ assetId: string }> };

export function GET(request: Request, context: Context) {
	return handleRequest(request, async ({ member }) => {
		const status = await getAssetService().getAssetStatus(
			member.userOrganization,
			await assetIdOf(context),
		);
		if (!status) throw new ServiceError("not_found", "not_found");
		const body: AssetStatus = status;
		return Response.json(body);
	});
}
