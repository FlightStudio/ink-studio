"use client";

import { createLetter } from "@repo/api";
import type { PageFormatId } from "@repo/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProductChoice } from "../products.ts";

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
							className="group flex h-full w-full flex-col items-start gap-5 rounded-[3px] bg-paper px-5 pt-6 pb-5 text-left shadow-sheet transition-[translate,box-shadow] duration-(--duration-settle) ease-settle outline-offset-4 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
						>
							<span aria-hidden className="flex h-28 w-full items-end">
								<span
									className="block h-full max-w-full rounded-[2px] bg-paper bg-(image:--letter-paper-texture) bg-size-[125px] bg-repeat shadow-[0_0_0_1px_var(--rule),var(--shadow-float)] transition-transform duration-(--duration-settle) ease-settle group-hover:-rotate-2"
									style={{
										aspectRatio: String(product.aspect),
										height:
											product.aspect > 1 ? `${100 / product.aspect}%` : "100%",
									}}
								/>
							</span>
							<span className="flex flex-col gap-1">
								<span className="font-display text-title">{product.label}</span>
								<span className="text-ui text-ink-muted">
									{product.description}
								</span>
							</span>
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
