"use client";

import { createLetter, deleteFont, requestFontBuild } from "@repo/api";
import type { EditableFont } from "@repo/types";
import { isUsableFont, missingLowercase } from "@repo/types";
import { ConfirmDialog } from "@repo/ui/components/confirm-dialog";
import { StatusPill } from "@repo/ui/components/status-pill";
import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Camera, ChevronLeft, FileUp, PenLine, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { useAssetWatch } from "@/lib/use-asset-watch";
import {
	buildMessage,
	type FontAction,
	failureOf,
	incompleteActionOf,
	LETTER_FAILED,
} from "../font-errors.ts";
import { drawPage, letterWithFont } from "../font-links.ts";
import {
	BUILDING_LABELS,
	blankSentence,
	DELETE_NOTE,
	fillsIn,
	fillsInPhrase,
	fontAnnouncement,
	fontHeading,
	METHOD_LABELS,
	NEEDED_COUNT,
	sealLine,
} from "../font-status.ts";
import { FontPreview } from "./font-preview.tsx";
import { FontUploadDialog } from "./font-upload-dialog.tsx";
import { UploadButtons } from "./upload-buttons.tsx";

export const READY_SPECIMEN =
	"You're all set! Now go and write something to your community :) ";

export const BUILDING_NOTE =
	"Usually under a minute. You can leave this page; it carries on.";

export const SLOW_NOTE = "Taking longer than usual.";

export type FontHomeProps = {
	font: EditableFont;
	from: string | null;
	drawn: number;
};

export function FontHome({ font, from, drawn }: FontHomeProps) {
	const follow = useRef(false);
	return (
		<>
			<p role="status" className="sr-only">
				{fontAnnouncement(font)}
			</p>
			<FontView
				key={`${font.status}:${font.pendingAssetId}:${font.assetId}`}
				font={font}
				from={from}
				drawn={drawn}
				follow={follow}
			/>
		</>
	);
}

