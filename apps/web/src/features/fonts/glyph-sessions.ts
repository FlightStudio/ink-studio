import { errorMessages } from "@repo/errors";
import { type EditableFont, missingChars, type Stroke } from "@repo/types";
import { buildMessage } from "./font-errors.ts";
import { glyphBuildGate } from "./glyph-build-gate.ts";
import {
	drawnGlyphs,
	type GlyphHistory,
	glyphHistory,
	strokesOf,
} from "./glyph-history.ts";
import { glyphSaves, type SaveResult } from "./glyph-saves.ts";

type InitialFont = Pick<EditableFont, "id" | "ownerName" | "glyphs">;

type Transport = {
	send(
		fontId: string,
		key: string,
		strokes: readonly Stroke[],
	): Promise<SaveResult>;
	build(fontId: string): Promise<SaveResult>;
};

export type GlyphSessionSnapshot = {
	id: string;
	ownerName: string;
	history: GlyphHistory;
	errors: Readonly<Record<string, string | null>>;
	pending: boolean;
	building: boolean;
	buildError: string | null;
};

const MAX_SAVED_SESSIONS = 20;

function createSession(
	font: InitialFont,
	transport: Transport,
	changed: () => void,
) {
	let value: GlyphSessionSnapshot = {
		id: font.id,
		ownerName: font.ownerName,
		history: glyphHistory(structuredClone(font.glyphs)),
		errors: {},
		pending: false,
		building: false,
		buildError: null,
	};
	const listeners = new Set<() => void>();
	const gate = glyphBuildGate();
	function emit(change: Partial<GlyphSessionSnapshot>) {
		value = { ...value, ...change };
		for (const listener of listeners) listener();
		changed();
	}
	function withoutError(key: string) {
		const { [key]: _, ...rest } = value.errors;
		return rest;
	}
	const saves = glyphSaves({
		send: (key, strokes) => transport.send(font.id, key, strokes),
		onFailed: (key, error) =>
			emit({ errors: { ...value.errors, [key]: error } }),
		onSaved: (key) => emit({ errors: withoutError(key) }),
		onPending: (pending) => emit({ pending }),
	});

	return {
		snapshot: () => value,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		active: () => listeners.size > 0,
		apply(history: GlyphHistory, key: string | null) {
			if (!gate.editable() || key === null || history === value.history) return;
			emit({ history, errors: withoutError(key), buildError: null });
			saves.save(key, strokesOf(history, key));
		},
		retry() {
			emit({ errors: {} });
			saves.retry();
		},
		idle: saves.idle,
		pointerDown: gate.pointerDown,
		pointerEnd: gate.pointerEnd,
		async build(): Promise<boolean> {
			if (value.building) return false;
			if (!gate.begin()) {
				emit({
					buildError: "Finish your current stroke before building the font.",
				});
				return false;
			}
			emit({ building: true, buildError: null });
			try {
				await saves.idle();
				if (saves.pending()) {
					emit({
						buildError: "Save your handwriting before building the font.",
					});
					return false;
				}
				if (missingChars(drawnGlyphs(value.history)).length > 0) {
					emit({ buildError: errorMessages.font_incomplete });
					return false;
				}
				const result = await transport
					.build(font.id)
					.catch(() => ({ ok: false, error: null }) as const);
				if (!result.ok) emit({ buildError: buildMessage(result.error) });
				return result.ok;
			} finally {
				gate.finish();
				emit({ building: false });
			}
		},
	};
}

export function createGlyphSessions(transport: Transport) {
	const sessions = new Map<string, GlyphSession>();
	const listeners = new Set<() => void>();
	let pending: GlyphSessionSnapshot[] = [];
	function changed() {
		pending = [...sessions.values()]
			.map((session) => session.snapshot())
			.filter((session) => session.pending);
		for (const listener of listeners) listener();
	}
	return {
		open(font: InitialFont): GlyphSession {
			const existing = sessions.get(font.id);
			if (existing) return existing;
			for (const [id, session] of sessions) {
				if (sessions.size < MAX_SAVED_SESSIONS) break;
				const snapshot = session.snapshot();
				if (!snapshot.pending && !snapshot.building && !session.active())
					sessions.delete(id);
			}
			const session = createSession(font, transport, changed);
			sessions.set(font.id, session);
			return session;
		},
		pending: () => pending,
		subscribeAll(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		retry(id: string) {
			sessions.get(id)?.retry();
		},
	};
}

export type GlyphSession = ReturnType<typeof createSession>;
export type GlyphSessions = ReturnType<typeof createGlyphSessions>;
