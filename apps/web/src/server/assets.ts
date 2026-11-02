import { ServiceError } from "@repo/errors";
import { z } from "zod";

const assetIdSchema = z.uuid();

export async function assetIdOf(context: {
	params: Promise<{ assetId: string }>;
}): Promise<string> {
	const { assetId } = await context.params;
	if (!assetIdSchema.safeParse(assetId).success) {
		throw new ServiceError("not_found", "not_found");
	}
	return assetId;
}
