"use client";

import { Button } from "@repo/ui/components/ui/button";
import { useState } from "react";
import { TemplatePhotoDialog } from "./template-photo-dialog.tsx";

export function TemplateActions() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<div className="flex gap-3">
				<Button type="button" onClick={() => window.print()}>
					Print
				</Button>
				<Button type="button" onClick={() => setOpen(true)}>
					Photograph it
				</Button>
			</div>
			<TemplatePhotoDialog open={open} onOpenChange={setOpen} />
		</>
	);
}
