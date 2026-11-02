"use client";

import { getLetter } from "@repo/api";
import type { EditableLetter } from "@repo/services/letters";
import type { LetterResources } from "@repo/types";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { AutosaveState } from "./autosave.ts";
import {
	downloadLetterDraft,
	useLetterSaves,
} from "./letter-save-provider.tsx";
import type { LetterDraft } from "./letter-saves.ts";
import { requestDeadline } from "./request-deadline.ts";

export type AutosaveDraft = LetterDraft;

export type UseAutosaveParams = {
	letterId: string;
	enabled: boolean;
	resources: LetterResources;
	draft: () => AutosaveDraft;
	onNewerVersion: () => void;
};

export type Autosave = {
	state: AutosaveState;
	edited: (change?: Partial<AutosaveDraft>) => void;
	keepMine: () => Promise<void>;
	loadLatest: () => Promise<void>;
	retry: () => Promise<void>;
	download: () => void;
};

export function useLetterRecovery(server: EditableLetter): {
	letter: EditableLetter;
	generation: number;
} {
	const saves = useLetterSaves();
	const [initial] = useState(() =>
		saves.open(server.id, {
			title: server.title,
			content: server.content,
			resources: server.resources,
			revision: server.revision,
		}),
	);
	const subscribe = useCallback(
		(listener: () => void) => saves.subscribe(server.id, listener),
		[saves, server.id],
	);
	const snapshot = useCallback(
		() => saves.snapshot(server.id).generation,
		[saves, server.id],
	);
	const generation = useSyncExternalStore(subscribe, snapshot, snapshot);
	const restored = useMemo(
		() =>
			generation === initial.generation ? initial : saves.snapshot(server.id),
		[generation, initial, saves, server.id],
	);
	return {
		generation,
		letter: {
			...server,
			title: restored.draft.title,
			content: restored.draft.content,
			resources: restored.draft.resources ?? server.resources,
			revision: restored.state.revision,
		},
	};
}

export function useAutosave(params: UseAutosaveParams): Autosave {
	const saves = useLetterSaves();
	const { letterId, enabled, resources } = params;
	const draftRef = useRef(params.draft);
	const onNewerVersionRef = useRef(params.onNewerVersion);
	const subscribe = useCallback(
		(listener: () => void) => saves.subscribe(letterId, listener),
		[saves, letterId],
	);
	const snapshot = useCallback(
		() => saves.snapshot(letterId),
		[saves, letterId],
	);
	const { state } = useSyncExternalStore(subscribe, snapshot, snapshot);

	useLayoutEffect(() => {
		draftRef.current = params.draft;
		onNewerVersionRef.current = params.onNewerVersion;
	});

	useLayoutEffect(() => {
		if (enabled) saves.resources(letterId, resources);
	}, [enabled, saves, letterId, resources]);

	const edited = useCallback(
		(change?: Partial<AutosaveDraft>) => {
			if (!enabled) return;
			saves.edit(letterId, {
				...draftRef.current(),
				resources: saves.snapshot(letterId).draft.resources,
				...change,
			});
		},
		[enabled, saves, letterId],
	);

	useEffect(() => {
		if (!enabled) return;
		return () => {
			void saves.flush(letterId);
		};
	}, [enabled, saves, letterId]);

	useEffect(() => {
		const reloadWhenClean = async () => {
			if (document.visibilityState !== "visible") return;
			if (saves.snapshot(letterId).state.status !== "saved") return;
			const response = await requestDeadline((signal) =>
				getLetter(letterId, { cache: "no-store", signal }),
			).catch(() => null);
			const current = saves.snapshot(letterId).state;
			if (
				response?.status === 200 &&
				current.status === "saved" &&
				response.data.revision > current.revision
			) {
				onNewerVersionRef.current();
			}
		};
		document.addEventListener("visibilitychange", reloadWhenClean);
		return () =>
			document.removeEventListener("visibilitychange", reloadWhenClean);
	}, [saves, letterId]);

	return {
		state,
		edited,
		keepMine: () => saves.keepMine(letterId),
		loadLatest: async () => {
			if (await saves.loadLatest(letterId)) onNewerVersionRef.current();
		},
		retry: () => saves.retry(letterId),
		download: () => downloadLetterDraft(saves.snapshot(letterId).draft),
	};
}
