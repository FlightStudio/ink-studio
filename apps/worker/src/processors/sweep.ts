import type { Logger } from "@repo/logger";
import { type AssetService, SWEEP_MESSAGE_TYPE } from "@repo/services/assets";
import type { MessageProcessor } from "@repo/services/queue";

export function sweepProcessor(
	assets: Pick<AssetService, "sweep">,
	log: Logger,
): MessageProcessor {
	return {
		type: SWEEP_MESSAGE_TYPE,
		async process() {
			const republished = await assets.sweep(new Date());
			log.info("sweep processed", { republished });
		},
	};
}
