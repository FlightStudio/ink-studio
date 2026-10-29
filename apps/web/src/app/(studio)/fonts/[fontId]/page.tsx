import { Desk } from "@repo/ui/components/desk";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { FontHome } from "@/features/fonts/components/font-home";
import { drawnCount } from "@/features/fonts/font-status";
import { getFont } from "@/server/fonts";
import { type FontSearchParams, letterFrom } from "../params.ts";

type Props = {
	params: Promise<{ fontId: string }>;
	searchParams: FontSearchParams;
};

export async function generateMetadata({ params }: Props) {
	const font = await getFont((await params).fontId);
	return {
		title: `${font ? `${font.ownerName}'s handwriting` : "Handwriting"} · Ink Studio`,
	};
}

export default async function FontHomePage({ params, searchParams }: Props) {
	const font = await getFont((await params).fontId);
	const from = letterFrom((await searchParams).from);
	if (!font) {
		return (
			<DeskMessage
				title="This handwriting is not here"
				actions={
					<Link
						href="/fonts"
						className="rounded-full bg-paper px-4 py-2 text-ui shadow-float"
					>
						Back to handwriting
					</Link>
				}
			>
				It may have been deleted, or it belongs to someone else.
			</DeskMessage>
		);
	}
	return (
		<Desk className="px-6 py-10 sm:px-12 xl:px-20 xl:py-14">
			<FontHome font={font} from={from} drawn={drawnCount(font.glyphs)} />
		</Desk>
	);
}
