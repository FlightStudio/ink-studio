"use client";

import { createLetter } from "@repo/api";
import { Button } from "@repo/ui/components/ui/button";
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type NewLetterButtonProps = { label: string };

export function NewLetterButton({ label }: NewLetterButtonProps) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);

	async function start() {
		setPending(true);
		setFailed(false);
		const response = await createLetter({}).catch(() => null);
		if (response?.status === 201) {
			router.push(`/letters/${response.data.id}`);
			return;
		}
		setPending(false);
		setFailed(true);
	}

	return (
		<div className="flex flex-col items-center gap-2">
			<Button
				size="lg"
				className="rounded-full px-4 shadow-float"
				disabled={pending}
				onClick={() => void start()}
			>
				<PenLine />
				{label}
			</Button>
			{failed ? (
				<p role="alert" className="text-label text-danger">
					The letter could not be started. Try again.
				</p>
			) : null}
		</div>
	);
}
