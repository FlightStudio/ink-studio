"use client";

import { Button } from "@repo/ui/components/ui/button";
import type { AutosaveState } from "@/lib/autosave";

const LABELS = {
	saved: "Saved",
	dirty: "Saving…",
	saving: "Saving…",
	retrying: "Connection interrupted, retrying",
} as const satisfies Record<
	Exclude<AutosaveState["status"], "conflict" | "blocked">,
	string
>;

export type SaveLineProps = {
	state: AutosaveState;
	onLoadLatest: () => void;
	onKeepMine: () => void;
	onRetry: () => void;
	onDownload: () => void;
};

export function SaveLine({
	state,
	onLoadLatest,
	onKeepMine,
	onRetry,
	onDownload,
}: SaveLineProps) {
	if (state.status === "conflict") {
		return (
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 animate-settle">
				<p role="status" className="text-ui text-ink">
					{state.resolving
						? "Loading the saved version…"
						: (state.message ?? "A different version of this letter is saved")}
				</p>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						className="rounded-full"
						onClick={onLoadLatest}
						disabled={Boolean(state.resolving)}
					>
						Load the latest
					</Button>
					<Button
						size="sm"
						className="rounded-full"
						onClick={onKeepMine}
						disabled={Boolean(state.resolving)}
					>
						Keep mine
					</Button>
					<Button variant="ghost" size="sm" onClick={onDownload}>
						Download draft
					</Button>
				</div>
			</div>
		);
	}
	if (state.status === "blocked" || state.status === "retrying") {
		return (
			<div className="flex flex-wrap items-center gap-2">
				<p
					role="status"
					data-status={state.status}
					className="max-w-sm text-ui text-danger"
				>
					{state.status === "blocked" ? state.message : LABELS.retrying}
				</p>
				<Button variant="ghost" size="sm" onClick={onRetry}>
					Try again
				</Button>
				<Button variant="ghost" size="sm" onClick={onDownload}>
					Download draft
				</Button>
			</div>
		);
	}
	return (
		<p
			role="status"
			data-status={state.status}
			className="text-ui whitespace-nowrap text-ink-muted transition-colors duration-(--duration-quick) data-[status=retrying]:text-danger"
		>
			{LABELS[state.status]}
		</p>
	);
}
