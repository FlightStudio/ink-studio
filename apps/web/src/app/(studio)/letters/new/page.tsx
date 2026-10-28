import { PAGE_SPECS, type PageFormatId, type PageSpec } from "@repo/types";
import { Desk } from "@repo/ui/components/desk";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { ProductPicker } from "@/features/editor/components/product-picker";
import { getSession } from "@/server/auth";

export const metadata = { title: "New letter · Ink Studio" };

function inches(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	return Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded);
}

function sizeOf(spec: PageSpec): string {
	return `${inches(spec.widthIn)} × ${inches(spec.heightIn)} in`;
}

function products() {
	return (Object.keys(PAGE_SPECS) as PageFormatId[])
		.sort((left, right) => {
			const rank = (format: PageFormatId) =>
				PAGE_SPECS[format].product === "letter" ? 0 : 1;
			return rank(left) - rank(right);
		})
		.map((format) => {
			const spec = PAGE_SPECS[format];
			return {
				format,
				label: spec.label,
				product: spec.product,
				size: sizeOf(spec),
			};
		});
}

export default async function NewLetterPage() {
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
						{session.userOrganization.organization.name}
					</p>
					<h1 className="mt-3 font-display text-display">
						What are you making?
					</h1>
				</header>
				<ProductPicker products={products()} />
			</div>
		</Desk>
	);
}
