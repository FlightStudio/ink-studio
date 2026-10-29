"use client";

import { deleteDrawing, renameDrawing } from "@repo/api";
import type { InkColorId, LibraryDrawing } from "@repo/types";
import { INK_COLORS, SIGNATURE_WIDTHS } from "@repo/types";
import { ConfirmDialog } from "@repo/ui/components/confirm-dialog";
import { Swatch } from "@repo/ui/components/swatch";
import { Button } from "@repo/ui/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@repo/ui/components/ui/sheet";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import { Camera, Ellipsis, Pencil, PenLine, Trash2 } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { nextDrawingName } from "../drawing-name.ts";
import { DrawDoodleDialog } from "./draw-doodle-dialog.tsx";
import { PhotoDoodleDialog } from "./photo-doodle-dialog.tsx";

const NARROW = "(max-width: 899px)";
const NAME_LIMIT = 60;

function subscribeNarrow(onChange: () => void): () => void {
	const query = window.matchMedia(NARROW);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function useNarrow(): boolean {
	return useSyncExternalStore(
		subscribeNarrow,
		() => window.matchMedia(NARROW).matches,
		() => false,
	);
}

export type LibraryTab = "doodle" | "signature";

type SignatureWidth = (typeof SIGNATURE_WIDTHS)[number];

export type LibrarySheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	doodles: LibraryDrawing[];
	signatures: LibraryDrawing[];
	tab: LibraryTab;
	onTab: (tab: LibraryTab) => void;
	onPlace: (drawing: LibraryDrawing) => void;
	onSign: (
		drawing: LibraryDrawing,
		choice: {
			widthIn: SignatureWidth;
			color: InkColorId;
		},
	) => void;
	inkColor?: InkColorId;
};

