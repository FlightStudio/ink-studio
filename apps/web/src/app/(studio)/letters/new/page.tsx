import { Desk } from "@repo/ui/components/desk";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";
import { ProductPicker } from "@/features/editor/components/product-picker";
import { productChoices } from "@/features/editor/products";
import { getSession } from "@/server/auth";

export const metadata = { title: "New letter · Ink Studio" };

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
		<Desk className="px-6 pt-6 pb-10 sm:px-12 xl:px-20 xl:pt-8 xl:pb-14">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
				<header className="flex flex-wrap items-end justify-between gap-6">
					<div>
						<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
							{session.userOrganization.organization.name}
						</p>
						<h1 className="mt-3 font-display text-display">
							What are you making?
						</h1>
					</div>
					<Link
						href="/letters"
						className={buttonVariants({
							variant: "ghost",
							className:
								"rounded-full pr-3.5 pl-2.5 text-ink-muted hover:text-ink pointer-coarse:min-h-11",
						})}
					>
						<ChevronLeft />
						Back to letters
					</Link>
				</header>
				<ProductPicker products={productChoices()} />
			</div>
		</Desk>
	);
}
