"use client";

import { INK_COLORS, type InkColorId } from "@repo/types";
import { Desk } from "@repo/ui/components/desk";
import { FloatingToolbar, Toolbar } from "@repo/ui/components/floating-toolbar";
import { StatusPill } from "@repo/ui/components/status-pill";
import { Swatch } from "@repo/ui/components/swatch";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@repo/ui/components/ui/sheet";
import { Slider } from "@repo/ui/components/ui/slider";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@repo/ui/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Eraser,
	ImageIcon,
	LibraryBig,
	Redo2,
	Trash2,
	Undo2,
} from "lucide-react";
import { type ReactNode, useState } from "react";

type Align = "left" | "center" | "right";
type History = { past: Align[]; present: Align; future: Align[] };
type View = "desk" | "print";

const aligns: { value: Align; label: string; icon: ReactNode }[] = [
	{ value: "left", label: "Align left", icon: <AlignLeft /> },
	{ value: "center", label: "Align centre", icon: <AlignCenter /> },
	{ value: "right", label: "Align right", icon: <AlignRight /> },
];

const tokens = [
	{ id: "ink", label: "Ink", use: "Text and icons on the desk and the page." },
	{
		id: "ink-muted",
		label: "Ink muted",
		use: "Hints, the save line and the seal under the page.",
	},
	{
		id: "ink-accent",
		label: "Ink accent",
		use: "Selection, focus and the primary action. Used sparingly.",
	},
	{
		id: "paper",
		label: "Paper",
		use: "The toolbar and everything that floats above the desk.",
	},
	{ id: "desk", label: "Desk", use: "The surface the letter lies on." },
	{ id: "rule", label: "Rule", use: "Hairlines, dividers and input edges." },
	{
		id: "danger",
		label: "Danger",
		use: "Deleting a letter and a job that failed.",
	},
];

const views = [
	{ value: "desk", label: "On the desk" },
	{ value: "print", label: "As printed" },
];

const doodles = [
	{
		id: "fern",
		name: "Fern from the garden",
		status: "running",
		label: "Lifting the ink",
	},
	{ id: "seal", name: "Wax seal", status: "done", label: "Lifted" },
	{
		id: "stamp",
		name: "Stamp on ruled paper",
		status: "failed",
		label: "Could not lift the ink",
	},
] as const;

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<h2 className="mb-3 text-label tracking-[0.08em] text-ink-muted uppercase">
			{children}
		</h2>
	);
}

