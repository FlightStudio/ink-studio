import { describe, expect, it } from "vitest";
import { glyphBuildGate } from "./glyph-build-gate.ts";

describe("glyph build boundary", () => {
	it("refuses a build until an already-started stroke finishes", () => {
		const gate = glyphBuildGate();
		expect(gate.pointerDown(1)).toBe(true);
		expect(gate.begin()).toBe(false);
		expect(gate.editable()).toBe(true);
		gate.pointerEnd(1);
		expect(gate.begin()).toBe(true);
	});

	it("freezes new strokes and history edits while saves and the build request are pending", () => {
		const gate = glyphBuildGate();
		expect(gate.begin()).toBe(true);
		expect(gate.editable()).toBe(false);
		expect(gate.pointerDown(2)).toBe(false);
		expect(gate.begin()).toBe(false);
		gate.finish();
		expect(gate.editable()).toBe(true);
		expect(gate.begin()).toBe(true);
	});

	it("waits for every drawing pointer and releases cancelled pointers", () => {
		const gate = glyphBuildGate();
		gate.pointerDown(1);
		gate.pointerDown(2);
		gate.pointerEnd(1);
		expect(gate.begin()).toBe(false);
		gate.pointerEnd(2);
		gate.pointerEnd(2);
		expect(gate.begin()).toBe(true);
	});
});
