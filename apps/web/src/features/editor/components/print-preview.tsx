"use client";

import { LetterPrint } from "@repo/render/html";
import type { LetterContent, LetterResources, PageSpec } from "@repo/types";
import { PAGE_SPECS, SAMPLE_MERGE_VALUES } from "@repo/types";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

const PX_PER_IN = 96;

export type PrintPreviewProps = {
	letterId: string;
	content: LetterContent;
	resources: LetterResources;
	sides: number;
};

function frameBody(frame: HTMLIFrameElement): HTMLElement | null {
	const doc = frame.contentDocument;
	const origin = frame.ownerDocument.defaultView?.location.origin;
	if (!doc || !origin) return null;
	doc.open();
	doc.write(
		`<!doctype html><html><head><meta charset="utf-8"><base href="${origin}/"></head><body style="margin:0;background:#fff;overflow:hidden"></body></html>`,
	);
	doc.close();
	return doc.body;
}

function PreviewSheet({
	spec,
	side,
	scale,
	children,
}: {
	spec: PageSpec;
	side: number;
	scale: number;
	children: ReactNode;
}) {
	const frame = useRef<HTMLIFrameElement>(null);
	const [mount, setMount] = useState<HTMLElement | null>(null);

	useEffect(() => {
		if (frame.current) setMount(frameBody(frame.current));
		return () => setMount(null);
	}, []);

	return (
		<div
			data-preview-sheet=""
			className="shrink-0 overflow-hidden rounded-[2px] bg-white shadow-sheet"
			style={{
				width: `${spec.widthIn * PX_PER_IN * scale}px`,
				height: `${spec.heightIn * PX_PER_IN * scale}px`,
			}}
		>
			<iframe
				ref={frame}
				title={side === 0 ? "Print preview" : `Print preview, side ${side + 1}`}
				tabIndex={-1}
				className="block origin-top-left border-0 bg-white"
				style={{
					width: `${spec.widthIn}in`,
					height: `${spec.heightIn}in`,
					transform: `scale(${scale})`,
				}}
			/>
			{mount
				? createPortal(
						<div
							style={{ transform: `translateY(${-side * spec.heightIn}in)` }}
						>
							{children}
						</div>,
						mount,
					)
				: null}
		</div>
	);
}

function useFitScale(widthIn: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const update = () =>
			setScale(Math.min(1, element.clientWidth / (widthIn * PX_PER_IN)));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, [widthIn]);
	return { ref, scale };
}

function PreviewSheets({
	letterId,
	content,
	resources,
	sides,
}: PrintPreviewProps) {
	const spec = PAGE_SPECS[content.format];
	const fit = useFitScale(spec.widthIn);
	const page = (
		<LetterPrint
			letterId={letterId}
			content={content}
			resources={resources}
			mergeValues={SAMPLE_MERGE_VALUES}
			sheets={sides}
		/>
	);
	return (
		<div ref={fit.ref} className="flex w-full flex-col items-center gap-8">
			{Array.from({ length: sides }, (_, side) => side).map((side) => (
				<PreviewSheet key={side} spec={spec} side={side} scale={fit.scale}>
					{page}
				</PreviewSheet>
			))}
		</div>
	);
}

export function PrintPreview(props: PrintPreviewProps) {
	const [open, setOpen] = useState(false);
	const recipient = `${SAMPLE_MERGE_VALUES.first_name} ${SAMPLE_MERGE_VALUES.last_name}`;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="rounded-full bg-paper"
					/>
				}
			>
				Print preview
			</DialogTrigger>
			<DialogContent
				showCloseButton={false}
				className="top-0 left-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-desk p-0 text-ink ring-0 sm:max-w-none data-closed:zoom-out-100 data-open:zoom-in-100"
			>
				<header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-desk/90 px-4 py-3 backdrop-blur-sm sm:px-6">
					<div className="flex min-w-0 flex-col">
						<DialogTitle className="text-title font-normal">
							Print preview
						</DialogTitle>
						<DialogDescription className="text-ui text-ink-muted">
							As it prints, written to the sample recipient {recipient}.
						</DialogDescription>
					</div>
					<DialogClose
						render={
							<Button
								variant="outline"
								className="rounded-full bg-paper px-3.5"
							/>
						}
					>
						Close
					</DialogClose>
				</header>
				<div className="flex flex-1 justify-center px-4 pt-4 pb-16 sm:px-8">
					<PreviewSheets {...props} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
