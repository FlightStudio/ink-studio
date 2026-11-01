export type StrokeInput = "pen" | "mouse" | "touch";

export type StrokePoint = readonly [
	x: number,
	y: number,
	pressure: number,
	t: number,
];

export type Stroke = { input: StrokeInput; points: StrokePoint[] };