export default function StyleguidePage() {
	const [history, setHistory] = useState<History>({
		past: [],
		present: "left",
		future: [],
	});
	const [token, setToken] = useState("ink");
	const [ink, setInk] = useState<InkColorId>("ink-blue");
	const [view, setView] = useState<View>("desk");
	const selectedToken = tokens.find((item) => item.id === token);

	function alignTo(next: Align) {
		if (next === history.present) return;
		setHistory({
			past: [...history.past, history.present],
			present: next,
			future: [],
		});
	}

	function undo() {
		const previous = history.past.at(-1);
		if (!previous) return;
		setHistory({
			past: history.past.slice(0, -1),
			present: previous,
			future: [history.present, ...history.future],
		});
	}

	function redo() {
		const next = history.future[0];
		if (!next) return;
		setHistory({
			past: [...history.past, history.present],
			present: next,
			future: history.future.slice(1),
		});
	}

	return (
		<TooltipProvider delay={400}>
			<Desk className="grid gap-x-20 gap-y-12 px-6 py-10 sm:px-12 xl:grid-cols-[22rem_1fr] xl:px-20 xl:py-14">
				<aside className="grid content-start gap-10 sm:grid-cols-3 xl:grid-cols-1">
					<header className="sm:col-span-3 xl:col-span-1">
						<p className="text-label tracking-[0.08em] text-ink-muted uppercase">
							Ink Studio style guide
						</p>
						<h1 className="mt-3 font-display text-display">Quiet stationery</h1>
						<p className="mt-3 max-w-[40ch] text-ui text-ink-muted">
							A desk, a sheet of paper and one floating bar. Everything else
							stays small, in Outfit, and out of the way of the letter.
						</p>
					</header>

					<section aria-labelledby="colour">
						<SectionLabel>
							<span id="colour">Colour</span>
						</SectionLabel>
						<div
							role="radiogroup"
							aria-labelledby="colour"
							className="-ml-1 grid grid-cols-2 gap-1"
						>
							{tokens.map((item) => (
								<Swatch
									key={item.id}
									color={`var(--${item.id})`}
									label={item.label}
									selected={token === item.id}
									onSelect={() => setToken(item.id)}
								/>
							))}
						</div>
						<p className="mt-3 min-h-10 text-ui text-ink-muted">
							{selectedToken?.use}
						</p>
					</section>

					<section aria-labelledby="ink">
						<SectionLabel>
							<span id="ink">Ink</span>
						</SectionLabel>
						<div
							role="radiogroup"
							aria-labelledby="ink"
							className="-ml-1 grid grid-cols-2 gap-1"
						>
							{Object.entries(INK_COLORS).map(([id, color]) => (
								<Swatch
									key={id}
									color={color.css}
									label={color.label}
									selected={ink === id}
									onSelect={() => setInk(id as InkColorId)}
								/>
							))}
						</div>
						<p
							className="mt-3 text-title"
							style={{ color: INK_COLORS[ink].css }}
						>
							Dear Alex, the fern came back.
						</p>
					</section>

					<section>
						<SectionLabel>Type</SectionLabel>
						<dl className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-4 gap-y-3">
							<dt className="text-label text-ink-muted">Display</dt>
							<dd className="text-ui">The page title and empty states.</dd>
							<dt className="text-label text-ink-muted">Title</dt>
							<dd className="text-title">Untitled letter</dd>
							<dt className="text-label text-ink-muted">Interface</dt>
							<dd className="text-ui">Saved a moment ago</dd>
							<dt className="text-label text-ink-muted">Label</dt>
							<dd className="text-label">Side 1</dd>
						</dl>
					</section>

					<section>
						<SectionLabel>Status</SectionLabel>
						<div className="flex flex-wrap gap-2">
							<StatusPill status="pending" label="Waiting to lift" />
							<StatusPill status="running" label="Lifting the ink" />
							<StatusPill status="done" label="Lifted" />
							<StatusPill status="failed" label="Could not lift the ink" />
						</div>
					</section>
				</aside>

				<main className="flex min-w-0 flex-col items-center">
					<FloatingToolbar
						placement="top"
						aria-label="Formatting"
						className="-mb-5"
					>
						<Toolbar.Group aria-label="History" className="flex">
							<Tooltip>
								<TooltipTrigger
									render={
										<Toolbar.Button
											disabled={history.past.length === 0}
											onClick={undo}
											aria-label="Undo"
											render={
												<Button
													variant="ghost"
													size="icon"
													className="data-disabled:opacity-40"
												/>
											}
										/>
									}
								>
									<Undo2 />
								</TooltipTrigger>
								<TooltipContent side="bottom">Undo</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Toolbar.Button
											disabled={history.future.length === 0}
											onClick={redo}
											aria-label="Redo"
											render={
												<Button
													variant="ghost"
													size="icon"
													className="data-disabled:opacity-40"
												/>
											}
										/>
									}
								>
									<Redo2 />
								</TooltipTrigger>
								<TooltipContent side="bottom">Redo</TooltipContent>
							</Tooltip>
						</Toolbar.Group>
						<Toolbar.Separator />
						<ToggleGroup
							aria-label="Align"
							spacing={0}
							value={[history.present]}
							onValueChange={(next) => {
								const value = next[0];
								if (value) alignTo(value as Align);
							}}
						>
							{aligns.map((item) => (
								<Tooltip key={item.value}>
									<TooltipTrigger
										render={
											<Toolbar.Button
												aria-label={item.label}
												render={<ToggleGroupItem value={item.value} />}
											/>
										}
									>
										{item.icon}
									</TooltipTrigger>
									<TooltipContent side="bottom">{item.label}</TooltipContent>
								</Tooltip>
							))}
						</ToggleGroup>
						<Toolbar.Separator />
						<Sheet>
							<SheetTrigger
								render={
									<Toolbar.Button
										render={<Button variant="ghost" className="px-3" />}
									/>
								}
							>
								<LibraryBig />
								Library
							</SheetTrigger>
							<SheetContent className="gap-0 sm:max-w-sm">
								<SheetHeader className="pr-12">
									<SheetTitle className="text-title font-normal">
										Library
									</SheetTitle>
									<SheetDescription>
										Doodles you draw or lift from a photo. Tap one to place it
										on the letter.
									</SheetDescription>
								</SheetHeader>
								<Tabs defaultValue="photo" className="px-4">
									<TabsList>
										<TabsTrigger value="drawn" className="data-active:bg-paper">
											Drawn
										</TabsTrigger>
										<TabsTrigger value="photo" className="data-active:bg-paper">
											From a photo
										</TabsTrigger>
									</TabsList>
									<TabsContent value="drawn">
										<div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
											<p className="font-display text-display">
												No doodles yet
											</p>
											<p className="text-ui text-ink-muted">
												Draw one and it lands here, ready for any letter.
											</p>
										</div>
									</TabsContent>
									<TabsContent value="photo">
										<ul className="mt-2 divide-y divide-rule">
											{doodles.map((doodle) => (
												<li
													key={doodle.id}
													className="flex items-center gap-3 py-3"
												>
													<span className="grid size-11 flex-none place-items-center rounded-md bg-desk text-ink-muted">
														<ImageIcon className="size-4" />
													</span>
													<span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
														<span className="truncate text-ui">
															{doodle.name}
														</span>
														<StatusPill
															status={doodle.status}
															label={doodle.label}
														/>
													</span>
													{doodle.status === "done" ? (
														<Popover>
															<PopoverTrigger
																render={<Button variant="ghost" size="sm" />}
															>
																<Eraser />
																Erase
															</PopoverTrigger>
															<PopoverContent align="end" className="w-64">
																<PopoverHeader>
																	<PopoverTitle>Eraser</PopoverTitle>
																	<PopoverDescription>
																		Rub out ruled lines and specks the lift left
																		behind.
																	</PopoverDescription>
																</PopoverHeader>
																<Slider
																	defaultValue={[24]}
																	min={8}
																	max={64}
																	aria-label="Eraser size"
																	className="py-2"
																/>
															</PopoverContent>
														</Popover>
													) : null}
												</li>
											))}
										</ul>
									</TabsContent>
								</Tabs>
							</SheetContent>
						</Sheet>
					</FloatingToolbar>

					<article
						aria-label="A blank letter"
						data-view={view}
						className="relative aspect-[8.5/11] w-full max-w-[40rem] rounded-[3px] bg-paper bg-(image:--letter-paper-texture) bg-size-[125px] bg-repeat shadow-sheet transition-[background-color,box-shadow] duration-(--duration-settle) ease-settle data-[view=print]:bg-white data-[view=print]:bg-none data-[view=print]:shadow-[0_0_0_1px_var(--rule)] xl:w-[min(100%,calc((100dvh-11rem)*8.5/11))] xl:max-w-none"
					>
						<div
							className="absolute inset-x-[8.8%] top-[10%]"
							style={{ textAlign: history.present }}
						>
							<p className="font-display text-display">
								Start with a blank sheet
							</p>
							<p className="mt-2 text-ui text-ink-muted">
								Write straight onto the page, the way a letter is written.
							</p>
						</div>
					</article>

					<footer className="mt-5 flex w-full max-w-[40rem] items-center justify-between gap-4 xl:w-[min(100%,calc((100dvh-11rem)*8.5/11))] xl:max-w-none">
						<div className="flex min-w-0 items-baseline gap-3">
							<p className="truncate text-title">Untitled letter</p>
							<p className="text-ui text-ink-muted">Saved</p>
						</div>
						<div className="flex items-center gap-1">
							<Select
								items={views}
								value={view}
								onValueChange={(next) => {
									if (next) setView(next as View);
								}}
							>
								<SelectTrigger
									size="sm"
									aria-label="View"
									className="border-transparent hover:bg-muted"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{views.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Dialog>
								<DialogTrigger render={<Button variant="ghost" size="sm" />}>
									<Trash2 />
									Delete
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle className="text-title font-normal">
											Delete “Untitled letter”?
										</DialogTitle>
										<DialogDescription>
											It leaves your letters. Nothing has been sent.
										</DialogDescription>
									</DialogHeader>
									<DialogFooter>
										<DialogClose render={<Button variant="outline" />}>
											Keep it
										</DialogClose>
										<DialogClose render={<Button variant="destructive" />}>
											Delete letter
										</DialogClose>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</div>
					</footer>
				</main>
			</Desk>
		</TooltipProvider>
	);
}
