"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Camera, ImageUp, Printer } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useCoarsePointer } from "../use-coarse-pointer.ts";
import { SealNameField } from "./seal-name-field.tsx";
import { UploadButtons, type UploadChoice } from "./upload-buttons.tsx";

const CHOOSE_PHOTO: UploadChoice = {
	label: "Choose a photo",
	icon: <ImageUp />,
};

const PHONE_CHOICES: readonly UploadChoice[] = [
	{ label: "Take photo", icon: <Camera />, camera: true },
	{ ...CHOOSE_PHOTO, variant: "outline" },
];

export type TemplateStepsProps = {
	defaultName: string;
	from: string | null;
};

function Step({
	number,
	title,
	children,
}: {
	number: number;
	title: string;
	children: ReactNode;
}) {
	return (
		<li className="grid grid-cols-[2rem_1fr] gap-x-4 gap-y-2">
			<span
				aria-hidden
				className="grid size-8 place-items-center rounded-full bg-paper font-display text-ui text-ink shadow-[0_0_0_1px_var(--rule)]"
			>
				{number}
			</span>
			<div className="flex min-w-0 flex-col gap-3 pt-1">
				<h2 className="text-ui font-medium text-ink">{title}</h2>
				{children}
			</div>
		</li>
	);
}

export function TemplateSteps({ defaultName, from }: TemplateStepsProps) {
	const [ownerName, setOwnerName] = useState(defaultName);
	const coarse = useCoarsePointer();
	return (
		<ol className="flex flex-col gap-8">
			<Step number={1} title="Print">
				<p className="max-w-prose text-ui text-ink-muted">
					Print this page. All four black squares must be on the paper.
				</p>
				<div>
					<Button
						type="button"
						size="lg"
						variant="outline"
						className="px-4"
						onClick={() => window.print()}
					>
						<Printer />
						Print the page
					</Button>
				</div>
			</Step>
			<Step number={2} title="Write">
				<p className="max-w-prose text-ui text-ink-muted">
					Use a dark pen, black or dark blue. Sit each letter on the dark line.
					Where a letter appears twice (a·2, a·3), write it a little differently
					each time. Leave capitals or numbers blank if you like.
				</p>
			</Step>
			<Step number={3} title="Photograph">
				<p className="max-w-prose text-ui text-ink-muted">
					Lay it flat in daylight, phone straight above, all four squares in
					view.
				</p>
				<SealNameField value={ownerName} onChange={setOwnerName} />
				<UploadButtons
					kind="photo"
					ownerName={ownerName}
					from={from}
					replacing={null}
					choices={coarse ? PHONE_CHOICES : [CHOOSE_PHOTO]}
				/>
			</Step>
		</ol>
	);
}
