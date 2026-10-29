import { Desk } from "@repo/ui/components/desk";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { LetterList } from "@/features/editor/components/letter-list";
import { NewLetterButton } from "@/features/editor/components/new-letter-button";
import { getSession } from "@/server/auth";
import { listLetters } from "@/server/letters";

export const metadata = { title: "Letters · Ink Studio" };

export default async function LettersPage() {
	const session = await getSession();
	if (!session?.userOrganization) {
		return (
			<DeskMessage title="Nobody is signed in">
				Run pnpm seed, then refresh this page.
			</DeskMessage>
		);
	}
	const letters = await listLetters();
	const empty = letters.items.length === 0;

	return (
		<Desk className="px-6 pt-6 pb-10 sm:px-12 xl:px-20 xl:pt-8 xl:pb-14">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-12">
				<header className="flex flex-wrap items-end justify-between gap-6">
					<div>
						<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
							{session.userOrganization.organization.name}
						</p>
						<h1 className="mt-3 font-display text-display">Letters</h1>
					</div>
					{empty ? null : <NewLetterButton label="New letter" />}
				</header>

				{empty ? (
					<section
						aria-labelledby="first-letter"
						className="flex flex-col items-center gap-8 pt-6 text-center animate-settle"
					>
						<div
							aria-hidden
							className="aspect-[8.5/11] w-40 rotate-[-2deg] rounded-[3px] bg-paper bg-(image:--letter-paper-texture) bg-size-[125px] bg-repeat shadow-sheet"
						/>
						<div className="flex max-w-sm flex-col items-center gap-2">
							<h2 id="first-letter" className="font-display text-display">
								Write your first letter
							</h2>
							<p className="text-ui text-ink-muted">
								Every letter starts on a blank sheet. Write straight onto the
								page; it saves as you go.
							</p>
						</div>
						<div className="flex flex-col items-center gap-4">
							<NewLetterButton label="Start a letter" />
							<p className="max-w-sm text-ui text-ink-muted">
								Want it in your own hand?{" "}
								<Link
									href="/fonts/new"
									className="text-ink underline decoration-rule underline-offset-4 transition-colors duration-(--duration-quick) hover:decoration-ink focus-visible:outline-2 focus-visible:outline-ring"
								>
									Make your handwriting
								</Link>{" "}
								first, in about five minutes.
							</p>
						</div>
					</section>
				) : (
					<LetterList first={letters} />
				)}
			</div>
		</Desk>
	);
}
