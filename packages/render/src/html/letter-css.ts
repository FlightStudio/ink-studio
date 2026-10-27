export const LETTER_CSS = `
.letter-page {
	position: relative;
	box-sizing: content-box;
}
.letter-sides {
	position: relative;
	box-sizing: border-box;
}
.letter-sheet {
	position: absolute;
	left: 0;
	box-sizing: border-box;
}
.letter-front {
	position: relative;
	overflow: hidden;
}
.letter-page[data-mode="edit"] .letter-sheet {
	background-color: var(--paper, oklch(0.985 0.008 85));
	background-image: var(--letter-paper-texture, none);
	background-size: 125px;
	background-repeat: repeat;
	border-radius: 3px;
	box-shadow: var(
		--shadow-sheet,
		0 1px 2px oklch(0.3 0.03 60 / 0.12),
		0 24px 48px -24px oklch(0.3 0.03 60 / 0.4)
	);
}
.letter-page[data-mode="print"] .letter-sheet {
	background-color: #fff;
	box-shadow: none;
}
.letter-front-empty {
	position: absolute;
	inset: 0.5in;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 1.5px dashed var(--rule, oklch(0.88 0.01 80));
	border-radius: 6px;
	color: var(--ink-muted, oklch(0.52 0.015 262));
	font-family: var(--font-sans, system-ui, sans-serif);
	font-size: 15px;
}
.letter-keep-clear {
	position: absolute;
	box-sizing: border-box;
	pointer-events: none;
	border-radius: 2px;
	background-image: repeating-linear-gradient(
		-45deg,
		oklch(0.52 0.015 262 / 0.28) 0 1px,
		transparent 1px 6px
	);
	box-shadow: inset 0 0 0 1px oklch(0.52 0.015 262 / 0.3);
}
.letter-column {
	position: relative;
	display: flow-root;
}
.letter-float {
	pointer-events: none;
}
.letter-text {
	white-space: pre-wrap;
	line-height: 1.5;
	overflow-wrap: anywhere;
	word-break: normal;
	font-kerning: normal;
	font-variant-ligatures: normal;
	font-feature-settings: var(--letter-variant-set, normal);
	-webkit-hyphens: none;
	hyphens: none;
	outline: none;
}
.letter-text p {
	margin: 0;
}
.letter-element {
	position: absolute;
	pointer-events: none;
	-webkit-mask-size: 100% 100%;
	mask-size: 100% 100%;
	-webkit-mask-repeat: no-repeat;
	mask-repeat: no-repeat;
}
.letter-handles {
	position: absolute;
	inset: 0;
	pointer-events: none;
}
.letter-handles > * {
	pointer-events: auto;
}
`;
