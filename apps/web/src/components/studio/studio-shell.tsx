import { Libre_Baskerville, Outfit } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";
import { StudioHeader } from "./studio-header.tsx";

const display = Libre_Baskerville({
	subsets: ["latin"],
	weight: ["400"],
	variable: "--font-display",
});

const sans = Outfit({
	subsets: ["latin"],
	variable: "--font-sans",
});

const paperTexture = {
	"--letter-paper-texture": "url(/images/paper.png)",
} as CSSProperties;

const portalFonts = `body:has(.studio){--font-display:${display.style.fontFamily};--font-sans:${sans.style.fontFamily}}`;

export function StudioShell({ children }: { children: ReactNode }) {
	return (
		<div
			className={`studio ${display.variable} ${sans.variable} text-ui`}
			style={paperTexture}
		>
			<style href="studio-portal-fonts" precedence="default">
				{portalFonts}
			</style>
			<StudioHeader>{children}</StudioHeader>
		</div>
	);
}
