import { type Bucket, Storage } from "@google-cloud/storage";
import type {
	AssetStorage,
	PutObjectParams,
	SignedReadUrlParams,
} from "@repo/services/assets";

export type GcsAssetStorageParams = {
	bucket: string;
	projectId: string;
	emulatorBaseUrl?: string;
	credentials?: { client_email: string; private_key: string };
};

export class GcsAssetStorage implements AssetStorage {
	private readonly bucket: Bucket;
	private readonly emulatorBaseUrl: string | undefined;

	constructor(params: GcsAssetStorageParams) {
		this.emulatorBaseUrl = params.emulatorBaseUrl?.replace(/\/+$/, "");
		const storage = new Storage({
			projectId: params.projectId,
			credentials: params.credentials,
			apiEndpoint: this.emulatorBaseUrl,
		});
		this.bucket = storage.bucket(params.bucket);
	}

	async put(params: PutObjectParams): Promise<void> {
		await this.bucket.file(params.key).save(Buffer.from(params.bytes), {
			contentType: params.contentType,
			resumable: false,
		});
	}

	async get(key: string): Promise<Uint8Array> {
		if (this.emulatorBaseUrl) {
			const response = await fetch(this.mediaUrl(key));
			if (!response.ok) {
				throw new Error(`storage read failed (${response.status})`);
			}
			return new Uint8Array(await response.arrayBuffer());
		}
		const [contents] = await this.bucket.file(key).download();
		return new Uint8Array(contents);
	}

	private mediaUrl(key: string): string {
		return `${this.emulatorBaseUrl}/download/storage/v1/b/${encodeURIComponent(this.bucket.name)}/o/${encodeURIComponent(key)}?alt=media`;
	}

	async signedReadUrl(params: SignedReadUrlParams): Promise<string> {
		if (this.emulatorBaseUrl) {
			return this.mediaUrl(params.key);
		}
		const [url] = await this.bucket.file(params.key).getSignedUrl({
			version: "v4",
			action: "read",
			expires: Date.now() + params.expiresInSeconds * 1000,
			responseDisposition: params.downloadName
				? `attachment; filename="${params.downloadName.replace(/["\\\r\n]/g, "_")}"`
				: undefined,
		});
		return url;
	}
}
