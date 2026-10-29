"use client";

import { getAssetStatus } from "@repo/api";
import { useEffect, useRef, useState } from "react";
import {
	type AssetReading,
	type AssetWatchState,
	isSettled,
	watchAsset,
} from "./asset-watch.ts";

async function readStatus(assetId: string): Promise<AssetReading | null> {
	const response = await getAssetStatus(assetId);
	return response.status === 200 ? response.data : null;
}

export function watchAssetStatus(
	assetId: string,
	onChange: (state: AssetWatchState) => void,
): () => void {
	return watchAsset({ read: () => readStatus(assetId), onChange });
}

export function useAssetWatch(
	assetId: string | null,
	onSettled: (state: AssetWatchState) => void,
): AssetWatchState | null {
	const settled = useRef(onSettled);
	const [watched, setWatched] = useState<{
		assetId: string;
		state: AssetWatchState;
	} | null>(null);

	useEffect(() => {
		settled.current = onSettled;
	}, [onSettled]);

	useEffect(() => {
		if (assetId === null) return;
		return watchAssetStatus(assetId, (state) => {
			setWatched({ assetId, state });
			if (isSettled(state)) settled.current(state);
		});
	}, [assetId]);

	return watched !== null && watched.assetId === assetId ? watched.state : null;
}
