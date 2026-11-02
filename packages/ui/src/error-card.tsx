import type { ReactNode } from "react";

export function ErrorCard({
	title,
	message,
	children,
}: {
	title: string;
	message: string;
	children?: ReactNode;
}) {
	return (
		<section>
			<h2>{title}</h2>
			<p>{message}</p>
			{children}
		</section>
	);
}
