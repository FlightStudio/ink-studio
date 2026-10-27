export interface ImageProcessor {
	liftInk(photo: Uint8Array): Promise<Uint8Array>;
}
