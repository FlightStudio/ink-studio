import type { CreateDrawingRequest, RequestLiftRequest } from "@repo/api";

export type CreateDrawingParams = CreateDrawingRequest;
export type RequestLiftParams = RequestLiftRequest;

export interface ImageProcessor {
	liftInk(photo: Uint8Array): Promise<Uint8Array>;
}
