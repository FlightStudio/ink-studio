import { Desk } from "@repo/ui/components/desk";
import { buttonVariants } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { FontList } from "@/features/fonts/components/font-list";
import { getSession } from "@/server/auth";
import { listFonts } from "@/server/fonts";

export const metadata = { title: "Handwriting · Ink Studio" };

export default async function FontsPage() {
	const session = await getSession();
	if (!session?.userOrganization) {
		return (
			<DeskMessage title="Nobody is signed in">
				Run pnpm seed, then refresh this page.
			</DeskMessage>
		);
	}
	const fonts = await listFonts();
	return (
		<Desk className="px-6 py-10 sm:px-12 xl:px-20 xl:py-14">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
				<header className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
							My handwriting
						</p>
						<h1 className="mt-3 font-display text-display">Handwriting</h1>
					</div>
					{fonts.length > 0 ? (
						<Link
							href="/fonts/new"
							className={buttonVariants({ size: "lg", className: "px-4" })}
						>
							Make your handwriting
						</Link>
					) : null}
				</header>
				<FontList fonts={fonts} />
			</div>
		</Desk>
	);
}
