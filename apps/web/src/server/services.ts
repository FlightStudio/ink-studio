import { createDb, type Db } from "@repo/db";
import { GcsAssetStorage } from "@repo/integrations/shared/gcp";
import { AssetService, type AssetStorage } from "@repo/services/assets";
import { LetterService } from "@repo/services/letters";
import { env } from "../env.ts";

let db: Db | undefined;
let letters: LetterService | undefined;
let assetStorage: AssetStorage | undefined;
let assets: AssetService | undefined;

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

export function getAssetService(): AssetService {
	assets ??= new AssetService(getDb(), getAssetStorage());
	return assets;
}
