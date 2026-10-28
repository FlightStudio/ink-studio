import { Desk } from "@repo/ui/components/desk";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { GlyphGrid } from "@/features/fonts/components/glyph-grid";
import { getFont } from "@/server/fonts";

type Props = { params: Promise<{ fontId: string }> };

export async function generateMetadata({ params }: Props) {
	const font = await getFont((await params).fontId);
	return {
		title: `${font ? `${font.ownerName}'s handwriting` : "Handwriting"} · Ink Studio`,
	};
}

export default async function DrawFontPage({ params }: Props) {
	const font = await getFont((await params).fontId);
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
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
				<header>
					<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
						My handwriting
					</p>
					<h1 className="mt-3 font-display text-display">
						{font.ownerName}'s handwriting
					</h1>
				</header>
				<GlyphGrid font={font} />
			</div>
		</Desk>
	);
}
