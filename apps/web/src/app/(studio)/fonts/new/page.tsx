import { Desk } from "@repo/ui/components/desk";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { NewFontForm } from "@/features/fonts/components/new-font-form";
import { sealNameFrom } from "@/features/fonts/font-status";
import { getSession } from "@/server/auth";
import { type FontSearchParams, letterFrom } from "../params.ts";

export const metadata = { title: "Make your handwriting · Ink Studio" };

export default async function NewFontPage({
	searchParams,
}: {
	searchParams: FontSearchParams;
}) {
	const session = await getSession();
	if (!session?.userOrganization) {
		return (
			<DeskMessage title="Nobody is signed in">
				Run pnpm seed, then refresh this page.
			</DeskMessage>
		);
	}
	const from = letterFrom((await searchParams).from);
	return (
		<Desk className="px-6 py-10 sm:px-12 xl:px-20 xl:py-14">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
				<header className="flex flex-col gap-3">
					<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
						My handwriting
					</p>
					<h1 className="font-display text-display">Make your handwriting</h1>
					<p className="max-w-prose text-ui text-ink-muted">
						Your letters are then written in your own hand, and the seal under
						each one says so.
					</p>
				</header>
				<NewFontForm
					defaultName={sealNameFrom(session.user.name)}
					from={from}
				/>
			</div>
		</Desk>
	);
}
