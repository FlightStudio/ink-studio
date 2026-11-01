type PointerTarget = EventTarget & {
	setPointerCapture(pointerId: number): void;
	hasPointerCapture(pointerId: number): boolean;
	releasePointerCapture(pointerId: number): void;
};

export function trackElementPointer({
	root,
	target,
	pointerId,
	onMove,
	onFinish,
	onCancel,
}: {
	root: EventTarget;
	target: PointerTarget;
	pointerId: number;
	onMove: (event: PointerEvent) => void;
	onFinish: () => void;
	onCancel: () => void;
}): () => void {
	let active = true;
	const owned = (event: Event) =>
		(event as PointerEvent).pointerId === pointerId;
	const move = (event: Event) => {
		if (owned(event)) onMove(event as PointerEvent);
	};
	const finish = (event: Event) => {
		if (owned(event)) end(true);
	};
	const cancel = (event: Event) => {
		if (owned(event)) end(false);
	};
	const blur = () => end(false);

	function end(commit: boolean) {
		if (!active) return;
		active = false;
		root.removeEventListener("pointermove", move);
		root.removeEventListener("pointerup", finish);
		root.removeEventListener("pointercancel", cancel);
		root.removeEventListener("blur", blur);
		target.removeEventListener("lostpointercapture", cancel);
		if (target.hasPointerCapture(pointerId))
			target.releasePointerCapture(pointerId);
		if (commit) onFinish();
		else onCancel();
	}

	root.addEventListener("pointermove", move);
	root.addEventListener("pointerup", finish);
	root.addEventListener("pointercancel", cancel);
	root.addEventListener("blur", blur);
	target.addEventListener("lostpointercapture", cancel);
	try {
		target.setPointerCapture(pointerId);
	} catch {
		end(false);
	}
	return () => end(false);
}
