"use client";

import { deleteFont } from "@repo/api";
import type { FontOption } from "@repo/types";
import { Button } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { useState } from "react";

export type FontListProps = { fonts: FontOption[] };

export function FontList({ fonts }: FontListProps) {
	const [live, setLive] = useState(fonts);
	const [error, setError] = useState<string | null>(null);

	async function remove(font: FontOption) {
		setError(null);
		const deleted = await deleteFont(font.id);
		if (deleted.status !== 204) {
			setError("That handwriting could not be deleted.");
			return;
		}
		setLive((current) => current.filter((item) => item.id !== font.id));
	}

	if (live.length === 0) {
		return (
			<div className="flex flex-col items-start gap-4">
				<p className="text-ui text-ink-muted">No handwriting fonts yet.</p>
				<Link
					href="/fonts/new"
					className="rounded-full bg-paper px-4 py-2 text-ui shadow-float"
				>
					Make a handwriting font
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{error ? (
				<p className="text-ui" style={{ color: "var(--danger)" }}>
					{error}
				</p>
			) : null}
			<ul className="flex flex-col gap-3">
				{live.map((font) => (
					<li
						key={font.id}
						className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper px-4 py-3 shadow-sheet"
					>
						<Link href={`/fonts/${font.id}/draw`} className="text-title">
							{font.ownerName}'s handwriting
						</Link>
						<Button
							type="button"
							variant="outline"
							onClick={() => void remove(font)}
						>
							Delete
						</Button>
					</li>
				))}
			</ul>
		</div>
	);
}
