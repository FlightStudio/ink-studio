"use client";

import { Button } from "@repo/ui/components/ui/button";

export type FontOfferProps = {
	ownerName: string;
	onUse: () => void;
	onDismiss: () => void;
};

export function FontOffer({ ownerName, onUse, onDismiss }: FontOfferProps) {
	return (
		<section
			aria-label="Handwriting offer"
			className="mb-5 flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-[22px] bg-paper py-2 pr-2 pl-5 text-ui text-ink shadow-float ring-1 ring-[oklch(0.3_0.03_60/0.06)] animate-settle"
		>
			<p>Use {ownerName}'s handwriting for this letter?</p>
			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					className="rounded-full px-3"
					onClick={onDismiss}
				>
					Not now
				</Button>
				<Button className="rounded-full px-3.5" onClick={onUse}>
					Use it
				</Button>
			</div>
		</section>
	);
}
