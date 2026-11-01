import type { SealFontView } from "@repo/services/letters";
import type { FontOption, LetterContent, SealFont } from "@repo/types";
import { humanSeal } from "@repo/types";
import Link from "next/link";
import { missingLetterHref } from "../seal-link.ts";

export type HumanSealProps = {
	letterId: string;
	content: LetterContent;
	sealFonts: Record<string, SealFontView>;
	fonts: FontOption[];
};

export function HumanSeal({
	letterId,
	content,
	sealFonts,
	fonts,
}: HumanSealProps) {
	const own = new Map<string, SealFont>();
	for (const [id, font] of Object.entries(sealFonts)) {
		own.set(id, { ownerName: font.ownerName, chars: new Set(font.chars) });
	}
	for (const font of fonts) {
		own.set(font.id, {
			ownerName: font.ownerName,
			chars: new Set(font.chars),
		});
	}
	const seal = humanSeal(content, own);
	if (seal === null) return null;
	const draw = missingLetterHref(content, fonts, letterId);
	return (
		<p
			data-human-seal=""
			className="max-w-md text-center text-sm text-ink-muted"
		>
			{seal}
			{draw ? (
				<>
					{" · "}
					<Link
						href={draw}
						className="text-ink underline decoration-rule underline-offset-4 transition-colors duration-(--duration-quick) hover:decoration-ink focus-visible:outline-2 focus-visible:outline-ring"
					>
						Draw missing letters
					</Link>
				</>
			) : null}
		</p>
	);
}
