export type UploadPurpose = "photo" | "mask" | "font-file";

export type AssetJob = { kind: "lift-ink"; photoAssetId: string };

export function assetMessageType<K extends AssetJob["kind"]>(
	kind: K,
): `asset.${K}` {
	return `asset.${kind}`;
}

export type AssetOrigin =
	| {
			source: "uploaded";
			purpose: UploadPurpose;
			filename: string;
			uploadedByUserId: string;
	  }
	| { source: "generated"; job: AssetJob };

export type AssetProcessing =
	| {
			status: "pending" | "running";
			attempts: number;
			lastError: string | null;
	  }
	| { status: "done"; attempts: number }
	| { status: "failed"; attempts: number; error: string };

export type AssetProcessingStatus = AssetProcessing["status"];

export type Asset = {
	id: string;
	organizationId: string;
	storageKey: string;
	mimeType: string;
	byteSize: number | null;
	checksum: string | null;
	origin: AssetOrigin;
	processing: AssetProcessing;
	createdAt: Date;
	updatedAt: Date;
};
