import type { Db, Tx } from "@repo/db";
import type { LetterContent, LetterResources, Member } from "@repo/types";
import type {
	CreateLetterParams,
	EditableLetter,
	LetterListItem,
	SaveLetterParams,
} from "./letters.types.ts";

const pending = () => Promise.reject(new Error("letters are not served yet"));

export function letterResources(
	_tx: Tx,
	_organizationId: string,
	_content: LetterContent,
): Promise<LetterResources> {
	return pending();
}

export function letterOwnerIds(
	_tx: Tx,
	_organizationId: string,
	_content: LetterContent,
): Promise<Set<string>> {
	return pending();
}

export class LetterService {
	constructor(private readonly db: Db) {}

	createLetter(
		_member: Member,
		_params: CreateLetterParams,
	): Promise<{ id: string }> {
		return pending();
	}

	getLetter(
		_member: Member,
		_letterId: string,
	): Promise<EditableLetter | null> {
		return pending();
	}

	listLetters(_member: Member): Promise<LetterListItem[]> {
		return pending();
	}

	saveLetter(
		_member: Member,
		_letterId: string,
		_params: SaveLetterParams,
	): Promise<{ revision: number }> {
		return pending();
	}

	deleteLetter(_member: Member, _letterId: string): Promise<void> {
		return pending();
	}
}
