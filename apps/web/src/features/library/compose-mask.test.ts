import { outlinePath, strokeOutline } from "@repo/render/html";
import { afterEach, expect, it, vi } from "vitest";
import type { CanvasStroke } from "../ink/pointer-session.ts";
import { composeMask } from "./compose-mask.ts";

afterEach(() => vi.unstubAllGlobals());

it("composites every erasure with the width captured when it began", async () => {
	const paths: string[] = [];
	class MaskPath {
		constructor(readonly value: string) {}
	}
	class MaskCanvas {
		constructor(
			readonly width: number,
			readonly height: number,
		) {}
		getContext() {
			return {
				drawImage() {},
				setTransform() {},
				fill(path: MaskPath) {
					paths.push(path.value);
				},
				getImageData: () => ({
					data: new Uint8ClampedArray(this.width * this.height * 4).fill(255),
				}),
			};
		}
		async convertToBlob() {
			return new Blob(["mask"], { type: "image/png" });
		}
	}
	vi.stubGlobal("OffscreenCanvas", MaskCanvas);
	vi.stubGlobal("Path2D", MaskPath);
	const broad: CanvasStroke = {
		input: "mouse",
		points: [
			[5, 5, 0.5, 0],
			[25, 25, 0.5, 30],
		],
		strokeScale: 6,
	};
	const fine: CanvasStroke = { ...broad, strokeScale: 1 };
	const mask = await composeMask({
		bitmap: {} as CanvasImageSource,
		imageWidth: 40,
		imageHeight: 40,
		crop: { x: 0, y: 0, width: 40, height: 40 },
		viewWidth: 40,
		viewHeight: 40,
		strokes: [broad, fine],
	});
	const broadPath = outlinePath(strokeOutline(broad, 6));
	const finePath = outlinePath(strokeOutline(fine, 1));
	expect(broadPath).not.toBe(finePath);
	expect(paths).toEqual([broadPath, finePath]);
	expect(mask?.png.type).toBe("image/png");
});
