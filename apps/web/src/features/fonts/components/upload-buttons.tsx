"use client";

import { Button } from "@repo/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import type { UploadKind } from "../font-errors.ts";
import { fontHome } from "../font-links.ts";
import { cleanOwnerName } from "../font-status.ts";
import { FONT_FILE_ACCEPT, PHOTO_ACCEPT, startFont } from "../start-font.ts";

export type UploadChoice = {
	label: string;
	icon?: ReactNode;
	camera?: boolean;
	variant?: "default" | "outline";
};

export type UploadButtonsProps = {
	kind: UploadKind;
	ownerName: string;
	from: string | null;
	replacing: string | null;
	choices: readonly UploadChoice[];
	disabled?: boolean;
	onBusy?(busy: boolean): void;
};

const SENDING: Record<UploadKind, string> = {
	photo: "Sending your photo…",
	"font-file": "Sending your file…",
};

export function UploadButtons({
	kind,
	ownerName,
	from,
	replacing,
	choices,
	disabled = false,
	onBusy,
}: UploadButtonsProps) {
	const router = useRouter();
	const inputs = useRef<(HTMLInputElement | null)[]>([]);
	const [busy, setBusy] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const name = cleanOwnerName(ownerName);

	function busyWith(index: number | null) {
		setBusy(index);
		onBusy?.(index !== null);
	}

	async function send(index: number, file: File) {
		busyWith(index);
		setError(null);
		const started = await startFont({
			ownerName: name,
			kind,
			file,
			replacing,
		});
		if (!started.ok) {
			busyWith(null);
			setError(started.error);
			return;
		}
		const href = fontHome(started.id, from);
		if (replacing) router.replace(href);
		else router.push(href);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				{choices.map((choice, index) => (
					<span key={choice.label} className="contents">
						<input
							ref={(element) => {
								inputs.current[index] = element;
							}}
							type="file"
							tabIndex={-1}
							aria-hidden
							data-upload={choice.label}
							accept={kind === "photo" ? PHOTO_ACCEPT : FONT_FILE_ACCEPT}
							capture={choice.camera ? "environment" : undefined}
							className="sr-only"
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								if (file) void send(index, file);
							}}
						/>
						<Button
							type="button"
							size="lg"
							variant={choice.variant ?? "default"}
							className="px-4"
							disabled={disabled || busy !== null || name === ""}
							onClick={() => inputs.current[index]?.click()}
						>
							{choice.icon}
							{busy === index ? SENDING[kind] : choice.label}
						</Button>
					</span>
				))}
			</div>
			{error ? (
				<p role="alert" className="text-ui text-danger">
					{error}
				</p>
			) : null}
		</div>
	);
}
