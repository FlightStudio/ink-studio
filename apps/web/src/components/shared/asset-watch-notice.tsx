import { Button } from "@repo/ui/components/ui/button";
import type { AssetReadIssue } from "@/lib/asset-watch";

const messages: Record<AssetReadIssue, string> = {
	unreachable: "Connection interrupted. Checking progress again…",
	unauthenticated: "Sign in again to check progress.",
	forbidden: "You no longer have access to this item.",
	not_found: "Progress is no longer available for this item.",
};

export function AssetWatchNotice({
	issue,
	onRetry,
}: {
	issue: AssetReadIssue | null;
	onRetry: () => void;
}) {
	if (issue === null) return null;
	return (
		<div
			role="status"
			className="relative flex flex-wrap items-center gap-2 text-ui text-ink-muted"
		>
			<p>{messages[issue]}</p>
			{issue !== "unreachable" ? (
				<Button type="button" variant="outline" size="sm" onClick={onRetry}>
					Check again
				</Button>
			) : null}
		</div>
	);
}
