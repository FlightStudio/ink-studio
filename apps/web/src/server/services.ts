import { createDb, type Db } from "@repo/db";
import {
	GcsAssetStorage,
	PubSubPublisher,
} from "@repo/integrations/shared/gcp";
import { AssetService, type AssetStorage } from "@repo/services/assets";
import { FontService } from "@repo/services/fonts";
import { LetterService } from "@repo/services/letters";
import type { Publisher } from "@repo/services/queue";
import { env } from "../env.ts";

let db: Db | undefined;
let letters: LetterService | undefined;
let assetStorage: AssetStorage | undefined;
let publisher: Publisher | undefined;
let assets: AssetService | undefined;
let fonts: FontService | undefined;

export function getDb(): Db {
	db ??= createDb(env.DATABASE_URL);
	return db;
}

export function getLetterService(): LetterService {
	letters ??= new LetterService(getDb());
	return letters;
}

export function getAssetStorage(): AssetStorage {
	assetStorage ??= new GcsAssetStorage({
		bucket: env.GCS_ASSETS_BUCKET,
		projectId: env.GOOGLE_CLOUD_PROJECT,
		emulatorBaseUrl: env.STORAGE_EMULATOR_HOST,
	});
	return assetStorage;
}

export function getPublisher(): Publisher {
	publisher ??= new PubSubPublisher({
		projectId: env.GOOGLE_CLOUD_PROJECT,
		emulatorHost: env.PUBSUB_EMULATOR_HOST,
		topic: env.PUBSUB_JOBS_TOPIC,
	});
	return publisher;
}

export function getAssetService(): AssetService {
	assets ??= new AssetService(getDb(), getAssetStorage(), getPublisher());
	return assets;
}

export function getFontService(): FontService {
	fonts ??= new FontService(getDb(), getPublisher());
	return fonts;
}
