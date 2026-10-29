"use client";

import type { PlacementIssue } from "@repo/render/html";
import { elementFrame, sideTopIn } from "@repo/render/html";
import type { PageSpec, PlacedElement, ProductKind } from "@repo/types";
import { RotateCw } from "lucide-react";
import {
	Fragment,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import type { ElementChange } from "../elements.ts";
import {
	type Handle,
	type KnobSide,
	knobSide,
	moveTo,
	nudge,
	type PointIn,
	resizeBy,
	resizeCursor,
	resizeFrom,
	rotateBy,
	rotateToward,
	selectionBounds,
} from "../transform.ts";
import { ElementMenu } from "./element-menu.tsx";
import { KEEP_CLEAR_COPY } from "./keep-clear-guides.tsx";

const HANDLES: Handle[] = [
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
];

const PX_PER_IN = 96;
const NUDGE_IN = { small: 0.05, large: 0.25 };
const RESIZE_STEP = { small: 1.05, large: 1.25 };
const ROTATE_STEP_DEG = { small: 1, large: 15 };
const SIZES_PX = {
	fine: { hit: 24, dot: 12, knob: 24, icon: 13, stem: 24 },
	coarse: { hit: 44, dot: 16, knob: 32, icon: 16, stem: 36 },
};
const KEY_SCROLL_MARGIN = "96px 16px 136px";
const KEY_HINT =
	"Arrow keys move it. Plus and minus resize it. The square brackets turn it. Hold Shift for bigger steps. Delete removes it. Escape puts it down.";

const NOUNS: Record<PlacedElement["kind"], string> = {
	drawing: "doodle",
	signature: "signature",
};

const ISSUE_COPY: Record<
	Exclude<PlacementIssue["kind"], "keep-clear">,
	(noun: string) => string
> = {
	"outside-safe": (noun) => `Keep this ${noun} inside the safe area.`,
	"beyond-sides": (noun) => `This ${noun} is past the last side.`,
};

function capitalized(noun: string): string {
	return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
}

type Gesture =
	| {
			kind: "move";
			origin: PlacedElement;
			offset: PointIn;
			node: HTMLElement;
			moved: boolean;
			latest: PlacedElement | null;
	  }
	| {
			kind: "resize";
			origin: PlacedElement;
			handle: Handle;
			node: HTMLElement;
			moved: boolean;
			latest: PlacedElement | null;
	  }
	| {
			kind: "rotate";
			origin: PlacedElement;
			knob: KnobSide;
			node: HTMLElement;
			moved: boolean;
			latest: PlacedElement | null;
	  };

export type ElementHandlesProps = {
	elements: PlacedElement[];
	spec: PageSpec;
	gapIn: number;
	scale: number;
	coarsePointer: boolean;
	issues: PlacementIssue[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onRelease: () => void;
	onPreview: (element: PlacedElement | null) => void;
	onCommit: (id: string, change: ElementChange) => void;
	onRemove: (id: string) => void;
};

export function placementSentence(
	issues: PlacementIssue[],
	product: ProductKind,
	elements: readonly PlacedElement[],
): string | null {
	if (issues.some((issue) => issue.kind === "keep-clear")) {
		return KEEP_CLEAR_COPY[product].issue;
	}
	const issue = issues[0];
	if (!issue || issue.kind === "keep-clear") return null;
	const kind =
		elements.find((element) => element.id === issue.elementId)?.kind ??
		"drawing";
	return ISSUE_COPY[issue.kind](NOUNS[kind]);
}

function changed(
	origin: PlacedElement,
	next: PlacedElement,
): ElementChange | null {
	const change: ElementChange = {};
	if (next.side !== origin.side) change.side = next.side;
	if (next.xIn !== origin.xIn) change.xIn = next.xIn;
	if (next.yIn !== origin.yIn) change.yIn = next.yIn;
	if (next.widthIn !== origin.widthIn) change.widthIn = next.widthIn;
	if (next.heightIn !== origin.heightIn) change.heightIn = next.heightIn;
	if (next.rotationDeg !== origin.rotationDeg)
		change.rotationDeg = next.rotationDeg;
	if (next.tint !== origin.tint) change.tint = next.tint;
	return Object.keys(change).length > 0 ? change : null;
}

function pagePoint(
	spec: PageSpec,
	node: HTMLElement,
	clientX: number,
	clientY: number,
): PointIn {
	const sides = node.closest(".letter-sides");
	if (!(sides instanceof HTMLElement)) {
		throw new Error("the doodle handles are outside the page");
	}
	const rect = sides.getBoundingClientRect();
	const pxPerIn = rect.width / spec.widthIn;
	return {
		xIn: (clientX - rect.left) / pxPerIn,
		yIn: (clientY - rect.top) / pxPerIn,
	};
}

function keepInView(
	node: HTMLElement | undefined,
	block: ScrollLogicalPosition = "nearest",
): void {
	if (!node) return;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	node.scrollIntoView({
		block,
		inline: "nearest",
		behavior: reduced ? "auto" : "smooth",
	});
}

function inView(node: HTMLElement): boolean {
	const rect = node.getBoundingClientRect();
	return rect.top >= 0 && rect.bottom <= window.innerHeight;
}

function keyChange(
	event: ReactKeyboardEvent,
	element: PlacedElement,
	spec: PageSpec,
	gapIn: number,
): ElementChange | null {
	const size = event.shiftKey ? "large" : "small";
	const step = NUDGE_IN[size];
	const arrows: Record<string, { dxIn: number; dyIn: number }> = {
		ArrowLeft: { dxIn: -step, dyIn: 0 },
		ArrowRight: { dxIn: step, dyIn: 0 },
		ArrowUp: { dxIn: 0, dyIn: -step },
		ArrowDown: { dxIn: 0, dyIn: step },
	};
	const arrow = arrows[event.key];
	if (arrow) return nudge(element, arrow, spec, gapIn);
	if (event.key === "=" || event.key === "+") {
		return resizeBy(element, RESIZE_STEP[size], spec);
	}
	if (event.key === "-" || event.key === "_") {
		return resizeBy(element, 1 / RESIZE_STEP[size], spec);
	}
	if (event.key === "[" || event.key === "{") {
		return { rotationDeg: rotateBy(element, -ROTATE_STEP_DEG[size]) };
	}
	if (event.key === "]" || event.key === "}") {
		return { rotationDeg: rotateBy(element, ROTATE_STEP_DEG[size]) };
	}
	return null;
}

export function ElementHandles(props: ElementHandlesProps) {
	const propsRef = useRef(props);
	propsRef.current = props;
	const gestureRef = useRef<Gesture | null>(null);
	const moveButtons = useRef(new Map<string, HTMLButtonElement>());
	const [heldKnob, setHeldKnob] = useState<KnobSide | null>(null);
	const hintId = useId();
	const sizes = SIZES_PX[props.coarsePointer ? "coarse" : "fine"];
	const px = (screenPx: number) => screenPx / props.scale;
	const knobCentreIn =
		(sizes.stem + sizes.knob / 2) / (PX_PER_IN * props.scale);
	const reachIn =
		Math.max(sizes.hit, sizes.knob) / 2 / (PX_PER_IN * props.scale);
	const selected = props.elements.find(
		(element) => element.id === props.selectedId,
	);
	const knob = selected
		? (heldKnob ?? knobSide(selected, props.spec, props.gapIn, knobCentreIn))
		: "top";

	useEffect(() => {
		if (!props.selectedId) return;
		const button = moveButtons.current.get(props.selectedId);
		if (button && document.activeElement !== button) {
			button.focus({ preventScroll: true });
			if (!inView(button)) keepInView(button, "center");
		}
	}, [props.selectedId]);

	function finish() {
		const gesture = gestureRef.current;
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", finish);
		window.removeEventListener("pointercancel", finish);
		gestureRef.current = null;
		setHeldKnob(null);
		if (!gesture) return;
		const change =
			gesture.moved && gesture.latest
				? changed(gesture.origin, gesture.latest)
				: null;
		propsRef.current.onPreview(null);
		if (change) propsRef.current.onCommit(gesture.origin.id, change);
	}

	function onMove(event: PointerEvent) {
		const gesture = gestureRef.current;
		if (!gesture) return;
		const { spec, gapIn } = propsRef.current;
		const pointer = pagePoint(spec, gesture.node, event.clientX, event.clientY);
		const origin = gesture.origin;
		let next = origin;
		if (gesture.kind === "move") {
			next = {
				...origin,
				...moveTo(origin, {
					pointer: {
						xIn: pointer.xIn - gesture.offset.xIn,
						yIn: pointer.yIn - gesture.offset.yIn,
					},
					spec,
					gapIn,
				}),
			};
		} else if (gesture.kind === "resize") {
			next = {
				...origin,
				...resizeFrom(origin, gesture.handle, { pointer, spec, gapIn }),
			};
		} else {
			next = {
				...origin,
				rotationDeg: rotateToward(
					origin,
					{ pointer, spec, gapIn },
					gesture.knob,
				),
			};
		}
		gesture.moved = true;
		gesture.latest = next;
		propsRef.current.onPreview(next);
	}

	function begin(event: ReactPointerEvent<HTMLElement>, gesture: Gesture) {
		event.preventDefault();
		event.stopPropagation();
		props.onSelect(gesture.origin.id);
		moveButtons.current.get(gesture.origin.id)?.focus({ preventScroll: true });
		gestureRef.current = gesture;
		if (gesture.kind === "rotate") setHeldKnob(gesture.knob);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", finish);
		window.addEventListener("pointercancel", finish);
	}

	function startMove(
		event: ReactPointerEvent<HTMLButtonElement>,
		origin: PlacedElement,
	) {
		const { spec, gapIn } = props;
		const pointer = pagePoint(
			spec,
			event.currentTarget,
			event.clientX,
			event.clientY,
		);
		const centre = {
			xIn: origin.xIn + origin.widthIn / 2,
			yIn:
				sideTopIn(spec, origin.side, gapIn) + origin.yIn + origin.heightIn / 2,
		};
		begin(event, {
			kind: "move",
			origin,
			offset: {
				xIn: pointer.xIn - centre.xIn,
				yIn: pointer.yIn - centre.yIn,
			},
			node: event.currentTarget,
			moved: false,
			latest: null,
		});
	}

	function onKey(event: ReactKeyboardEvent, element: PlacedElement) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === "Escape") {
			event.preventDefault();
			props.onRelease();
			return;
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			props.onRemove(element.id);
			return;
		}
		const next = keyChange(event, element, props.spec, props.gapIn);
		if (!next) return;
		event.preventDefault();
		const change = changed(element, { ...element, ...next });
		if (!change) return;
		props.onCommit(element.id, change);
		requestAnimationFrame(() =>
			keepInView(moveButtons.current.get(element.id)),
		);
	}

	return (
		<>
			<p id={hintId} hidden>
				{KEY_HINT}
			</p>
			{props.elements.map((element) => {
				const isSelected = element.id === props.selectedId;
				const issues = props.issues.filter(
					(issue) => issue.elementId === element.id,
				);
				const danger = issues.length > 0;
				const outline =
					isSelected || danger
						? {
								outline: `${px(1.5)}px solid ${danger ? "var(--danger)" : "var(--ink)"}`,
								outlineOffset: `${px(4)}px`,
							}
						: undefined;
				return (
					<Fragment key={element.id}>
						<div
							className="absolute"
							data-element-id={element.id}
							data-selected={isSelected}
							style={{
								...elementFrame(props.spec, element, props.gapIn),
								touchAction: "none",
							}}
						>
							<button
								ref={(node) => {
									if (node) moveButtons.current.set(element.id, node);
									else moveButtons.current.delete(element.id);
								}}
								type="button"
								aria-label={`Move ${NOUNS[element.kind]}`}
								aria-describedby={hintId}
								aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - [ ] Delete Escape"
								className="absolute inset-0 cursor-grab rounded-[2px] outline-none active:cursor-grabbing"
								style={{
									...outline,
									scrollMargin: KEY_SCROLL_MARGIN,
								}}
								onFocus={() => {
									if (propsRef.current.selectedId !== element.id) {
										props.onSelect(element.id);
									}
								}}
								onKeyDown={(event) => onKey(event, element)}
								onPointerDown={(event) => startMove(event, element)}
							/>
							{isSelected
								? HANDLES.map((handle) => (
										<button
											key={handle}
											type="button"
											tabIndex={-1}
											aria-label={`Resize from the ${handle.replace("-", " ")}`}
											className="absolute z-10 grid place-items-center"
											style={{
												left: handle.endsWith("right") ? "100%" : "0%",
												top: handle.startsWith("bottom") ? "100%" : "0%",
												width: px(sizes.hit),
												height: px(sizes.hit),
												translate: "-50% -50%",
												cursor: resizeCursor(handle, element.rotationDeg),
											}}
											onPointerDown={(event) =>
												begin(event, {
													kind: "resize",
													origin: element,
													handle,
													node: event.currentTarget,
													moved: false,
													latest: null,
												})
											}
										>
											<span
												className="block rounded-full bg-paper"
												style={{
													width: px(sizes.dot),
													height: px(sizes.dot),
													boxShadow: `0 0 0 ${px(1.5)}px var(--ink)`,
												}}
											/>
										</button>
									))
								: null}
							{isSelected ? (
								<>
									<span
										aria-hidden
										className="absolute left-1/2 bg-ink"
										style={{
											[knob]: -px(sizes.stem),
											width: px(1),
											height: px(sizes.stem),
											translate: "-50% 0",
										}}
									/>
									<button
										type="button"
										tabIndex={-1}
										aria-label={`Rotate ${NOUNS[element.kind]}`}
										data-knob={knob}
										className="absolute left-1/2 z-10 grid cursor-grab place-items-center active:cursor-grabbing"
										style={{
											[knob]: -px(sizes.stem + sizes.knob / 2),
											width: px(Math.max(sizes.hit, sizes.knob)),
											height: px(Math.max(sizes.hit, sizes.knob)),
											translate: knob === "top" ? "-50% -50%" : "-50% 50%",
										}}
										onPointerDown={(event) =>
											begin(event, {
												kind: "rotate",
												origin: element,
												knob,
												node: event.currentTarget,
												moved: false,
												latest: null,
											})
										}
									>
										<span
											className="grid place-items-center rounded-full bg-paper text-ink"
											style={{
												width: px(sizes.knob),
												height: px(sizes.knob),
												boxShadow: `0 0 0 ${px(1.5)}px var(--ink)`,
											}}
										>
											<RotateCw
												aria-hidden
												style={{
													width: px(sizes.icon),
													height: px(sizes.icon),
												}}
												strokeWidth={2.25}
											/>
										</span>
									</button>
								</>
							) : null}
						</div>
						{isSelected ? (
							<ElementMenu
								label={capitalized(NOUNS[element.kind])}
								tint={element.tint}
								wrap={element.wrap}
								onTint={(tint) => props.onCommit(element.id, { tint })}
								onWrap={(wrap) => props.onCommit(element.id, { wrap })}
								onRemove={() => props.onRemove(element.id)}
								bounds={selectionBounds(element, props.spec, props.gapIn, {
									knobIn: knobCentreIn,
									padIn: reachIn,
									knob,
								})}
								sheet={{
									widthIn: props.spec.widthIn,
									topIn: sideTopIn(props.spec, element.side, props.gapIn),
									heightIn: props.spec.heightIn,
								}}
								scale={props.scale}
								warning={placementSentence(issues, props.spec.product, [
									element,
								])}
								onEscape={props.onRelease}
							/>
						) : null}
					</Fragment>
				);
			})}
		</>
	);
}
