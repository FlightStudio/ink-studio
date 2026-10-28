import { createHash } from "node:crypto";
import type { Db, NewAsset, StoredFile } from "@repo/db";
import { type ApiErrorCode, apiErrorCodes, ServiceError } from "@repo/errors";
import {
	type Asset,
	type AssetJob,
	assetMessageType,
	type UploadPurpose,
	type UserOrganization,
} from "@repo/types";
import { v7 as uuidv7 } from "uuid";
import type { Publisher } from "../queue/index.ts";
import type {
	AssetJobMessage,
	AssetStatus,
	AssetStorage,
	JobOf,
	RunJobParams,
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

export const MAX_ATTEMPTS = 3;

export const LEASE_MS = 15 * 60_000;

export const STALE_PENDING_MS = 5 * 60_000;

export const SWEEP_MESSAGE_TYPE = "sweep";

const UNPRODUCED_MIME_TYPE = "application/octet-stream";

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

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function jobOf<K extends AssetJob["kind"]>(
	asset: Asset,
	kind: K,
): JobOf<K> | null {
	if (asset.origin.source !== "generated") return null;
	const job = asset.origin.job;
	return job.kind === kind ? (job as JobOf<K>) : null;
}

function asApiErrorCode(error: string): ApiErrorCode {
	return (apiErrorCodes as readonly string[]).includes(error)
		? (error as ApiErrorCode)
		: "internal_error";
}

export function isServable(asset: Asset): boolean {
	if (asset.processing.status !== "done") return false;
	if (asset.origin.source === "uploaded" && asset.origin.purpose === "mask") {
		return true;
	}
	return (
		asset.origin.source === "generated" && asset.origin.job.kind === "lift-ink"
	);
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

export function generatedAsset(
	organizationId: string,
	job: AssetJob,
): NewAsset {
	const id = uuidv7();
	return {
		id,
		organizationId,
		storageKey: storageKey(organizationId, id),
		mimeType: UNPRODUCED_MIME_TYPE,
		byteSize: null,
		checksum: null,
		origin: { source: "generated", job },
		processing: { status: "pending", attempts: 0, lastError: null },
	};
}

export async function publishAssetJob(
	publisher: Publisher,
	asset: Asset,
): Promise<void> {
	if (asset.origin.source !== "generated") {
		throw new Error(`asset ${asset.id} has no job`);
	}
	const message: AssetJobMessage = { assetId: asset.id };
	await publisher.publish(assetMessageType(asset.origin.job.kind), message);
}

export class AssetService {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorage,
		private readonly publisher: Publisher,
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
			checksum: sha256(bytes),
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

	async runJob<K extends AssetJob["kind"], R>(
		params: RunJobParams<K, R>,
	): Promise<void> {
		const asset = await this.db.assets.claim(
			params.assetId,
			new Date(Date.now() - LEASE_MS),
		);
		if (!asset) return;
		const attempts = asset.processing.attempts;
		const job = jobOf(asset, params.kind);
		if (!job || attempts > MAX_ATTEMPTS) {
			await this.db.assets.fail(asset.id, "processing_failed");
			return;
		}
		try {
			const file = await params.produce(job, asset);
			await this.storage.put({
				key: asset.storageKey,
				bytes: file.bytes,
				contentType: file.mimeType,
			});
			const stored: StoredFile = {
				mimeType: file.mimeType,
				byteSize: file.bytes.byteLength,
				checksum: sha256(file.bytes),
			};
			await this.db.transaction(async (tx) => {
				await tx.assets.complete(asset.id, stored);
				await params.onComplete?.(
					tx,
					{ ...asset, ...stored, processing: { status: "done", attempts } },
					file.result,
				);
			});
		} catch (error) {
			if (error instanceof ServiceError && error.kind === "invalid_input") {
				await this.db.assets.fail(asset.id, error.code);
				return;
			}
			if (attempts >= MAX_ATTEMPTS) {
				await this.db.assets.fail(asset.id, "processing_failed");
				return;
			}
			await this.db.assets.release(asset.id, errorText(error));
			throw error;
		}
	}

	async sweep(now: Date): Promise<number> {
		const leaseEnded = now.getTime() - LEASE_MS;
		const stale = (
			await this.db.assets.stale(new Date(now.getTime() - STALE_PENDING_MS))
		).filter(
			(asset) =>
				asset.processing.status === "pending" ||
				asset.updatedAt.getTime() < leaseEnded,
		);
		for (const asset of stale) await publishAssetJob(this.publisher, asset);
		return stale.length;
	}
}
