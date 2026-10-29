"use client";

import { requestExport } from "@repo/api";
import type { PageSpec } from "@repo/types";
import { StatusPill } from "@repo/ui/components/status-pill";
import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { watchAssetStatus } from "@/lib/use-asset-watch";
import {
	afterReading,
	type ExportState,
	failureMessage,
	proofLabels,
	workingOn,
} from "../export-progress.ts";

export type ExportButtonProps = {
	letterId: string;
	revision: number | null;
	spec: PageSpec;
	blocker: string | null;
};

export function ExportButton({
	letterId,
	revision,
	spec,
	blocker,
}: ExportButtonProps) {
	const [state, setState] = useState<ExportState>({ phase: "idle" });
	const [open, setOpen] = useState(false);
	const [exported, setExported] = useState<number | null>(null);
	const stopWatching = useRef<() => void>(() => {});

	useEffect(() => () => stopWatching.current(), []);

	const watch = useCallback((ids: readonly string[]) => {
		stopWatching.current();
		const stops = ids.map((id) =>
			watchAssetStatus(id, (reading) =>
				setState((previous) => afterReading(previous, id, reading)),
			),
		);
		stopWatching.current = () => {
			for (const stop of stops) stop();
		};
	}, []);

	const start = useCallback(async () => {
		stopWatching.current();
		if (blocker) {
			setState({ phase: "blocked", reason: blocker });
			return;
		}
		if (revision === null) {
			setState({ phase: "saving" });
			return;
		}
		setState({ phase: "starting" });
		setExported(revision);
		const created = await requestExport(letterId, { revision }).catch(
			() => null,
		);
		if (created?.status !== 201) {
			setState({
				phase: "failed",
				message:
					created && "message" in created.data
						? created.data.message
						: failureMessage(null),
			});
			return;
		}
		setState(workingOn(created.data.assetIds));
		watch(created.data.assetIds);
	}, [blocker, letterId, revision, watch]);

	useEffect(() => {
		if (state.phase === "saving" && revision !== null) void start();
	}, [state.phase, revision, start]);

	useEffect(() => {
		if (state.phase !== "working") stopWatching.current();
	}, [state.phase]);

	const busy =
		state.phase === "saving" ||
		state.phase === "starting" ||
		state.phase === "working";
	const slow =
		state.phase === "working" && state.proofs.some((proof) => proof.slow);
	const labels =
		state.phase === "ready" ? proofLabels(spec, state.proofs.length) : [];

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next || busy) return;
				if (state.phase === "ready" && exported === revision) return;
				void start();
			}}
		>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						className="rounded-full bg-paper px-3.5"
						data-busy={busy || undefined}
					/>
				}
			>
				{busy ? (
					<span
						aria-hidden
						className="size-1.5 motion-safe:animate-pulse rounded-full bg-ink-accent"
					/>
				) : null}
				Export proof
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="w-80 gap-3 rounded-2xl bg-paper p-4 text-ui text-ink shadow-float ring-[oklch(0.3_0.03_60/0.06)]"
			>
				<div aria-live="polite" className="flex flex-col items-start gap-3">
					{state.phase === "blocked" ? (
						<>
							<PopoverTitle className="text-ui font-medium">
								Not ready to export
							</PopoverTitle>
							<PopoverDescription className="text-ink-muted">
								{state.reason}
							</PopoverDescription>
						</>
					) : null}
					{state.phase === "saving" ? (
						<StatusPill status="pending" label="Saving your letter first" />
					) : null}
					{state.phase === "starting" || state.phase === "working" ? (
						<>
							<StatusPill status="running" label="Making the proof" />
							{slow ? (
								<div className="flex w-full items-center justify-between gap-3">
									<p className="text-ink-muted">
										This is taking longer than usual.
									</p>
									<Button
										variant="outline"
										size="sm"
										className="rounded-full"
										onClick={() => void start()}
									>
										Try again
									</Button>
								</div>
							) : (
								<p className="text-ink-muted">
									Usually under a minute. You can keep writing.
								</p>
							)}
						</>
					) : null}
					{state.phase === "ready" ? (
						<>
							<PopoverTitle className="text-ui font-medium">
								Your proof is ready
							</PopoverTitle>
							<div className="flex flex-wrap gap-2">
								{state.proofs.map((proof, index) => (
									<a
										key={proof.id}
										href={`/api/assets/${proof.id}`}
										target="_blank"
										rel="noopener"
										className={buttonVariants({
											variant: "outline",
											className: "rounded-full",
										})}
									>
										{labels[index]}
										<ExternalLink />
									</a>
								))}
							</div>
							{exported !== revision ? (
								<p className="text-ink-muted">
									The letter changed since.{" "}
									<button
										type="button"
										className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
										onClick={() => void start()}
									>
										Export again
									</button>
								</p>
							) : null}
						</>
					) : null}
					{state.phase === "failed" ? (
						<div className="flex w-full items-start justify-between gap-3">
							<p style={{ color: "var(--danger)" }}>{state.message}</p>
							<Button
								variant="outline"
								size="sm"
								className="rounded-full"
								onClick={() => void start()}
							>
								Try again
							</Button>
						</div>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
