"use client";

import { listLetters } from "@repo/api";
import { parseLetterContent } from "@repo/render/schema";
import type { LetterListPage } from "@repo/services/letters";
import { Button } from "@repo/ui/components/ui/button";
import { useEffect, useRef, useState, useTransition } from "react";
import { LetterCard } from "./letter-card.tsx";

export type LetterListProps = { first: LetterListPage };

async function pageAfter(cursor: string): Promise<LetterListPage | null> {
	try {
		const response = await listLetters({ cursor });
		if (response.status !== 200) return null;
		return {
			items: response.data.items.map((item) => ({
				...item,
				updatedAt: new Date(item.updatedAt),
				preview: {
					...item.preview,
					content: parseLetterContent(item.preview.content),
				},
			})),
			nextCursor: response.data.nextCursor,
		};
	} catch {
		return null;
	}
}

export function LetterList({ first }: LetterListProps) {
	const [more, setMore] = useState<LetterListPage | null>(null);
	const [failed, setFailed] = useState(false);
	const [loading, startLoading] = useTransition();
	const list = useRef<HTMLUListElement>(null);
	const focusNext = useRef<string | null>(null);
	const firstIds = new Set(first.items.map((item) => item.id));
	const items = [
		...first.items,
		...(more?.items ?? []).filter((item) => !firstIds.has(item.id)),
	];
	const nextCursor = more === null ? first.nextCursor : more.nextCursor;

	useEffect(() => {
		const id = focusNext.current;
		if (id === null || more === null) return;
		focusNext.current = null;
		list.current
			?.querySelector<HTMLElement>(`[data-letter-id="${id}"] a`)
			?.focus();
	}, [more]);

	function showMore(cursor: string) {
		setFailed(false);
		startLoading(async () => {
			const page = await pageAfter(cursor);
			if (page === null) {
				setFailed(true);
				return;
			}
			focusNext.current = page.items[0]?.id ?? null;
			setMore((loaded) => ({
				items: [...(loaded?.items ?? []), ...page.items],
				nextCursor: page.nextCursor,
			}));
		});
	}

	function deleted(id: string) {
		setMore(
			(loaded) =>
				loaded && {
					...loaded,
					items: loaded.items.filter((item) => item.id !== id),
				},
		);
	}

	return (
		<div className="flex flex-col items-center gap-12">
			<ul
				ref={list}
				className="grid w-full grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-10 gap-y-12"
			>
				{items.map((letter) => (
					<LetterCard
						key={letter.id}
						id={letter.id}
						title={letter.title}
						updatedAt={letter.updatedAt}
						productLabel={letter.productLabel}
						preview={letter.preview}
						onDeleted={deleted}
					/>
				))}
			</ul>
			{nextCursor === null ? null : (
				<div className="flex flex-col items-center gap-3">
					<Button
						variant="outline"
						disabled={loading}
						onClick={() => showMore(nextCursor)}
					>
						{loading ? "Loading…" : "Show more"}
					</Button>
					{failed ? (
						<p role="alert" className="text-ui text-danger">
							More letters could not be loaded. Try again.
						</p>
					) : null}
				</div>
			)}
		</div>
	);
}
