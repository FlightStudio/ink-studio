"use client";

import { Button } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";

export default function LetterErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<DeskMessage
			title="This letter could not open"
			actions={
				<>
					<Button variant="outline" className="rounded-full" onClick={reset}>
						Try again
					</Button>
					<Button
						className="rounded-full"
						nativeButton={false}
						render={<Link href="/letters" />}
					>
						Back to letters
					</Button>
				</>
			}
		>
			{error.message}
		</DeskMessage>
	);
}
