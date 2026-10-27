import type { ReactNode } from "react";

export function Title({ children }: { children: ReactNode }) {
	return <h1>{children}</h1>;
}
