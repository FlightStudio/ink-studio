"use client";

import { ErrorCard } from "./error-card.tsx";

export function ErrorView({
	message,
	onRetry,
}: {
	message: string;
	onRetry?: () => void;
}) {
	return (
		<ErrorCard title="Something went wrong" message={message}>
			{onRetry ? (
				<button type="button" onClick={onRetry}>
					Try again
				</button>
			) : null}
		</ErrorCard>
	);
}
