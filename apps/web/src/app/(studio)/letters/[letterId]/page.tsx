import { isUsableFont } from "@repo/types";
import { buttonVariants } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { LetterEditor } from "@/features/editor/components/letter-editor";
import { listDoodles, listSignatures } from "@/server/drawings";
import { listFonts } from "@/server/fonts";
import { getLetter } from "@/server/letters";

type Props = {
	params: Promise<{ letterId: string }>;
	searchParams: Promise<{ font?: string | string[] }>;
};

export async function generateMetadata({ params }: Props) {
	const letter = await getLetter((await params).letterId);
	return { title: `${letter?.title ?? "Letter"} · Ink Studio` };
}

export default async function LetterEditorPage({
	params,
	searchParams,
}: Props) {
	const letter = await getLetter((await params).letterId);
	if (!letter) {
		return (
			<DeskMessage
				title="This letter is not here"
				actions={
					<Link
						href="/letters"
						className={buttonVariants({
							size: "lg",
							className:
								"rounded-full px-4 shadow-float pointer-coarse:min-h-11",
						})}
					>
						Back to letters
					</Link>
				}
			>
				It may have been deleted, or it belongs to another studio.
			</DeskMessage>
		);
	}
	const [doodles, signatures, fonts] = await Promise.all([
		letter.editable ? listDoodles() : [],
		letter.editable ? listSignatures() : [],
		listFonts(),
	]);
	const offered = (await searchParams).font;
	const fontOffer = letter.editable
		? (fonts.find((font) => font.id === offered && isUsableFont(font)) ?? null)
		: null;
	return (
		<LetterEditor
			key={`${letter.id}:${letter.revision}`}
			letter={letter}
			doodles={doodles}
			signatures={signatures}
			fonts={fonts}
			fontOffer={fontOffer}
		/>
	);
}
