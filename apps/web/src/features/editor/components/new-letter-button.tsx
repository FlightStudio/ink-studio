"use client";

import { Button } from "@repo/ui/components/ui/button";
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";

export type NewLetterButtonProps = { label: string };

export function NewLetterButton({ label }: NewLetterButtonProps) {
	const router = useRouter();

	return (
		<Button
			size="lg"
			className="rounded-full px-4 shadow-float"
			onClick={() => router.push("/letters/new")}
		>
			<PenLine />
			{label}
		</Button>
	);
}
