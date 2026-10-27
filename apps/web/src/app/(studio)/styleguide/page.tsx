"use client";

import {
	Desk,
	Dialog,
	DialogPopup,
	DialogTrigger,
	FloatingToolbar,
	Popover,
	PopoverPopup,
	PopoverTrigger,
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	Sheet,
	SheetPopup,
	SheetTrigger,
	Slider,
	StatusPill,
	Swatch,
	Tabs,
	TabsList,
	TabsPanel,
	TabsTab,
	Toggle,
	ToggleGroup,
	Toolbar,
	Tooltip,
	TooltipProvider,
} from "@repo/ui";
import { useState } from "react";

const inks = [
	{ id: "midnight", label: "Midnight", color: "#1c2541" },
	{ id: "ink-blue", label: "Ink blue", color: "#23408e" },
	{ id: "sepia", label: "Sepia", color: "#5b3a29" },
	{ id: "forest", label: "Forest", color: "#2f4a3a" },
	{ id: "oxblood", label: "Oxblood", color: "#6b1f2a" },
];

export default function StyleguidePage() {
	const [ink, setInk] = useState(inks[1]?.id ?? "ink-blue");
	return (
		<Desk>
			<main className="mx-auto flex w-[min(880px,calc(100%-32px))] flex-col gap-8 py-16">
				<header>
					<p className="text-label tracking-[0.08em] text-[var(--ink-muted)] uppercase">
						Style guide
					</p>
					<h1 className="font-display text-display">Ink Studio</h1>
					<p className="mt-2 max-w-prose text-ui text-[var(--ink-muted)]">
						Quiet stationery for the letter. Display type is for titles and
						empty states.
					</p>
				</header>
				<TooltipProvider>
					<FloatingToolbar placement="top" aria-label="Formatting">
						<ToggleGroup aria-label="Style" defaultValue={["bold"]}>
							<Toolbar.Button
								render={<Toggle value="bold" aria-label="Bold" />}
							>
								B
							</Toolbar.Button>
							<Toolbar.Button
								render={<Toggle value="italic" aria-label="Italic" />}
							>
								I
							</Toolbar.Button>
						</ToggleGroup>
						<Tooltip label="A short note">
							<Toolbar.Button aria-label="Note">Note</Toolbar.Button>
						</Tooltip>
					</FloatingToolbar>
				</TooltipProvider>
				<section className="flex flex-col gap-3">
					<h2 className="font-display text-title">Ink</h2>
					<div className="flex gap-3" role="radiogroup" aria-label="Ink">
						{inks.map((item) => (
							<Swatch
								key={item.id}
								color={item.color}
								label={item.label}
								selected={ink === item.id}
								onSelect={() => setInk(item.id)}
							/>
						))}
					</div>
				</section>
				<section className="flex flex-wrap gap-2">
					<StatusPill status="pending" label="Pending" />
					<StatusPill status="running" label="Running" />
					<StatusPill status="done" label="Done" />
					<StatusPill status="failed" label="Failed" />
				</section>
				<section className="flex flex-wrap items-center gap-3">
					<Popover>
						<PopoverTrigger className="rounded-full border border-border bg-[var(--paper)] px-3 py-2">
							Popover
						</PopoverTrigger>
						<PopoverPopup>A note that sits above the desk.</PopoverPopup>
					</Popover>
					<Dialog>
						<DialogTrigger className="rounded-full border border-border bg-[var(--paper)] px-3 py-2">
							Dialog
						</DialogTrigger>
						<DialogPopup title="A quiet dialog">
							The letter stays on the desk behind this.
						</DialogPopup>
					</Dialog>
					<Sheet>
						<SheetTrigger className="rounded-full border border-border bg-[var(--paper)] px-3 py-2">
							Sheet
						</SheetTrigger>
						<SheetPopup title="Sheet">
							Details slide in from the side.
						</SheetPopup>
					</Sheet>
					<Select defaultValue="letter">
						<SelectTrigger aria-label="Product" />
						<SelectPopup>
							<SelectItem value="letter">Letter</SelectItem>
							<SelectItem value="postcard">Postcard</SelectItem>
						</SelectPopup>
					</Select>
					<Slider defaultValue={24} min={16} max={30} aria-label="Size" />
				</section>
				<Tabs defaultValue="type">
					<TabsList>
						<TabsTab value="type">Type</TabsTab>
						<TabsTab value="paper">Paper</TabsTab>
					</TabsList>
					<TabsPanel value="type">
						<p className="font-display text-display">Display</p>
						<p className="text-title">Title</p>
						<p className="text-ui">Interface text stays in Outfit.</p>
						<p className="text-label tracking-[0.06em] uppercase">Label</p>
					</TabsPanel>
					<TabsPanel value="paper">
						<div className="paper-sample" />
					</TabsPanel>
				</Tabs>
			</main>
		</Desk>
	);
}
