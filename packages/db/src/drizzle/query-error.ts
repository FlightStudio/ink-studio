import { UniqueViolationError } from "../errors.ts";

type WithCause = {
	code?: string;
	constraint?: string;
	cause?: unknown;
};

export function asUniqueViolation(error: unknown): UniqueViolationError | null {
	const seen = new Set<unknown>();
	let current: unknown = error;
	while (current && typeof current === "object" && !seen.has(current)) {
		seen.add(current);
		const candidate = current as WithCause;
		if (candidate.code === "23505" && candidate.constraint) {
			return new UniqueViolationError(candidate.constraint);
		}
		current = candidate.cause;
	}
	return null;
}
