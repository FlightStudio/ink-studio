import { Desk } from "@repo/ui/components/desk";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { NewFontForm } from "@/features/fonts/components/new-font-form";
import { getSession } from "@/server/auth";

export const metadata = { title: "New handwriting · Ink Studio" };

export default async function NewFontPage() {
	const session = await getSession();
	if (!session?.userOrganization) {
		return (
			<DeskMessage title="Nobody is signed in">
				Run pnpm seed, then refresh this page.
			</DeskMessage>
		);
	}
	return (
		<Desk className="px-6 py-10 sm:px-12 xl:px-20 xl:py-14">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
				<header>
					<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
						My handwriting
					</p>
					<h1 className="mt-3 font-display text-display">New handwriting</h1>
				</header>
				<NewFontForm />
			</div>
		</Desk>
	);
}
