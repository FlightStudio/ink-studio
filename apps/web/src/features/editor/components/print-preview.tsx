"use client";

import { LetterPrint } from "@repo/render/html";
import type { LetterContent, LetterResources } from "@repo/types";
import { PAGE_SPECS, SAMPLE_MERGE_VALUES } from "@repo/types";
import { Button } from "@repo/ui/components/ui/button";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type PrintPreviewProps = {
	letterId: string;
	content: LetterContent;
	resources: LetterResources;
};

function frameBody(frame: HTMLIFrameElement): HTMLElement | null {
	const doc = frame.contentDocument;
	const origin = frame.ownerDocument.defaultView?.location.origin;
	if (!doc || !origin) return null;
	doc.open();
	doc.write(
		`<!doctype html><html><head><meta charset="utf-8"><base href="${origin}/"></head><body style="margin:0;background:#fff"></body></html>`,
	);
	doc.close();
	return doc.body;
}

export function PrintPreview({
	letterId,
	content,
	resources,
}: PrintPreviewProps) {
	const [open, setOpen] = useState(false);
	const [mount, setMount] = useState<HTMLElement | null>(null);
	const spec = PAGE_SPECS[content.format];

	useEffect(() => {
		if (!open) return;
		const frame = document.querySelector<HTMLIFrameElement>(
			'iframe[title="Print preview"]',
		);
		if (!frame) return;
		setMount(frameBody(frame));
		return () => setMount(null);
	}, [open]);

	return (
		<>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="rounded-full bg-paper"
				onClick={() => setOpen(true)}
			>
				Print preview
			</Button>
			{open ? (
				<div
					role="dialog"
					aria-label="Print preview"
					className="fixed inset-0 z-50 overflow-auto bg-white"
				>
					<div className="sticky top-0 z-10 flex justify-end bg-white px-4 py-3">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="rounded-full"
							onClick={() => setOpen(false)}
						>
							Close
						</Button>
					</div>
					<div className="flex justify-center pb-12">
						<iframe
							title="Print preview"
							className="block border-0 bg-white"
							style={{
								width: `${spec.widthIn}in`,
								height: `${spec.maxPages * spec.heightIn}in`,
							}}
						/>
					</div>
					{mount
						? createPortal(
								<LetterPrint
									letterId={letterId}
									content={content}
									resources={resources}
									mergeValues={SAMPLE_MERGE_VALUES}
								/>,
								mount,
							)
						: null}
				</div>
			) : null}
		</>
	);
}
