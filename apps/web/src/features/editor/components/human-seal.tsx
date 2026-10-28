import type { SealFontView } from "@repo/services/letters";
import type { FontOption, LetterContent, SealFont } from "@repo/types";
import { humanSeal } from "@repo/types";

export type HumanSealProps = {
	content: LetterContent;
	sealFonts: Record<string, SealFontView>;
	fonts: FontOption[];
};

export function HumanSeal({ content, sealFonts, fonts }: HumanSealProps) {
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
	return (
		<p
			data-human-seal=""
			className="max-w-md text-center text-sm text-ink-muted"
		>
			{seal}
		</p>
	);
}
