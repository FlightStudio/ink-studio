export const TITLE_MAX_CHARACTERS = 120;

export function normaliseLetterTitle(title: string): string | null {
	const trimmed = title.trim();
	if (
		trimmed === "" ||
		/\p{Cc}/u.test(trimmed) ||
		[...trimmed].length > TITLE_MAX_CHARACTERS
	) {
		return null;
	}
	return trimmed;
}
