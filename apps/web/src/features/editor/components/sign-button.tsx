"use client";

import { Button } from "@repo/ui/components/ui/button";

export function SignButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="rounded-full bg-paper"
			onClick={onClick}
		>
			Sign
		</Button>
	);
}
