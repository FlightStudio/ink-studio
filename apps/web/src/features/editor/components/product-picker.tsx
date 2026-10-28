"use client";

import { createLetter } from "@repo/api";
import type { PageFormatId } from "@repo/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type ProductChoice = {
	format: PageFormatId;
	label: string;
	product: string;
	size: string;
};

export type ProductPickerProps = { products: ProductChoice[] };

export function ProductPicker({ products }: ProductPickerProps) {
	const router = useRouter();
	const [pending, setPending] = useState<PageFormatId | null>(null);
	const [failed, setFailed] = useState(false);

	async function choose(format: PageFormatId) {
		if (pending) return;
		setPending(format);
		setFailed(false);
		const response = await createLetter({ format }).catch(() => null);
		if (response?.status === 201) {
			router.push(`/letters/${response.data.id}`);
			return;
		}
		setPending(null);
		setFailed(true);
	}

	return (
		<div className="flex flex-col gap-4">
			<ul className="grid gap-4 sm:grid-cols-2">
				{products.map((product) => (
					<li key={product.format}>
						<button
							type="button"
							data-format={product.format}
							disabled={pending !== null}
							onClick={() => void choose(product.format)}
							className="flex h-full w-full flex-col items-start gap-2 rounded-[3px] bg-paper px-5 py-6 text-left shadow-sheet transition-[translate,box-shadow] duration-(--duration-settle) ease-settle outline-offset-4 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
						>
							<span className="text-label tracking-[0.08em] text-ink-muted uppercase">
								{product.product}
							</span>
							<span className="font-display text-title">{product.label}</span>
							<span className="text-ui text-ink-muted">{product.size}</span>
						</button>
					</li>
				))}
			</ul>
			{failed ? (
				<p role="alert" className="text-ui text-danger">
					That could not be started. Try again.
				</p>
			) : null}
		</div>
	);
}
