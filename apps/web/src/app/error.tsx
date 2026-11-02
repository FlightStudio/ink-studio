"use client";

import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { StudioShell } from "@/components/studio/studio-shell";
import { DeskMessage } from "@/features/editor/components/desk-message";

export default function ErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<StudioShell>
			<DeskMessage
				title="Something went wrong"
				actions={
					<>
						<Button variant="outline" className="rounded-full" onClick={reset}>
							Try again
						</Button>
						<Link
							href="/letters"
							className={buttonVariants({
								className: "rounded-full pointer-coarse:min-h-11",
							})}
						>
							Back to letters
						</Link>
					</>
				}
			>
				{error.message}
			</DeskMessage>
		</StudioShell>
	);
}
