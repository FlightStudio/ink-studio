import type { CreateDrawingRequest } from "@repo/api";

export type CreateDrawingParams = CreateDrawingRequest;

export interface ImageProcessor {
	liftInk(photo: Uint8Array): Promise<Uint8Array>;
}
