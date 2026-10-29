import Link from "next/link";
import { DeskMessage } from "@/features/editor/components/desk-message";

export default function FontNotFound() {
	return (
		<DeskMessage
			title="This handwriting is not here"
			actions={
				<Link
					href="/fonts"
					className="rounded-full bg-paper px-4 py-2 text-ui shadow-float"
				>
					Back to handwriting
				</Link>
			}
		>
			It may have been deleted, or it belongs to someone else.
		</DeskMessage>
	);
}
