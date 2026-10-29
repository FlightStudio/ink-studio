import { Desk } from "@repo/ui/components/desk";
import { notFound, redirect } from "next/navigation";
import { GlyphGrid } from "@/features/fonts/components/glyph-grid";
import { fontHome } from "@/features/fonts/font-links";
import { getFont } from "@/server/fonts";
import { type FontSearchParams, letterFrom, single } from "../../params.ts";

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

export default async function DrawFontPage({ params, searchParams }: Props) {
	const font = await getFont((await params).fontId);
	const query = await searchParams;
	const from = letterFrom(query.from);
	if (!font) notFound();
	if (font.source !== "drawn") {
		redirect(fontHome(font.id, from));
	}
	return (
		<Desk className="px-4 pt-6 pb-16 sm:px-10 sm:pt-8 xl:px-16">
			<div className="mx-auto w-full max-w-6xl">
				<GlyphGrid font={font} from={from} glyph={single(query.glyph)} />
			</div>
		</Desk>
	);
}
