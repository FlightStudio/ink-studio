"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, use, useState } from "react";
import { createPortal } from "react-dom";

const SECTIONS = [
	{ href: "/letters", label: "Letters" },
	{ href: "/fonts", label: "Handwriting" },
] as const;

const ActionsSlot = createContext<HTMLElement | null>(null);

function isCurrent(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioHeader({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [actions, setActions] = useState<HTMLElement | null>(null);
	return (
		<ActionsSlot value={actions}>
			<header className="studio-header flex items-center justify-between gap-3 px-4 sm:px-6">
				<nav aria-label="Studio" className="flex items-center gap-1">
					{SECTIONS.map((section) => (
						<Link
							key={section.href}
							href={section.href}
							aria-current={
								isCurrent(pathname, section.href) ? "page" : undefined
							}
							className="inline-flex items-center rounded-full px-3 py-1.5 text-ui text-ink-muted transition-colors duration-(--duration-quick) hover:bg-paper/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-paper aria-[current=page]:text-ink aria-[current=page]:shadow-[0_0_0_1px_var(--rule)] pointer-coarse:min-h-11 pointer-coarse:px-4"
						>
							{section.label}
						</Link>
					))}
				</nav>
				<div ref={setActions} className="flex items-center gap-2" />
			</header>
			{children}
		</ActionsSlot>
	);
}

export function StudioHeaderActions({ children }: { children: ReactNode }) {
	const slot = use(ActionsSlot);
	return slot ? createPortal(children, slot) : null;
}
