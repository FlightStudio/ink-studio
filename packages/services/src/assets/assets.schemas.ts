import { z } from "zod";
import type { AssetJobMessage } from "./assets.types.ts";

export const assetJobMessageSchema: z.ZodType<AssetJobMessage> = z.object({
	assetId: z.uuid(),
});
