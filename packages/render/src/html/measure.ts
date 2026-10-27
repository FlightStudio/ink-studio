export type MeasureInput = {
	heightIn: number;
	marginIn: number;
	gapIn: number;
	limitIn: number;
};
export type LetterMeasure = {
	lineTopsIn: number[];
	textBottomIn: number;
	wordsPastLimit: number;
};

export function measureLetter(
	root: HTMLElement,
	input: MeasureInput,
): LetterMeasure {
	const origin = root.getBoundingClientRect();
	const scale = root.offsetHeight > 0 ? origin.height / root.offsetHeight : 1;
	const pxPerIn = 96 * scale;
	const textHeightIn = input.heightIn - 2 * input.marginIn;
	const pitchIn = input.heightIn + input.gapIn;
	const lastSide = Math.max(
		0,
		Math.round((input.limitIn - textHeightIn) / input.heightIn),
	);
	const document = root.ownerDocument;
	const range = document.createRange();
	const walker = document.createTreeWalker(root, 1 | 4);
	const boxes: { topIn: number; bottomIn: number }[] = [];
	const texts: Text[] = [];
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		if (node.nodeType === 3) {
			texts.push(node as Text);
			range.selectNodeContents(node);
		} else if (node.nodeName === "BR") {
			range.selectNode(node);
		} else {
			continue;
		}
		for (const rect of range.getClientRects()) {
			if (rect.height <= 0) continue;
			boxes.push({
				topIn: (rect.top - origin.top) / pxPerIn,
				bottomIn: (rect.bottom - origin.top) / pxPerIn,
			});
		}
	}
	boxes.sort((a, b) => a.topIn - b.topIn);
	const lines: { topIn: number; bottomIn: number }[] = [];
	for (const box of boxes) {
		const line = lines.at(-1);
		const shared = line
			? Math.min(line.bottomIn, box.bottomIn) - Math.max(line.topIn, box.topIn)
			: 0;
		if (
			line &&
			shared >
				0.5 * Math.min(line.bottomIn - line.topIn, box.bottomIn - box.topIn)
		) {
			line.topIn = Math.min(line.topIn, box.topIn);
			line.bottomIn = Math.max(line.bottomIn, box.bottomIn);
		} else {
			lines.push({ ...box });
		}
	}
	const lineTopsIn: number[] = [];
	let textBottomIn = 0;
	for (const line of lines) {
		const side = Math.min(
			lastSide,
			Math.max(0, Math.floor((line.topIn - textHeightIn) / pitchIn) + 1),
		);
		lineTopsIn.push(line.topIn - side * input.gapIn);
		textBottomIn = Math.max(textBottomIn, line.bottomIn - side * input.gapIn);
	}
	let wordsPastLimit = 0;
	for (const text of texts) {
		range.selectNodeContents(text);
		const rects = [...range.getClientRects()];
		const deepest = Math.max(0, ...rects.map((rect) => rect.bottom));
		const deepestIn = (deepest - origin.top) / pxPerIn - lastSide * input.gapIn;
		if (deepestIn <= input.limitIn) continue;
		for (const match of (text.textContent ?? "").matchAll(/\S+/gu)) {
			range.setStart(text, match.index);
			range.setEnd(text, match.index + match[0].length);
			for (const rect of range.getClientRects()) {
				const topIn = (rect.top - origin.top) / pxPerIn;
				const side = Math.min(
					lastSide,
					Math.max(0, Math.floor((topIn - textHeightIn) / pitchIn) + 1),
				);
				if (
					(rect.bottom - origin.top) / pxPerIn - side * input.gapIn >
					input.limitIn
				) {
					wordsPastLimit += 1;
					break;
				}
			}
		}
	}
	return { lineTopsIn, textBottomIn, wordsPastLimit };
}
