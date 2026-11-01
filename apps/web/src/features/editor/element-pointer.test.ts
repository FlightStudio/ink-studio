import { describe, expect, it, vi } from "vitest";
import { trackElementPointer } from "./element-pointer.ts";

function pointer(type: string, pointerId: number) {
	return Object.assign(new Event(type), { pointerId });
}

function tracking(captureFails = false) {
	const root = new EventTarget();
	const target = Object.assign(new EventTarget(), {
		setPointerCapture: vi.fn(() => {
			if (captureFails) throw new Error("inactive pointer");
		}),
		hasPointerCapture: vi.fn(() => true),
		releasePointerCapture: vi.fn(),
	});
	const moved = vi.fn();
	const finished = vi.fn();
	const cancelled = vi.fn();
	const stop = trackElementPointer({
		root,
		target,
		pointerId: 7,
		onMove: moved,
		onFinish: finished,
		onCancel: cancelled,
	});
	return { root, target, moved, finished, cancelled, stop };
}

describe("element pointer ownership", () => {
	it("an unrelated pointer cannot move, finish, or cancel the gesture", () => {
		const track = tracking();
		for (const type of ["pointermove", "pointerup", "pointercancel"]) {
			track.root.dispatchEvent(pointer(type, 8));
		}
		expect(track.moved).not.toHaveBeenCalled();
		expect(track.finished).not.toHaveBeenCalled();
		expect(track.cancelled).not.toHaveBeenCalled();
		track.root.dispatchEvent(pointer("pointermove", 7));
		track.root.dispatchEvent(pointer("pointerup", 7));
		track.root.dispatchEvent(pointer("pointerup", 7));
		expect(track.moved).toHaveBeenCalledOnce();
		expect(track.finished).toHaveBeenCalledOnce();
		expect(track.cancelled).not.toHaveBeenCalled();
		expect(track.target.releasePointerCapture).toHaveBeenCalledWith(7);
	});

	it("cancelling the owner discards the gesture and detaches listeners", () => {
		const track = tracking();
		track.root.dispatchEvent(pointer("pointermove", 7));
		track.root.dispatchEvent(pointer("pointercancel", 7));
		track.root.dispatchEvent(pointer("pointermove", 7));
		track.root.dispatchEvent(pointer("pointerup", 7));
		expect(track.moved).toHaveBeenCalledOnce();
		expect(track.cancelled).toHaveBeenCalledOnce();
		expect(track.finished).not.toHaveBeenCalled();
	});

	it("teardown cancels once and cannot later commit", () => {
		const track = tracking();
		track.stop();
		track.stop();
		track.root.dispatchEvent(pointer("pointerup", 7));
		track.root.dispatchEvent(pointer("pointermove", 7));
		expect(track.cancelled).toHaveBeenCalledOnce();
		expect(track.finished).not.toHaveBeenCalled();
		expect(track.moved).not.toHaveBeenCalled();
	});

	it("losing the owner's capture cancels without committing", () => {
		const track = tracking();
		track.target.dispatchEvent(pointer("lostpointercapture", 8));
		expect(track.cancelled).not.toHaveBeenCalled();
		track.target.dispatchEvent(pointer("lostpointercapture", 7));
		expect(track.cancelled).toHaveBeenCalledOnce();
		expect(track.finished).not.toHaveBeenCalled();
	});

	it("losing the window cancels an active gesture", () => {
		const track = tracking();
		track.root.dispatchEvent(new Event("blur"));
		expect(track.cancelled).toHaveBeenCalledOnce();
		expect(track.finished).not.toHaveBeenCalled();
	});

	it("a pointer that cannot be captured cancels without leaving listeners", () => {
		const track = tracking(true);
		track.root.dispatchEvent(pointer("pointermove", 7));
		track.root.dispatchEvent(pointer("pointerup", 7));
		expect(track.cancelled).toHaveBeenCalledOnce();
		expect(track.moved).not.toHaveBeenCalled();
		expect(track.finished).not.toHaveBeenCalled();
	});
});
