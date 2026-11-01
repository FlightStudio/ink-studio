import type { Assets } from "./drizzle/assets.ts";
import type { Drawings } from "./drizzle/drawings.ts";
import type { Fonts } from "./drizzle/fonts.ts";
import type {
	BlankDraft,
	LetterChange,
	LetterCursor,
	LetterListQuery,
	Letters,
	ListedLetters,
} from "./drizzle/letters.ts";
import type { OrganizationUsers } from "./drizzle/organization-users.ts";
import type { Organizations } from "./drizzle/organizations.ts";
import type { Users } from "./drizzle/users.ts";

export type { NewAsset, StoredFile } from "./drizzle/assets.ts";
export type { FontWithBuild, NewFont } from "./drizzle/fonts.ts";
export type { Letter, NewLetter } from "./drizzle/letters.ts";
export type {
	Assets,
	BlankDraft,
	Drawings,
	Fonts,
	LetterChange,
	LetterCursor,
	LetterListQuery,
	Letters,
	ListedLetters,
	Organizations,
	OrganizationUsers,
	Users,
};

export type Tx = {
	users: Users;
	organizations: Organizations;
	organizationUsers: OrganizationUsers;
	letters: Letters;
	assets: Assets;
	drawings: Drawings;
	fonts: Fonts;
};

export type Db = Tx & {
	transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
	close: () => Promise<void>;
};

export type TestDb = {
	db: Db;
	execute: (text: string, values?: unknown[]) => Promise<void>;
	stop: () => Promise<void>;
};
