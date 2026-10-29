import { buttonVariants } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { StudioShell } from "@/components/studio/studio-shell";
import { DeskMessage } from "@/features/editor/components/desk-message";

export const metadata = { title: "Not here · Ink Studio" };

export default function NotFoundPage() {
	return (
		<StudioShell>
			<DeskMessage
				title="This page is not here"
				actions={
					<Link
						href="/letters"
						className={buttonVariants({
							size: "lg",
							className:
								"rounded-full px-4 shadow-float pointer-coarse:min-h-11",
						})}
					>
						Back to letters
					</Link>
				}
			>
				The address may be mistyped, or the page has moved.
			</DeskMessage>
		</StudioShell>
	);
}
