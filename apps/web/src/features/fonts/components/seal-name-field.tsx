"use client";

import { OWNER_NAME_MAX_CHARACTERS } from "@repo/types";
import { useId } from "react";
import { cleanOwnerName, sealLine } from "../font-status.ts";

export const ADD_A_NAME = "Add a name first";

export type SealNameFieldProps = {
	value: string;
	onChange(value: string): void;
	error?: string | null;
};

export function SealNameField({ value, onChange, error }: SealNameFieldProps) {
	const id = useId();
	const name = cleanOwnerName(value);
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={id} className="text-ui font-medium text-ink">
				Your name on the seal
			</label>
			<input
				id={id}
				value={value}
				maxLength={OWNER_NAME_MAX_CHARACTERS}
				autoComplete="given-name"
				spellCheck={false}
				aria-invalid={error ? true : undefined}
				aria-describedby={`${id}-line`}
				onChange={(event) =>
					onChange(event.target.value.replace(/\p{Cc}/gu, ""))
				}
				className="h-11 w-full max-w-sm rounded-md border border-ink/20 bg-paper px-3 text-[1rem] text-ink shadow-[inset_0_1px_2px_oklch(0.3_0.03_60/0.06)] transition-[border-color,box-shadow] duration-(--duration-quick) outline-none placeholder:text-ink-muted/60 hover:border-ink/35 focus-visible:border-ink-accent focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-danger"
			/>
			<p id={`${id}-line`} className="text-ui text-ink-muted">
				{name === "" ? (
					ADD_A_NAME
				) : (
					<>
						Letters will say{" "}
						<span className="text-ink">“{sealLine(name)}”</span>
					</>
				)}
			</p>
			{error ? (
				<p role="alert" className="text-ui text-danger">
					{error}
				</p>
			) : null}
		</div>
	);
}
