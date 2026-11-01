import { notFound } from "next/navigation";
import { LetterEditor } from "@/features/editor/components/letter-editor";
import { fontOfferFor } from "@/features/editor/offered-font";
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
	if (!letter) notFound();
	const [doodles, signatures, fonts] = await Promise.all([
		letter.editable ? listDoodles() : [],
		letter.editable ? listSignatures() : [],
		listFonts(),
	]);
	const offered = (await searchParams).font;
	const fontOffer = fontOfferFor(
		letter.content,
		fonts,
		offered,
		letter.editable,
	);
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
