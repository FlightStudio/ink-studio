"use client";

import { Button } from "@repo/ui/components/ui/button";
import type { AutosaveState } from "@/lib/autosave";

const LABELS = {
	saved: "Saved",
	dirty: "Saving…",
	saving: "Saving…",
	retrying: "Offline, retrying",
} as const satisfies Record<
	Exclude<AutosaveState["status"], "conflict">,
	string
>;

export type SaveLineProps = {
	state: AutosaveState;
	onLoadLatest: () => void;
	onKeepMine: () => void;
};

export function SaveLine({ state, onLoadLatest, onKeepMine }: SaveLineProps) {
	if (state.status === "conflict") {
		return (
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 animate-settle">
				<p role="status" className="text-ui text-ink">
					This letter changed in another tab
				</p>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						className="rounded-full"
						onClick={onLoadLatest}
					>
						Load the latest
					</Button>
					<Button size="sm" className="rounded-full" onClick={onKeepMine}>
						Keep mine
					</Button>
				</div>
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
