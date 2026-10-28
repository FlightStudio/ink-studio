"use client";

import { getAssetStatus, requestExport } from "@repo/api";
import { type ApiErrorCode, errorMessages } from "@repo/errors";
import { StatusPill } from "@repo/ui/components/status-pill";
import { Button } from "@repo/ui/components/ui/button";
import { useEffect, useRef, useState } from "react";

type Proof = {
	id: string;
	status: "pending" | "running" | "done" | "failed";
	message: string | null;
};

export type ExportButtonProps = {
	letterId: string;
	revision: number | null;
};

export function ExportButton({ letterId, revision }: ExportButtonProps) {
	const timer = useRef<ReturnType<typeof setInterval> | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [proofs, setProofs] = useState<Proof[]>([]);

	useEffect(
		() => () => {
			if (timer.current) clearInterval(timer.current);
		},
		[],
	);

	function watch(ids: string[]) {
		const tick = async () => {
			const next = await Promise.all(
				ids.map(async (id) => {
					const status = await getAssetStatus(id);
					if (status.status !== 200) {
						return {
							id,
							status: "pending" as const,
							message: null,
						};
					}
					const failed = status.data.status === "failed";
					return {
						id,
						status: status.data.status,
						message: failed ? failureCopy(status.data.error) : null,
					};
				}),
			);
			setProofs(next);
			if (
				next.every(
					(proof) => proof.status === "done" || proof.status === "failed",
				)
			) {
				if (timer.current) clearInterval(timer.current);
				timer.current = null;
				setBusy(false);
			}
		};
		if (timer.current) clearInterval(timer.current);
		void tick();
		timer.current = setInterval(() => void tick(), 500);
	}

	async function exportProof() {
		if (revision === null || busy) return;
		setError(null);
		setBusy(true);
		const created = await requestExport(letterId, { revision });
		if (created.status !== 201) {
			setBusy(false);
			setError(
				"message" in created.data
					? created.data.message
					: "That proof could not be started.",
			);
			return;
		}
		setProofs(
			created.data.assetIds.map((id) => ({
				id,
				status: "pending",
				message: null,
			})),
		);
		watch(created.data.assetIds);
	}

	return (
		<div className="ml-auto flex flex-col items-end gap-2">
			<Button
				type="button"
				variant="outline"
				disabled={revision === null || busy}
				onClick={() => void exportProof()}
			>
				Export proof
			</Button>
			{error ? (
				<p className="text-ui" style={{ color: "var(--danger)" }}>
					{error}
				</p>
			) : null}
			{proofs.map((proof) =>
				proof.status === "done" ? (
					<a
						key={proof.id}
						href={`/api/assets/${proof.id}`}
						className="text-ui text-ink underline"
					>
						Download the proof
					</a>
				) : proof.status === "failed" ? (
					<p
						key={proof.id}
						className="text-ui"
						style={{ color: "var(--danger)" }}
					>
						{proof.message}
					</p>
				) : (
					<StatusPill
						key={proof.id}
						status={proof.status}
						label="Making the proof"
					/>
				),
			)}
		</div>
	);
}

function failureCopy(code: string | null): string {
	if (code && code in errorMessages) return errorMessages[code as ApiErrorCode];
	return errorMessages.processing_failed;
}
