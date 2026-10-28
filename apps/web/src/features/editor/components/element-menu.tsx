"use client";

import type { InkColorId } from "@repo/types";
import { INK_COLORS } from "@repo/types";
import { Swatch } from "@repo/ui/components/swatch";
import { Button } from "@repo/ui/components/ui/button";
import type { CSSProperties } from "react";

export function ElementMenu({
	tint,
	onTint,
	onRemove,
	style,
}: {
	tint: InkColorId;
	onTint: (tint: InkColorId) => void;
	onRemove: () => void;
	style?: CSSProperties;
}) {
	return (
		<fieldset
			aria-label="Doodle"
			data-element-menu=""
			className="absolute z-10 m-0 flex items-center gap-1 rounded-full border-0 bg-paper px-1.5 py-1 shadow-float ring-1 ring-[oklch(0.3_0.03_60/0.06)]"
			style={style}
			onMouseDown={(event) => event.stopPropagation()}
			onPointerDown={(event) => event.stopPropagation()}
		>
			{Object.entries(INK_COLORS).map(([id, color]) => (
				<Swatch
					key={id}
					color={color.css}
					label={color.label}
					selected={tint === id}
					labelHidden
					onSelect={() => onTint(id as InkColorId)}
				/>
			))}
			<Button type="button" variant="ghost" size="sm" onClick={onRemove}>
				Remove
			</Button>
		</fieldset>
	);
}
