"use client";

import { getLetter, saveLetter } from "@repo/api";
import type { LetterContent } from "@repo/types";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useReducer,
	useRef,
} from "react";
import { type AutosaveState, autosave } from "./autosave.ts";

export type AutosaveDraft = { title: string; content: LetterContent };

export type UseAutosaveParams = {
	letterId: string;
	revision: number;
	enabled: boolean;
	draft: () => AutosaveDraft;
	onNewerVersion: () => void;
};

export type Autosave = {
	state: AutosaveState;
	edited: () => void;
	keepMine: () => Promise<void>;
};

async function latestRevision(letterId: string): Promise<number | null> {
	try {
		const response = await getLetter(letterId, { cache: "no-store" });
		return response.status === 200 ? response.data.revision : null;
	} catch {
		return null;
	}
}

export function useAutosave(params: UseAutosaveParams): Autosave {
	const { letterId, enabled } = params;
	const [state, dispatch] = useReducer(autosave, {
		status: "saved",
		revision: params.revision,
	});
	const stateRef = useRef(state);
	const draftRef = useRef(params.draft);
	const onNewerVersionRef = useRef(params.onNewerVersion);

	useLayoutEffect(() => {
		stateRef.current = state;
		draftRef.current = params.draft;
		onNewerVersionRef.current = params.onNewerVersion;
	});

	const edited = useCallback(() => {
		dispatch({ type: "edited", now: Date.now() });
	}, []);

	useEffect(() => {
		if (!enabled) return;
		if (state.status !== "dirty" && state.status !== "retrying") return;
		const expectedRevision = state.revision;
		const timer = setTimeout(
			async () => {
				dispatch({ type: "saveStarted" });
				try {
					const response = await saveLetter(letterId, {
						...draftRef.current(),
						expectedRevision,
					});
					if (response.status === 200) {
						dispatch({
							type: "saveSucceeded",
							revision: response.data.revision,
							now: Date.now(),
						});
					} else if (response.status === 409) {
						dispatch({ type: "saveConflicted" });
					} else {
						dispatch({ type: "saveFailed", now: Date.now() });
					}
				} catch {
					dispatch({ type: "saveFailed", now: Date.now() });
				}
			},
			Math.max(0, state.dueAt - Date.now()),
		);
		return () => clearTimeout(timer);
	}, [state, letterId, enabled]);

	useEffect(() => {
		if (state.status === "saved") return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [state.status]);

	useEffect(() => {
		const reloadWhenClean = async () => {
			if (document.visibilityState !== "visible") return;
			if (stateRef.current.status !== "saved") return;
			const latest = await latestRevision(letterId);
			const current = stateRef.current;
			if (
				latest !== null &&
				current.status === "saved" &&
				latest > current.revision
			) {
				onNewerVersionRef.current();
			}
		};
		document.addEventListener("visibilitychange", reloadWhenClean);
		return () =>
			document.removeEventListener("visibilitychange", reloadWhenClean);
	}, [letterId]);

	useEffect(() => {
		if (!enabled) return;
		return () => {
			const current = stateRef.current;
			if (current.status !== "dirty") return;
			void saveLetter(
				letterId,
				{ ...draftRef.current(), expectedRevision: current.revision },
				{ keepalive: true },
			).catch(() => undefined);
		};
	}, [letterId, enabled]);

	const keepMine = useCallback(async () => {
		const latest = await latestRevision(letterId);
		if (latest === null) return;
		dispatch({ type: "keptMine", latestRevision: latest, now: Date.now() });
	}, [letterId]);

	return { state, edited, keepMine };
}