export function LibrarySheet({
	open,
	onOpenChange,
	doodles: initialDoodles,
	signatures: initialSignatures,
	tab,
	onTab,
	onPlace,
	onSign,
	inkColor = "ink-blue",
}: LibrarySheetProps) {
	const narrow = useNarrow();
	const [doodles, setDoodles] = useState(initialDoodles);
	const [signatures, setSignatures] = useState(initialSignatures);
	const [drawOpen, setDrawOpen] = useState(false);
	const [photoOpen, setPhotoOpen] = useState(false);
	const [removing, setRemoving] = useState<LibraryDrawing | null>(null);
	const [removeOpen, setRemoveOpen] = useState(false);
	const [removePending, setRemovePending] = useState(false);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [widthIn, setWidthIn] = useState<SignatureWidth>(2.25);
	const [color, setColor] = useState<InkColorId>(inkColor);
	const drawButton = useRef<HTMLButtonElement>(null);
	const tiles = useRef(new Map<string, HTMLButtonElement>());
	const focusAfterRemove = useRef<HTMLElement | null>(null);
	const signature = tab === "signature";
	const kind = signature ? "signature" : "doodle";
	const defaultName = nextDrawingName(
		kind,
		(signature ? signatures : doodles).map((drawing) => drawing.name),
	);

	function replace(
		drawingKind: LibraryDrawing["kind"],
		update: (current: LibraryDrawing[]) => LibraryDrawing[],
	) {
		if (drawingKind === "signature") setSignatures(update);
		else setDoodles(update);
	}

	function use(drawing: LibraryDrawing) {
		if (drawing.kind === "signature") onSign(drawing, { widthIn, color });
		else onPlace(drawing);
	}

	function saved(drawing: LibraryDrawing) {
		replace(drawing.kind, (current) => [drawing, ...current]);
		use(drawing);
	}

	async function rename(drawing: LibraryDrawing, draft: string) {
		const name = draft.trim();
		if (name === "" || name === drawing.name) return;
		const response = await renameDrawing(drawing.id, { name });
		if (response.status === 204) {
			replace(drawing.kind, (current) =>
				current.map((item) =>
					item.id === drawing.id ? { ...item, name } : item,
				),
			);
		}
	}

	function askRemove(drawing: LibraryDrawing) {
		focusAfterRemove.current = null;
		setRemoving(drawing);
		setRemoveError(null);
		setRemoveOpen(true);
	}

	async function remove(drawing: LibraryDrawing) {
		setRemovePending(true);
		setRemoveError(null);
		const response = await deleteDrawing(drawing.id).catch(() => null);
		setRemovePending(false);
		if (response?.status === 204 || response?.status === 404) {
			const shown = drawing.kind === "signature" ? signatures : doodles;
			const index = shown.findIndex((item) => item.id === drawing.id);
			const neighbour = shown[index + 1] ?? shown[index - 1];
			focusAfterRemove.current =
				(neighbour && tiles.current.get(neighbour.id)) ?? drawButton.current;
			replace(drawing.kind, (current) =>
				current.filter((item) => item.id !== drawing.id),
			);
			setRemoveOpen(false);
			return;
		}
		setRemoveError(
			drawing.kind === "signature"
				? "That signature could not be deleted. Try again."
				: "That doodle could not be deleted. Try again.",
		);
	}

	function list(drawings: LibraryDrawing[], listKind: LibraryTab) {
		if (drawings.length === 0) {
			return (
				<p className="py-10 text-center text-ui text-ink-muted">
					{listKind === "signature"
						? "No signatures yet. Draw one, or photograph one on paper."
						: "Nothing saved yet. Draw one, or photograph one on paper."}
				</p>
			);
		}
		const tint = INK_COLORS[listKind === "signature" ? color : inkColor].css;
		return (
			<ul className="grid grid-cols-2 gap-x-3 gap-y-4">
				{drawings.map((drawing) => (
					<DrawingTile
						key={drawing.id}
						drawing={drawing}
						tint={tint}
						tileRef={(node) => {
							if (node) tiles.current.set(drawing.id, node);
							else tiles.current.delete(drawing.id);
						}}
						onUse={use}
						onRename={rename}
						onDelete={askRemove}
					/>
				))}
			</ul>
		);
	}

	return (
		<>
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent
					side={narrow ? "bottom" : "right"}
					className="gap-0 bg-paper text-ink data-[side=bottom]:max-h-[85dvh] data-[side=right]:w-full data-[side=right]:sm:max-w-sm"
				>
					<SheetHeader className="pr-12">
						<SheetTitle className="text-title font-normal">Library</SheetTitle>
						<SheetDescription className="[@media(max-height:500px)]:sr-only">
							{signature
								? "Signatures belong to you. Pick a size and an ink, then tap one to sign."
								: "Doodles saved for this studio. Tap one to put it on the page."}
						</SheetDescription>
					</SheetHeader>
					<Tabs
						value={tab}
						onValueChange={(next: LibraryTab) => onTab(next)}
						className="min-h-0 flex-1 gap-0"
					>
						<div className="flex flex-col gap-3 border-b border-rule px-4 pb-4">
							<TabsList className="w-full pointer-coarse:h-11">
								<TabsTrigger value="doodle" className="data-active:bg-paper">
									Doodles
								</TabsTrigger>
								<TabsTrigger value="signature" className="data-active:bg-paper">
									Signatures
								</TabsTrigger>
							</TabsList>
							<div className="grid grid-cols-2 gap-2">
								<Button
									ref={drawButton}
									type="button"
									variant="outline"
									onClick={() => setDrawOpen(true)}
								>
									<PenLine />
									Draw
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() => setPhotoOpen(true)}
								>
									<Camera />
									Photograph
								</Button>
							</div>
							{signature && signatures.length > 0 ? (
								<div className="flex flex-col gap-3">
									<fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
										<legend className="mb-1.5 p-0 text-label text-ink-muted">
											Size
										</legend>
										<div className="flex gap-2">
											{SIGNATURE_WIDTHS.map((width) => (
												<Button
													key={width}
													type="button"
													size="sm"
													variant={widthIn === width ? "default" : "outline"}
													aria-pressed={widthIn === width}
													onClick={() => setWidthIn(width)}
												>
													{width} in
												</Button>
											))}
										</div>
									</fieldset>
									<fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
										<legend className="mb-1.5 p-0 text-label text-ink-muted">
											Ink
										</legend>
										<div className="-ml-1 flex flex-wrap gap-1">
											{Object.entries(INK_COLORS).map(([id, ink]) => (
												<Swatch
													key={id}
													color={ink.css}
													label={ink.label}
													selected={color === id}
													labelHidden
													onSelect={() => setColor(id as InkColorId)}
												/>
											))}
										</div>
									</fieldset>
								</div>
							) : null}
						</div>
						<TabsContent
							value="doodle"
							className="min-h-0 overflow-y-auto overscroll-contain p-4"
						>
							{list(doodles, "doodle")}
						</TabsContent>
						<TabsContent
							value="signature"
							className="min-h-0 overflow-y-auto overscroll-contain p-4"
						>
							{list(signatures, "signature")}
						</TabsContent>
					</Tabs>
					<ConfirmDialog
						open={removeOpen}
						onOpenChange={setRemoveOpen}
						title={removing ? `Delete “${removing.name}”?` : ""}
						description={
							removing?.kind === "signature"
								? "It leaves your signatures. Letters you signed with it keep it."
								: "It leaves the library. Letters that use it keep it."
						}
						confirmLabel={
							removing?.kind === "signature"
								? "Delete signature"
								: "Delete doodle"
						}
						pendingLabel="Deleting…"
						pending={removePending}
						error={removeError}
						finalFocus={() => focusAfterRemove.current ?? true}
						onConfirm={() => {
							if (removing) void remove(removing);
						}}
					/>
				</SheetContent>
			</Sheet>
			<DrawDoodleDialog
				open={drawOpen}
				onOpenChange={setDrawOpen}
				kind={kind}
				defaultName={defaultName}
				onSaved={saved}
			/>
			<PhotoDoodleDialog
				open={photoOpen}
				onOpenChange={setPhotoOpen}
				kind={kind}
				defaultName={defaultName}
				onSaved={saved}
			/>
		</>
	);
}

