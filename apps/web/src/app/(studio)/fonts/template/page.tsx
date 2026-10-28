import { Desk } from "@repo/ui/components/desk";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { TemplateActions } from "@/features/fonts/components/template-actions";
import { TemplateSheet } from "@/features/fonts/components/template-sheet";
import { getSession } from "@/server/auth";

export const metadata = { title: "Template · Ink Studio" };

export default async function TemplateFontPage() {
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
			<style>{`
				@page { size: 8.5in 11in; margin: 0; }
				@media print {
					body * { visibility: hidden; }
					.template-sheet, .template-sheet * { visibility: visible; }
					.template-sheet { position: absolute !important; left: 0; top: 0; }
				}
			`}</style>
			<div className="mx-auto mb-8 flex w-full max-w-[8.5in] flex-col gap-4">
				<header>
					<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
						My handwriting
					</p>
					<h1 className="mt-3 font-display text-display">
						Photograph the template
					</h1>
				</header>
				<p className="text-ui text-ink-muted">
					Print this page at 100%. Write in the cells, then photograph the whole
					page.
				</p>
				<TemplateActions />
			</div>
			<div className="mx-auto w-fit shadow-float">
				<TemplateSheet />
			</div>
		</Desk>
	);
}
