import { createHash } from "node:crypto";
import type { Db } from "@repo/db";
import { type ApiErrorCode, apiErrorCodes, ServiceError } from "@repo/errors";
import type { Asset, UploadPurpose, UserOrganization } from "@repo/types";
import { v7 as uuidv7 } from "uuid";
import type {
	AssetStatus,
	AssetStorage,
	UploadParams,
} from "./assets.types.ts";

const MiB = 1024 * 1024;

export const UPLOADS = {
	photo: {
		maxBytes: 15 * MiB,
		mimeTypes: ["image/jpeg", "image/png", "image/webp"],
	},
	mask: { maxBytes: 8 * MiB, mimeTypes: ["image/png"] },
	"font-file": { maxBytes: 4 * MiB, mimeTypes: ["font/ttf", "font/otf"] },
} as const satisfies Record<
	UploadPurpose,
	{ maxBytes: number; mimeTypes: readonly string[] }
>;

export const READ_URL_EXPIRES_IN_SECONDS = 300;

const SNIFF_BYTES = 16;

const HEIF_BRANDS = new Set([
	"heic",
	"heix",
	"hevc",
	"hevx",
	"heim",
	"heis",
	"hevm",
	"hevs",
	"mif1",
	"msf1",
]);

function startsWith(head: Uint8Array, signature: readonly number[], at = 0) {
	return signature.every((value, index) => head[at + index] === value);
}

function asciiAt(head: Uint8Array, at: number, length: number): string {
	return String.fromCharCode(...head.subarray(at, at + length));
}

function sniff(head: Uint8Array): string | null {
	if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return "image/png";
	}
	if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (asciiAt(head, 0, 4) === "RIFF" && asciiAt(head, 8, 4) === "WEBP") {
		return "image/webp";
	}
	if (asciiAt(head, 4, 4) === "ftyp" && HEIF_BRANDS.has(asciiAt(head, 8, 4))) {
		return "image/heic";
	}
	if (startsWith(head, [0x00, 0x01, 0x00, 0x00])) return "font/ttf";
	if (asciiAt(head, 0, 4) === "true") return "font/ttf";
	if (asciiAt(head, 0, 4) === "OTTO") return "font/otf";
	return null;
}

async function readWithin(
	body: ReadableStream<Uint8Array>,
	maxBytes: number,
): Promise<Uint8Array> {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new ServiceError("invalid_input", "file_too_large");
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function storageKey(organizationId: string, assetId: string): string {
	return `organizations/${organizationId}/assets/${assetId}`;
}

function asApiErrorCode(error: string): ApiErrorCode {
	return (apiErrorCodes as readonly string[]).includes(error)
		? (error as ApiErrorCode)
		: "internal_error";
}

export function isServable(asset: Asset): boolean {
	if (asset.processing.status !== "done") return false;
	return asset.origin.source === "uploaded" && asset.origin.purpose === "mask";
}

export async function assetReadUrl(
	storage: AssetStorage,
	asset: Asset,
): Promise<string | null> {
	if (!isServable(asset)) return null;
	return storage.signedReadUrl({
		key: asset.storageKey,
		expiresInSeconds: READ_URL_EXPIRES_IN_SECONDS,
	});
}

export class AssetService {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorage,
	) {}

	async upload(
		userOrganization: UserOrganization,
		params: UploadParams,
	): Promise<Asset> {
		const rule = UPLOADS[params.purpose];
		if (params.declaredBytes !== null && params.declaredBytes > rule.maxBytes) {
			await params.body.cancel();
			throw new ServiceError("invalid_input", "file_too_large");
		}
		const bytes = await readWithin(params.body, rule.maxBytes);
		const mimeType = sniff(bytes.subarray(0, SNIFF_BYTES));
		if (mimeType === "image/heic") {
			throw new ServiceError("invalid_input", "heic_not_supported");
		}
		if (
			mimeType === null ||
			!(rule.mimeTypes as readonly string[]).includes(mimeType)
		) {
			throw new ServiceError("invalid_input", "unsupported_file");
		}
		const id = uuidv7();
		const organizationId = userOrganization.organizationId;
		const key = storageKey(organizationId, id);
		await this.storage.put({ key, bytes, contentType: mimeType });
		return this.db.assets.create({
			id,
			organizationId,
			storageKey: key,
			mimeType,
			byteSize: bytes.byteLength,
			checksum: createHash("sha256").update(bytes).digest("hex"),
			origin: {
				source: "uploaded",
				purpose: params.purpose,
				filename: params.filename,
				uploadedByUserId: params.uploadedByUserId,
			},
			processing: { status: "done", attempts: 0 },
		});
	}

	async getAssetStatus(
		userOrganization: UserOrganization,
		assetId: string,
	): Promise<AssetStatus | null> {
		const asset = await this.db.assets.byId(
			userOrganization.organizationId,
			assetId,
		);
		if (!asset) return null;
		return {
			status: asset.processing.status,
			error:
				asset.processing.status === "failed"
					? asApiErrorCode(asset.processing.error)
					: null,
		};
	}

	async getAssetReadUrl(
		userOrganization: UserOrganization,
		assetId: string,
	): Promise<string | null> {
		const asset = await this.db.assets.byId(
			userOrganization.organizationId,
			assetId,
		);
		if (!asset) return null;
		return assetReadUrl(this.storage, asset);
	}
}
