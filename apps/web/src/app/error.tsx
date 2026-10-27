"use client";

import { ErrorView } from "@/components/shared/error-view";

export default function ErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return <ErrorView message={error.message} onRetry={reset} />;
}
