"use client";

import { createFont } from "@repo/api";
import { Button } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewFontForm() {
	const router = useRouter();
	const [ownerName, setOwnerName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	async function draw() {
		const name = ownerName.trim();
		if (name === "" || saving) return;
		setSaving(true);
		setError(null);
		const created = await createFont({ ownerName: name });
		if (created.status !== 201) {
			setSaving(false);
			setError("That handwriting could not be started.");
			return;
		}
		router.push(`/fonts/${created.data.id}/draw`);
	}

	return (
		<div className="flex max-w-md flex-col gap-6">
			<label className="flex flex-col gap-1 text-ui text-ink">
				What name should the seal use?
				<input
					aria-label="What name should the seal use?"
					value={ownerName}
					onChange={(event) =>
						setOwnerName(event.target.value.replace(/\p{Cc}/gu, ""))
					}
					className="rounded-md bg-desk/50 px-2 py-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</label>
			{error ? (
				<p className="text-ui" style={{ color: "var(--danger)" }}>
					{error}
				</p>
			) : null}
			<Button type="button" onClick={() => void draw()} disabled={saving}>
				Draw it here
			</Button>
			<p>
				<Link href="/fonts/template" className="text-ui text-ink">
					Photograph the template
				</Link>
			</p>
			<p className="text-ui text-ink-muted">Upload a font file</p>
		</div>
	);
}
