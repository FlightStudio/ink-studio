"use client";

import { deleteLetter } from "@repo/api";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Ellipsis, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type LetterCardProps = {
	id: string;
	title: string;
	updatedAt: Date;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const calendar = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

function editedLabel(updatedAt: Date, now: number): string {
	const ago = now - updatedAt.getTime();
	if (ago < MINUTE_MS) return "Edited just now";
	if (ago < HOUR_MS)
		return `Edited ${relative.format(-Math.floor(ago / MINUTE_MS), "minute")}`;
	if (ago < DAY_MS)
		return `Edited ${relative.format(-Math.floor(ago / HOUR_MS), "hour")}`;
	if (ago < 7 * DAY_MS)
		return `Edited ${relative.format(-Math.floor(ago / DAY_MS), "day")}`;
	return `Edited ${calendar.format(updatedAt)}`;
}

export function LetterCard({ id, title, updatedAt }: LetterCardProps) {
	const router = useRouter();
	const [confirming, setConfirming] = useState(false);
	const [failed, setFailed] = useState(false);
	const [deleting, startDeleting] = useTransition();
	const href = `/letters/${id}`;

	function remove() {
		setFailed(false);
		startDeleting(async () => {
			const response = await deleteLetter(id).catch(() => null);
			if (response?.status === 204 || response?.status === 404) {
				router.refresh();
				return;
			}
			setFailed(true);
		});
	}

	return (
		<li data-letter-id={id} className="group flex flex-col gap-3">
			<Link
				href={href}
				aria-label={`Open ${title}`}
				className="block aspect-[8.5/11] rounded-[3px] bg-paper bg-(image:--letter-paper-texture) bg-size-[125px] bg-repeat shadow-sheet transition-[translate,box-shadow] duration-(--duration-settle) ease-settle outline-offset-4 group-hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-ring"
			/>
			<div className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col gap-0.5">
					<Link
						href={href}
						className="truncate text-ui text-ink hover:underline hover:decoration-rule hover:underline-offset-4"
					>
						{title}
					</Link>
					<p className="text-label text-ink-muted" suppressHydrationWarning>
						{editedLabel(updatedAt, Date.now())}
					</p>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Letter options"
								className="-mr-1 rounded-full text-ink-muted hover:text-ink"
							/>
						}
					>
						<Ellipsis />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-36">
						<DropdownMenuItem
							variant="destructive"
							onClick={() => setConfirming(true)}
						>
							<Trash2 />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<Dialog open={confirming} onOpenChange={setConfirming}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-title font-normal">
							Delete “{title}”?
						</DialogTitle>
						<DialogDescription>
							It leaves your letters. Nothing has been sent.
						</DialogDescription>
					</DialogHeader>
					{failed ? (
						<p role="alert" className="text-ui text-danger">
							The letter could not be deleted. Try again.
						</p>
					) : null}
					<DialogFooter>
						<DialogClose render={<Button variant="outline" />}>
							Keep it
						</DialogClose>
						<Button variant="destructive" disabled={deleting} onClick={remove}>
							{deleting ? "Deleting…" : "Delete letter"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</li>
	);
}
