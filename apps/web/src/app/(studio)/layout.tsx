import { Libre_Baskerville, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import "@repo/ui/styles";

const display = Libre_Baskerville({
	subsets: ["latin"],
	weight: ["400", "700"],
	variable: "--font-display",
});

const sans = Outfit({
	subsets: ["latin"],
	variable: "--font-sans",
});

export default function StudioLayout({ children }: { children: ReactNode }) {
	return (
		<div
			className={`studio ${display.variable} ${sans.variable} font-sans text-ui`}
			style={{ ["--letter-paper-texture" as string]: "url(/images/paper.png)" }}
		>
			{children}
		</div>
	);
}
