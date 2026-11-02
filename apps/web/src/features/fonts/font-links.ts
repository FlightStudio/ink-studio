type Query = Readonly<Record<string, string | null | undefined>>;

function withQuery(path: string, query: Query): string {
	const pairs = Object.entries(query).flatMap(([key, value]) =>
		value ? [`${key}=${encodeURIComponent(value)}`] : [],
	);
	return pairs.length > 0 ? `${path}?${pairs.join("&")}` : path;
}

export function fontHome(fontId: string, from: string | null): string {
	return withQuery(`/fonts/${fontId}`, { from });
}

export function drawPage(
	fontId: string,
	from: string | null,
	glyph?: string,
): string {
	return withQuery(`/fonts/${fontId}/draw`, { from, glyph });
}

export function letterWithFont(letterId: string, fontId: string): string {
	return withQuery(`/letters/${letterId}`, { font: fontId });
}

export function newFont(from: string | null): string {
	return withQuery("/fonts/new", { from });
}

export function templatePage(from: string | null, name: string): string {
	return withQuery("/fonts/template", { from, name });
}