function FontView({
	font,
	from,
	drawn,
	follow,
}: FontHomeProps & { follow: RefObject<boolean> }) {
	const router = useRouter();
	const heading = useRef<HTMLHeadingElement>(null);
	const [starting, setStarting] = useState(false);
	const [buildError, setBuildError] = useState<string | null>(null);
	const [fileOpen, setFileOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const [letterError, setLetterError] = useState<string | null>(null);
	const name = `${font.ownerName}'s handwriting`;
	const watch = useAssetWatch(
		font.status === "building" ? font.pendingAssetId : null,
		(state) => {
			if (state.unreachable) return;
			router.refresh();
		},
	);

	useEffect(() => {
		if (!follow.current) return;
		follow.current = font.status === "building";
		const focused = document.activeElement;
		if (focused === null || focused === document.body) {
			heading.current?.focus();
		}
	}, [follow, font.status]);

	async function startBuild() {
		setStarting(true);
		setBuildError(null);
		const requested = await requestFontBuild(font.id).catch(() => null);
		if (requested?.status !== 201) {
			setStarting(false);
			setBuildError(buildMessage(requested?.data.code));
			return;
		}
		follow.current = true;
		router.refresh();
	}

	async function remove() {
		setDeleting(true);
		setDeleteError(null);
		const deleted = await deleteFont(font.id).catch(() => null);
		if (deleted?.status === 204 || deleted?.status === 404) {
			router.replace("/fonts");
			router.refresh();
			return;
		}
		setDeleting(false);
		setDeleteError("That handwriting could not be deleted, so try again.");
	}

	async function writeLetter() {
		setOpening(true);
		setLetterError(null);
		const created = await createLetter({ fontId: font.id }).catch(() => null);
		if (created?.status !== 201) {
			setOpening(false);
			setLetterError(LETTER_FAILED);
			return;
		}
		router.push(`/letters/${created.data.id}`);
	}

	function action(kind: FontAction, missing: readonly string[]): ReactNode {
		if (kind === "photograph") {
			return (
				<UploadButtons
					kind="photo"
					ownerName={font.ownerName}
					from={from}
					replacing={font.id}
					choices={[{ label: "Photograph again", icon: <Camera /> }]}
				/>
			);
		}
		if (kind === "choose-file") {
			return (
				<div>
					<Button
						type="button"
						size="lg"
						className="px-4"
						onClick={() => setFileOpen(true)}
					>
						<FileUp />
						Choose another file
					</Button>
				</div>
			);
		}
		if (kind === "draw") {
			return (
				<div>
					<Link
						href={drawPage(font.id, from, missing[0])}
						className={buttonVariants({ size: "lg", className: "px-4" })}
					>
						<PenLine />
						Draw them
					</Link>
				</div>
			);
		}
		return (
			<div>
				<Button
					type="button"
					size="lg"
					className="px-4"
					disabled={starting}
					onClick={() => void startBuild()}
				>
					<RotateCw />
					{starting ? "Starting…" : "Try again"}
				</Button>
			</div>
		);
	}

	function body(): ReactNode {
		if (font.status === "drawing") {
			return (
				<>
					<p className="text-ui text-ink-muted">
						{drawn} of {NEEDED_COUNT} letters drawn. Everything you drew is
						saved.
						{drawn === NEEDED_COUNT ? " Build it to write with it." : null}
					</p>
					<div className="flex flex-wrap items-center gap-2">
						{drawn === NEEDED_COUNT ? (
							<Button
								type="button"
								size="lg"
								className="px-4"
								disabled={starting}
								onClick={() => void startBuild()}
							>
								{starting ? "Starting…" : "Build my font"}
							</Button>
						) : null}
						<Link
							href={drawPage(font.id, from)}
							className={buttonVariants({
								variant: drawn === NEEDED_COUNT ? "outline" : "default",
								size: "lg",
								className: "px-4",
							})}
						>
							<PenLine />
							Keep drawing
						</Link>
					</div>
				</>
			);
		}
		if (font.status === "building") {
			return (
				<>
					<div aria-hidden>
						<StatusPill
							status={watch?.status === "running" ? "running" : "pending"}
							label={BUILDING_LABELS[font.source]}
						/>
					</div>
					<p className="text-ui text-ink-muted">{BUILDING_NOTE}</p>
					{watch?.slow ? (
						<div className="flex flex-col gap-3 motion-safe:animate-settle">
							<p className="text-ui text-ink">
								{SLOW_NOTE} You can start it again.
							</p>
							{action("retry", [])}
						</div>
					) : null}
				</>
			);
		}
		if (font.status === "failed") {
			const failure = failureOf(font.source, font.error);
			return (
				<>
					<p className="text-ui text-ink">{failure.message}</p>
					{isUsableFont(font) ? (
						<p className="text-ui text-ink-muted">
							Your letters keep using the last version until this works.
						</p>
					) : null}
					{action(failure.action, missingLowercase(font.chars))}
				</>
			);
		}
		if (font.status === "incomplete") {
			const missing = missingLowercase(font.chars);
			return (
				<>
					<p className="text-ui text-ink">
						{blankSentence(missing)} Your font needs them before you can write
						with it.
					</p>
					{action(incompleteActionOf(font.source), missing)}
				</>
			);
		}
		const fills = fillsIn(font.chars);
		const backHref = from ? letterWithFont(from, font.id) : null;
		return (
			<>
				<figure className="flex flex-col gap-6 rounded-[3px] bg-paper px-6 py-8 shadow-sheet motion-safe:animate-settle sm:px-10 sm:py-10">
					{font.assetId ? (
						<FontPreview
							fontId={font.id}
							assetId={font.assetId}
							text={READY_SPECIMEN}
							className="text-[2rem] leading-[1.3] text-ink sm:text-[2.5rem]"
						/>
					) : null}
					<figcaption className="border-t border-rule pt-4 text-ui text-ink-muted">
						{sealLine(font.ownerName)}
					</figcaption>
				</figure>
				{fills.length > 0 ? (
					<p className="text-ui text-ink-muted">
						Caveat fills in: {fillsInPhrase(fills)}
						{font.source === "drawn" ? (
							<>
								{" · "}
								<Link
									href={drawPage(font.id, from, fills[0])}
									className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
								>
									Draw them
								</Link>
							</>
						) : null}
					</p>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					{backHref ? (
						<Link
							href={backHref}
							className={buttonVariants({ size: "lg", className: "px-4" })}
						>
							Back to your letter
						</Link>
					) : (
						<Button
							type="button"
							size="lg"
							className="px-4"
							disabled={opening}
							onClick={() => void writeLetter()}
						>
							{opening ? "Opening…" : "Write a letter in it"}
						</Button>
					)}
				</div>
				{letterError ? (
					<p role="alert" className="text-ui text-danger">
						{letterError}
					</p>
				) : null}
			</>
		);
	}

	return (
		<main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
			<header className="flex flex-col gap-3">
				<Link
					href="/fonts"
					className="-ml-1 inline-flex w-fit items-center gap-1 rounded-full py-1 pr-2 text-ui text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
				>
					<ChevronLeft className="size-4" />
					All handwriting
				</Link>
				<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
					{METHOD_LABELS[font.source]}
				</p>
				<h1
					ref={heading}
					tabIndex={-1}
					className="font-display text-display outline-none"
				>
					{fontHeading(font)}
				</h1>
			</header>
			<section aria-label="Status" className="flex flex-col gap-5">
				{body()}
				{buildError ? (
					<p role="alert" className="text-ui text-danger">
						{buildError}
					</p>
				) : null}
			</section>
			<footer className="flex flex-wrap items-center gap-2 border-t border-rule pt-6">
				{from && font.status !== "ready" ? (
					<Link
						href={`/letters/${from}`}
						className={buttonVariants({ variant: "outline", size: "lg" })}
					>
						Back to your letter
					</Link>
				) : null}
				{font.source === "drawn" && font.status === "ready" ? (
					<Link
						href={drawPage(font.id, from)}
						className={buttonVariants({ variant: "outline", size: "lg" })}
					>
						Draw more letters
					</Link>
				) : null}
				<Button
					type="button"
					variant="ghost"
					size="lg"
					className="ml-auto text-ink-muted hover:text-danger"
					onClick={() => setConfirming(true)}
				>
					Delete
				</Button>
			</footer>
			<FontUploadDialog
				open={fileOpen}
				onOpenChange={setFileOpen}
				ownerName={font.ownerName}
				from={from}
				replacing={font.id}
			/>
			<ConfirmDialog
				open={confirming}
				onOpenChange={(open) => {
					setConfirming(open);
					if (!open) setDeleteError(null);
				}}
				title={`Delete ${name}?`}
				description={DELETE_NOTE}
				confirmLabel="Delete"
				pendingLabel="Deleting…"
				pending={deleting}
				error={deleteError}
				onConfirm={() => void remove()}
			/>
		</main>
	);
}
