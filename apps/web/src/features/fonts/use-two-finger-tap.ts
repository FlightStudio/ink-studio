import { type RefObject, useEffect, useRef } from "react";
import {
	IDLE_TAP,
	severalFingers,
	type TapEvent,
	type TapTouch,
	twoFingerTap,
} from "./two-finger-tap.ts";

const TYPES = {
	touchstart: "start",
	touchmove: "move",
	touchend: "end",
	touchcancel: "cancel",
} as const satisfies Record<string, TapEvent["type"]>;

function touchesOf(list: TouchList, scope: HTMLElement): TapTouch[] {
	return [...list].map((touch) => ({
		id: touch.identifier,
		x: touch.clientX,
		y: touch.clientY,
		stylus: "touchType" in touch && touch.touchType === "stylus",
		eligible:
			touch.target instanceof Element &&
			scope.contains(touch.target) &&
			touch.target.closest("[data-glyph-drawing-area]") !== null &&
			touch.target.closest(
				"button, a, input, textarea, select, [role=button]",
			) === null,
	}));
}

export function useTwoFingerTap(
	scope: RefObject<HTMLElement | null>,
	onTap: () => void,
): Readonly<RefObject<boolean>> {
	const tap = useRef(onTap);
	const several = useRef(false);

	useEffect(() => {
		tap.current = onTap;
	});

	useEffect(() => {
		const root = scope.current;
		if (!root) return;
		let state = IDLE_TAP;
		const contacts = new Set<number>();
		const listen = (type: keyof typeof TYPES) => (event: TouchEvent) => {
			for (const touch of event.changedTouches) {
				if (type === "touchstart") contacts.add(touch.identifier);
				if (type === "touchend" || type === "touchcancel") {
					contacts.delete(touch.identifier);
				}
			}
			const tapEvent: TapEvent = {
				type: TYPES[type],
				t: event.timeStamp,
				changed: touchesOf(event.changedTouches, root),
				remaining: event.touches.length,
			};
			several.current = severalFingers(several.current, tapEvent);
			const next = twoFingerTap(state, {
				...tapEvent,
				type: event.touches.length > contacts.size ? "cancel" : tapEvent.type,
				remaining: contacts.size,
			});
			state = next.state;
			if (next.tap) tap.current();
		};
		const listeners = (Object.keys(TYPES) as (keyof typeof TYPES)[]).map(
			(type) => [type, listen(type)] as const,
		);
		for (const [type, listener] of listeners) {
			root.addEventListener(type, listener, { passive: true });
		}
		return () => {
			for (const [type, listener] of listeners) {
				root.removeEventListener(type, listener);
			}
			several.current = false;
		};
	}, [scope]);

	return several;
}
