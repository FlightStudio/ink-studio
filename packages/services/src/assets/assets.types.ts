import type { Tx } from "@repo/db";
import type { ApiErrorCode } from "@repo/errors";
import type {
	Asset,
	AssetJob,
	AssetProcessing,
	UploadPurpose,
} from "@repo/types";

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

export type ProducedFile<R> = {
	bytes: Uint8Array;
	mimeType: string;
	result: R;
};

export type AssetJobMessage = { assetId: string };

export type JobOf<K extends AssetJob["kind"]> = Extract<AssetJob, { kind: K }>;

export type RunJobParams<K extends AssetJob["kind"], R> = {
	assetId: string;
	kind: K;
	produce: (job: JobOf<K>, asset: Asset) => Promise<ProducedFile<R>>;
	onComplete?: (tx: Tx, asset: Asset, result: R) => Promise<void>;
};
