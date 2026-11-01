"use client";

import { createFont } from "@repo/api";
import { FileType, PenLine, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { createMessage } from "../font-errors.ts";
import { drawPage, templatePage } from "../font-links.ts";
import { cleanOwnerName, NEEDED_COUNT } from "../font-status.ts";
import { FontUploadDialog } from "./font-upload-dialog.tsx";
import { SealNameField } from "./seal-name-field.tsx";

type Method = "draw" | "paper" | "file";

const METHODS: readonly {
	id: Method;
	title: string;
	badge?: string;
	description: string;
	icon: ReactNode;
}[] = [
	{
		id: "draw",
		title: "Write it here",
		badge: "Recommended",
		description: `Write ${NEEDED_COUNT} letters with your Pencil, finger or mouse. About 5 minutes.`,
		icon: <PenLine />,
	},
	{
		id: "paper",
		title: "Write on paper",
		description:
			"Print one page, write with your own pen, take a photo. Keeps your real ink. About 15 minutes, needs a printer.",
		icon: <Printer />,
	},
	{
		id: "file",
		title: "Use a font file",
		description:
			"A .ttf or .otf made from your handwriting, with at least a to z.",
		icon: <FileType />,
	},
];

export type NewFontFormProps = {
	defaultName: string;
	from: string | null;
};

export function NewFontForm({ defaultName, from }: NewFontFormProps) {
	const router = useRouter();
	const ids = useId();
	const [ownerName, setOwnerName] = useState(defaultName);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState<Method | null>(null);
	const [uploadOpen, setUploadOpen] = useState(false);
	const name = cleanOwnerName(ownerName);

	async function draw() {
		setPending("draw");
		setError(null);
		const created = await createFont({ ownerName: name }).catch(() => null);
		if (created?.status !== 201) {
			setPending(null);
			setError(createMessage(created?.data.code));
			return;
		}
		router.push(drawPage(created.data.id, from));
	}

	function choose(method: Method) {
		if (name === "" || pending) return;
		if (method === "draw") void draw();
		if (method === "paper") {
			setPending("paper");
			router.push(templatePage(from, name));
		}
		if (method === "file") setUploadOpen(true);
	}

	return (
		<div className="flex flex-col gap-10">
			<SealNameField
				value={ownerName}
				onChange={(value) => {
					setOwnerName(value);
					setError(null);
				}}
				error={error}
			/>
			<fieldset className="flex flex-col gap-4">
				<legend className="mb-4 text-ui font-medium text-ink">
					How would you like to write it?
				</legend>
				<ul className="grid gap-4 md:grid-cols-3">
					{METHODS.map((method) => (
						<li key={method.id} className="flex">
							<button
								type="button"
								data-method={method.id}
								aria-labelledby={`${ids}-${method.id}`}
								aria-describedby={`${ids}-${method.id}-badge ${ids}-${method.id}-text`}
								disabled={name === "" || pending !== null}
								aria-busy={pending === method.id || undefined}
								onClick={() => choose(method.id)}
								className="group flex w-full flex-col items-start gap-3 rounded-[3px] bg-paper px-5 py-6 text-left shadow-sheet transition-[translate,box-shadow,opacity] duration-(--duration-settle) ease-settle outline-offset-4 enabled:hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55 aria-busy:opacity-100"
							>
								<span className="flex w-full items-center justify-between gap-3">
									<span className="text-ink-accent [&_svg]:size-5">
										{method.icon}
									</span>
									{method.badge ? (
										<span
											id={`${ids}-${method.id}-badge`}
											className="rounded-full bg-ink-accent/10 px-2 py-0.5 text-label text-ink-accent"
										>
											{method.badge}
										</span>
									) : null}
								</span>
								<span
									id={`${ids}-${method.id}`}
									className="font-display text-title"
								>
									{method.title}
								</span>
								<span
									id={`${ids}-${method.id}-text`}
									className="text-ui text-ink-muted"
								>
									{method.description}
								</span>
							</button>
						</li>
					))}
				</ul>
			</fieldset>
			<p className="text-ui text-ink-muted">
				You can make more than one and compare them later.
			</p>
			<FontUploadDialog
				open={uploadOpen}
				onOpenChange={setUploadOpen}
				ownerName={name}
				from={from}
				replacing={null}
			/>
		</div>
	);
}
