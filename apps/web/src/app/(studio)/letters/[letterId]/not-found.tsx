import { buttonVariants } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";

export default function LetterNotFound() {
	return (
		<DeskMessage
			title="This letter is not here"
			actions={
				<Link
					href="/letters"
					className={buttonVariants({
						size: "lg",
						className: "rounded-full px-4 shadow-float pointer-coarse:min-h-11",
					})}
				>
					Back to letters
				</Link>
			}
		>
			It may have been deleted, or it belongs to another studio.
		</DeskMessage>
	);
}
