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

function touchesOf(list: TouchList): TapTouch[] {
	return [...list].map((touch) => ({
		id: touch.identifier,
		x: touch.clientX,
		y: touch.clientY,
		stylus: "touchType" in touch && touch.touchType === "stylus",
	}));
}

export function useTwoFingerTap(
	onTap: () => void,
): Readonly<RefObject<boolean>> {
	const tap = useRef(onTap);
	const several = useRef(false);

	useEffect(() => {
		tap.current = onTap;
	});

	useEffect(() => {
		let state = IDLE_TAP;
		const listen = (type: keyof typeof TYPES) => (event: TouchEvent) => {
			const tapEvent: TapEvent = {
				type: TYPES[type],
				t: event.timeStamp,
				changed: touchesOf(event.changedTouches),
				remaining: event.touches.length,
			};
			several.current = severalFingers(several.current, tapEvent);
			const next = twoFingerTap(state, tapEvent);
			state = next.state;
			if (next.tap) tap.current();
		};
		const listeners = (Object.keys(TYPES) as (keyof typeof TYPES)[]).map(
			(type) => [type, listen(type)] as const,
		);
		for (const [type, listener] of listeners) {
			window.addEventListener(type, listener, { passive: true });
		}
		return () => {
			for (const [type, listener] of listeners) {
				window.removeEventListener(type, listener);
			}
		};
	}, []);

	return several;
}
