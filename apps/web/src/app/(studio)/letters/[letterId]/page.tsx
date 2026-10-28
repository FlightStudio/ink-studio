import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { LetterEditor } from "@/features/editor/components/letter-editor";
import { listDoodles, listSignatures } from "@/server/drawings";
import { listFonts } from "@/server/fonts";
import { getLetter } from "@/server/letters";

type Props = { params: Promise<{ letterId: string }> };

export async function generateMetadata({ params }: Props) {
	const letter = await getLetter((await params).letterId);
	return { title: `${letter?.title ?? "Letter"} · Ink Studio` };
}

export default async function LetterEditorPage({ params }: Props) {
	const letter = await getLetter((await params).letterId);
	if (!letter) {
		return (
			<DeskMessage
				title="This letter is not here"
				actions={
					<Link
						href="/letters"
						className="rounded-full bg-paper px-4 py-2 text-ui shadow-float transition-shadow duration-(--duration-quick) hover:shadow-none focus-visible:outline-2 focus-visible:outline-ring"
					>
						Back to letters
					</Link>
				}
			>
				It may have been deleted, or it belongs to another studio.
			</DeskMessage>
		);
	}
	const doodles = letter.editable ? await listDoodles() : [];
	const signatures = letter.editable ? await listSignatures() : [];
	const fonts = await listFonts();
	return (
		<LetterEditor
			key={`${letter.id}:${letter.revision}`}
			letter={letter}
			doodles={doodles}
			signatures={signatures}
			fonts={fonts}
		/>
	);
}