function DrawingTile({
	drawing,
	tint,
	tileRef,
	onUse,
	onRename,
	onDelete,
}: {
	drawing: LibraryDrawing;
	tint: string;
	tileRef: (node: HTMLButtonElement | null) => void;
	onUse: (drawing: LibraryDrawing) => void;
	onRename: (drawing: LibraryDrawing, name: string) => Promise<void>;
	onDelete: (drawing: LibraryDrawing) => void;
}) {
	const nameInput = useRef<HTMLInputElement>(null);
	const options = useRef<HTMLButtonElement>(null);
	const renaming = useRef(false);
	const deleting = useRef(false);
	const [draft, setDraft] = useState<string | null>(null);
	const mask = `url(/api/assets/${drawing.maskAssetId})`;

	function startRename() {
		renaming.current = true;
		setDraft(drawing.name);
	}

	function endRename(name: string | null, refocus: boolean) {
		if (!renaming.current) return;
		renaming.current = false;
		setDraft(null);
		if (name !== null) void onRename(drawing, name);
		if (refocus) options.current?.focus();
	}

	return (
		<li className="flex min-w-0 flex-col gap-1">
			<button
				ref={tileRef}
				type="button"
				aria-label={drawing.name}
				className="grid aspect-[4/3] place-items-center rounded-lg bg-paper p-3 shadow-sheet ring-1 ring-rule transition-[box-shadow,translate] duration-(--duration-quick) ease-settle outline-none hover:-translate-y-0.5 hover:ring-ink-muted/50 focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0"
				onClick={() => onUse(drawing)}
			>
				<span
					aria-hidden
					className="size-full"
					style={{
						backgroundColor: tint,
						maskImage: mask,
						maskSize: "contain",
						maskRepeat: "no-repeat",
						maskPosition: "center",
						WebkitMaskImage: mask,
						WebkitMaskSize: "contain",
						WebkitMaskRepeat: "no-repeat",
						WebkitMaskPosition: "center",
					}}
				/>
			</button>
			<div className="flex min-w-0 items-center gap-1">
				{draft === null ? (
					<span className="min-w-0 flex-1 truncate pl-0.5 text-ui">
						{drawing.name}
					</span>
				) : (
					<form
						className="min-w-0 flex-1"
						onSubmit={(event) => {
							event.preventDefault();
							endRename(draft, true);
						}}
					>
						<input
							ref={nameInput}
							aria-label={`Rename ${drawing.name}`}
							value={draft}
							maxLength={NAME_LIMIT}
							onChange={(event) =>
								setDraft(event.target.value.replace(/\p{Cc}/gu, ""))
							}
							onFocus={(event) => event.currentTarget.select()}
							onBlur={() => endRename(draft, false)}
							onKeyDown={(event) => {
								if (event.key !== "Escape") return;
								event.preventDefault();
								event.stopPropagation();
								endRename(null, true);
							}}
							className="w-full rounded-md bg-desk/60 px-2 py-1 text-ui text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</form>
				)}
				<DropdownMenu
					onOpenChange={(open) => {
						if (open) deleting.current = false;
					}}
				>
					<DropdownMenuTrigger
						render={
							<Button
								ref={options}
								variant="ghost"
								size="icon-sm"
								aria-label={`Options for ${drawing.name}`}
								className="rounded-full text-ink-muted hover:text-ink"
							/>
						}
					>
						<Ellipsis />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="min-w-36"
						finalFocus={() =>
							deleting.current ? false : (nameInput.current ?? true)
						}
					>
						<DropdownMenuItem onClick={startRename}>
							<Pencil />
							Rename
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => {
								deleting.current = true;
								onDelete(drawing);
							}}
						>
							<Trash2 />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</li>
	);
}
