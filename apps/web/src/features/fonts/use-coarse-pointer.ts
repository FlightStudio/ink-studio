import { useSyncExternalStore } from "react";

const COARSE_POINTER = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
	const query = window.matchMedia(COARSE_POINTER);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

export function useCoarsePointer(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(COARSE_POINTER).matches,
		() => false,
	);
}
