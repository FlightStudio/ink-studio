import { Desk } from "@repo/ui/components/desk";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { TemplatePreview } from "@/features/fonts/components/template-preview";
import { TemplateSteps } from "@/features/fonts/components/template-steps";
import { newFont } from "@/features/fonts/font-links";
import { defaultSealName } from "@/features/fonts/font-status";
import { getSession } from "@/server/auth";
import { type FontSearchParams, letterFrom, single } from "../params.ts";

export const metadata = { title: "Write on paper · Ink Studio" };

const PRINT_CSS = `
@page { size: 8.5in 11in; margin: 0; }
@media print {
	body *:not(:has(.template-sheet), .template-sheet, .template-sheet *) { display: none !important; }
	*:has(.template-sheet) { margin: 0 !important; padding: 0 !important; border: 0 !important; width: auto !important; height: auto !important; min-height: 0 !important; max-width: none !important; transform: none !important; box-shadow: none !important; background: white !important; }
	*:has(.template-sheet)::before { display: none !important; }
}
`;

export default async function TemplateFontPage({
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
	const query = await searchParams;
	const from = letterFrom(query.from);
	const defaultName = defaultSealName(single(query.name), session.user.name);
	return (
		<Desk className="px-4 py-10 sm:px-12 xl:px-20 xl:py-14">
			<style>{PRINT_CSS}</style>
			<div className="mx-auto mb-12 flex w-full max-w-[8.5in] flex-col gap-10">
				<header className="flex flex-col gap-3">
					<Link
						href={newFont(from)}
						className="-ml-1 inline-flex w-fit items-center gap-1 rounded-full py-1 pr-2 text-ui text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
					>
						<ChevronLeft className="size-4" />
						Make your handwriting
					</Link>
					<h1 className="font-display text-display">Write on paper</h1>
					<p className="max-w-prose text-ui text-ink-muted">
						Your font keeps the real ink of your own pen. It takes about 15
						minutes.
					</p>
				</header>
				<TemplateSteps defaultName={defaultName} from={from} />
			</div>
			<TemplatePreview />
		</Desk>
	);
}
