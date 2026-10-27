export type StatusPillProps = {
	status: "pending" | "running" | "done" | "failed";
	label: string;
};

export function StatusPill({ status, label }: StatusPillProps) {
	return (
		<span className="status-pill" data-status={status}>
			{label}
		</span>
	);
}
