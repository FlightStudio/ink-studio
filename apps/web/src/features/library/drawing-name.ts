import type { DrawingKind } from "@repo/types";

const DEFAULT_NAMES: Record<DrawingKind, string> = {
	doodle: "Doodle",
	signature: "Signature",
};

export function nextDrawingName(kind: DrawingKind, names: string[]): string {
	const base = DEFAULT_NAMES[kind];
	const pattern = new RegExp(`^${base}(?: (\\d+))?$`);
	const highest = names.reduce((most, name) => {
		const match = pattern.exec(name.trim());
		if (!match) return most;
		return Math.max(most, match[1] ? Number(match[1]) : 1);
	}, 0);
	return `${base} ${highest + 1}`;
}
