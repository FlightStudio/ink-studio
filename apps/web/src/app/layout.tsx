import type { ReactNode } from "react";
import "@repo/ui/styles";

export const metadata = {
	title: "Ink Studio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
