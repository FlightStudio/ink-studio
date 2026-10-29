"use client";

import { deleteFont } from "@repo/api";
import type { FontOption } from "@repo/types";
import { isUsableFont } from "@repo/types";
import { ConfirmDialog } from "@repo/ui/components/confirm-dialog";
import { StatusPill } from "@repo/ui/components/status-pill";
import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAssetWatch } from "@/lib/use-asset-watch";
import { fontHome } from "../font-links.ts";
import {
	DELETE_NOTE,
	METHOD_LABELS,
	NEEDED_COUNT,
	pillStatus,
	statusLabel,
} from "../font-status.ts";
import { SPECIMEN_TEXT } from "../specimen.ts";
import { FontPreview } from "./font-preview.tsx";

export type FontListProps = { fonts: FontOption[] };

function BuildWatch({ assetId }: { assetId: string }) {
	const router = useRouter();
	useAssetWatch(assetId, (state) => {
		if (state.unreachable) return;
		router.refresh();
	});
	return null;
}

export function FontList({ fonts }: FontListProps) {
	const router = useRouter();
	const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
	const [target, setTarget] = useState<FontOption | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const live = fonts.filter((font) => !removed.has(font.id));

	async function remove(font: FontOption) {
		setDeleting(true);
		setError(null);
		const deleted = await deleteFont(font.id).catch(() => null);
		setDeleting(false);
		if (deleted?.status !== 204 && deleted?.status !== 404) {
			setError("That handwriting could not be deleted, so try again.");
			return;
		}
		setRemoved((current) => new Set(current).add(font.id));
		setConfirming(false);
		router.refresh();
	}

	if (live.length === 0) {
		return (
			<div className="flex flex-col items-start gap-4 rounded-[3px] bg-paper px-6 py-8 shadow-sheet">
				<p className="font-display text-title">No handwriting yet.</p>
				<p className="max-w-prose text-ui text-ink-muted">
					Write 31 letters once, and every letter you send can be written in
					your own hand.
				</p>
				<Link
					href="/fonts/new"
					className={buttonVariants({ size: "lg", className: "px-4" })}
				>
					Make your handwriting
				</Link>
			</div>
		);
	}

	return (
		<>
			<ul className="flex flex-col gap-3">
				{live.map((font) => {
					const name = `${font.ownerName}'s handwriting`;
					return (
						<li
							key={font.id}
							data-font-id={font.id}
							className="group relative flex items-center gap-4 rounded-[3px] bg-paper px-5 py-4 shadow-sheet transition-[translate,box-shadow] duration-(--duration-settle) ease-settle focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-ring hover:-translate-y-0.5"
						>
							{font.status === "building" && font.pendingAssetId ? (
								<BuildWatch assetId={font.pendingAssetId} />
							) : null}
							<div className="flex min-w-0 flex-1 flex-col gap-1.5">
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<Link
										href={fontHome(font.id, null)}
										className="text-title text-ink outline-none after:absolute after:inset-0 after:content-['']"
									>
										{name}
									</Link>
									<StatusPill
										status={pillStatus(font.status)}
										label={statusLabel(
											font.status,
											NEEDED_COUNT - font.missingRequired,
										)}
									/>
								</div>
								<p className="text-label text-ink-muted">
									{METHOD_LABELS[font.source]}
								</p>
								{isUsableFont(font) && font.assetId ? (
									<FontPreview
										fontId={font.id}
										assetId={font.assetId}
										text={SPECIMEN_TEXT}
										className="truncate text-[1.5rem] leading-[1.4] text-ink"
									/>
								) : null}
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon-lg"
								aria-label={`Delete ${name}`}
								className="relative text-ink-muted hover:text-danger"
								onClick={() => {
									setError(null);
									setTarget(font);
									setConfirming(true);
								}}
							>
								<Trash2 />
							</Button>
						</li>
					);
				})}
			</ul>
			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title={`Delete ${target?.ownerName ?? ""}'s handwriting?`}
				description={DELETE_NOTE}
				confirmLabel="Delete"
				pendingLabel="Deleting…"
				pending={deleting}
				error={error}
				onConfirm={() => {
					if (target) void remove(target);
				}}
			/>
		</>
	);
}
