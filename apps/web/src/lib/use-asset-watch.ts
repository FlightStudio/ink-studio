"use client";

import { getAssetStatus } from "@repo/api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AssetReading,
	type AssetReadResult,
	type AssetWatchState,
	assetReadIssue,
	isSettled,
	watchAsset,
} from "./asset-watch.ts";
import { requestDeadline } from "./request-deadline.ts";

async function readStatus(assetId: string): Promise<AssetReadResult> {
	const response = await requestDeadline((signal) =>
		getAssetStatus(assetId, { signal }),
	);
	return response.status === 200
		? response.data
		: { issue: assetReadIssue(response.status) };
}

export function watchAssetStatus(
	assetId: string,
	onChange: (state: AssetWatchState) => void,
	initialReading?: AssetReading,
): () => void {
	return watchAsset({
		read: () => readStatus(assetId),
		onChange,
		initialReading,
	});
}

export function useAssetWatch(
	assetId: string | null,
	onSettled: (state: AssetWatchState) => void,
): { state: AssetWatchState | null; retry: () => void } {
	const settled = useRef(onSettled);
	const restart = useRef<() => void>(() => {});
	const retry = useCallback(() => restart.current(), []);
	const latest = useRef<{ assetId: string; state: AssetWatchState } | null>(
		null,
	);
	const [watched, setWatched] = useState<{
		assetId: string;
		state: AssetWatchState;
	} | null>(null);

	useEffect(() => {
		settled.current = onSettled;
	}, [onSettled]);

	useEffect(() => {
		if (assetId === null) return;
		let stop = () => {};
		restart.current = () => {
			stop();
			stop = watchAssetStatus(
				assetId,
				(state) => {
					latest.current = { assetId, state };
					setWatched(latest.current);
					if (isSettled(state)) settled.current(state);
				},
				latest.current?.assetId === assetId ? latest.current.state : undefined,
			);
		};
		restart.current();
		return () => {
			stop();
			restart.current = () => {};
		};
	}, [assetId]);

	return {
		state:
			watched !== null && watched.assetId === assetId ? watched.state : null,
		retry,
	};
}
