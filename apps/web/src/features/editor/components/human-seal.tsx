import type { LetterContent } from "@repo/types";
import { humanSeal } from "@repo/types";

export type HumanSealProps = { content: LetterContent };

export function HumanSeal({ content }: HumanSealProps) {
	const seal = humanSeal(content, new Map());
	if (seal === null) return null;
	return (
		<p
			data-human-seal=""
			className="max-w-md text-center text-sm text-ink-muted"
		>
			{seal}
		</p>
	);
}
