import { Desk } from "@repo/ui/components/desk";
import { notFound } from "next/navigation";
import { FontHome } from "@/features/fonts/components/font-home";
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
	if (!font) notFound();
	return (
		<Desk className="px-6 py-10 sm:px-12 xl:px-20 xl:py-14">
			<FontHome font={font} from={from} />
		</Desk>
	);
}
