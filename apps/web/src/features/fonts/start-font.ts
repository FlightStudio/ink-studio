"use client";

import { createFont, deleteFont, uploadFile } from "@repo/api";
import {
	createMessage,
	type UploadKind,
	uploadMessage,
} from "./font-errors.ts";

export type StartFontParams = {
	ownerName: string;
	kind: UploadKind;
	file: File;
	replacing: string | null;
};

export type StartedFont =
	| { ok: true; id: string }
	| { ok: false; error: string };

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export const FONT_FILE_ACCEPT = ".ttf,.otf,font/ttf,font/otf";

async function upload(kind: UploadKind, file: File) {
	return uploadFile(
		file,
		{ purpose: kind },
		{ headers: { "x-file-name": encodeURIComponent(file.name) } },
	).catch(() => null);
}

export async function startFont({
	ownerName,
	kind,
	file,
	replacing,
}: StartFontParams): Promise<StartedFont> {
	const uploaded = await upload(kind, file);
	if (uploaded?.status !== 201) {
		return { ok: false, error: uploadMessage(kind, uploaded?.data.code) };
	}
	const created = await createFont({
		ownerName,
		source:
			kind === "photo"
				? {
						kind: "template-photo",
						templateVersion: 1,
						photoAssetId: uploaded.data.id,
					}
				: { kind: "upload", fileAssetId: uploaded.data.id },
	}).catch(() => null);
	if (created?.status !== 201) {
		return { ok: false, error: createMessage(created?.data.code) };
	}
	if (replacing !== null) await deleteFont(replacing).catch(() => null);
	return { ok: true, id: created.data.id };
}
