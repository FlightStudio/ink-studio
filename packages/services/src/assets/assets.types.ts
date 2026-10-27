import type { ApiErrorCode } from "@repo/errors";
import type { AssetProcessing, UploadPurpose } from "@repo/types";

export interface AssetStorage {
	put(params: PutObjectParams): Promise<void>;
	get(key: string): Promise<Uint8Array>;
	signedReadUrl(params: SignedReadUrlParams): Promise<string>;
}

export type PutObjectParams = {
	key: string;
	bytes: Uint8Array;
	contentType: string;
};

export type SignedReadUrlParams = {
	key: string;
	expiresInSeconds: number;
	downloadName?: string;
};

export type UploadParams = {
	purpose: UploadPurpose;
	filename: string;
	declaredBytes: number | null;
	body: ReadableStream<Uint8Array>;
	uploadedByUserId: string;
};

export type AssetStatus = {
	status: AssetProcessing["status"];
	error: ApiErrorCode | null;
};
