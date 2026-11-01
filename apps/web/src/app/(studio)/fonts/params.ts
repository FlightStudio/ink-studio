import { isLetterId } from "@/server/letters";

export type FontSearchParams = Promise<
	Record<string, string | string[] | undefined>
>;

export function single(value: string | string[] | undefined): string | null {
	return typeof value === "string" ? value : null;
}

export function letterFrom(
	value: string | string[] | undefined,
): string | null {
	const from = single(value);
	return from !== null && isLetterId(from) ? from : null;
}
