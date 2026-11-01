import { Desk } from "@repo/ui/components/desk";
import type { ReactNode } from "react";

export type DeskMessageProps = {
	title: string;
	children: ReactNode;
	actions?: ReactNode;
};

export function DeskMessage({ title, children, actions }: DeskMessageProps) {
	return (
		<Desk className="grid place-items-center px-6 py-16">
			<main className="flex w-full max-w-md flex-col items-center gap-3 text-center animate-settle">
				<h1 className="font-display text-display">{title}</h1>
				<div className="text-ui text-ink-muted">{children}</div>
				{actions ? (
					<div className="mt-4 flex items-center gap-2">{actions}</div>
				) : null}
			</main>
		</Desk>
	);
}
