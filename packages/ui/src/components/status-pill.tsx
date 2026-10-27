export type StatusPillProps = {
	status: "pending" | "running" | "done" | "failed";
	label: string;
};

export function StatusPill({ status, label }: StatusPillProps) {
	return (
		<span
			data-slot="status-pill"
			data-status={status}
			role="status"
			className="status-pill"
		>
			{label}
		</span>
	);
}
