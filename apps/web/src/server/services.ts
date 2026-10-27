import { createDb, type Db } from "@repo/db";
import { LetterService } from "@repo/services/letters";
import { env } from "../env.ts";

let db: Db | undefined;
let letters: LetterService | undefined;

export function getDb(): Db {
	db ??= createDb(env.DATABASE_URL);
	return db;
}

export function getLetterService(): LetterService {
	letters ??= new LetterService(getDb());
	return letters;
}
