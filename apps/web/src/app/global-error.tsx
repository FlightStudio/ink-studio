"use client";

import { ErrorView } from "@/components/shared/error-view";

export default function GlobalErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang="en">
			<body>
				<ErrorView message={error.message} onRetry={reset} />
			</body>
		</html>
	);
}
