import type { LetterContent, PageFormatId, ParagraphNode } from "@repo/types";
import { DEFAULT_FORMAT, PAGE_SPECS } from "@repo/types";

export type LetterFixture = {
	name: string;
	format: PageFormatId;
	text: string;
	sides: number;
};

const SENTENCES = [
	"The garden has finally woken up after the long grey winter.",
	"Every morning I take my coffee out to the bench by the fence and watch the sparrows argue over the feeder.",
	"Your last letter made me laugh out loud on the bus, and a stranger asked me what was so funny.",
	"I have been meaning to write back for weeks, but the days keep slipping through my fingers like sand.",
	"We repainted the kitchen a soft yellow, and it feels like sunlight even when it rains.",
	"The little bakery on the corner still makes those cinnamon knots you loved, so I bought two and ate both in your honour.",
	"Do you remember the summer we tried to build a raft and it sank before we left the shallows?",
	"I found the photograph of us on the pier, squinting into the wind with our hair everywhere.",
	"Mum sends her love and wants to know when you are coming home for a proper visit.",
	"The river path is flooded again, so I walk the long way round past the old church and the allotments.",
	"I started knitting a scarf in January and it is now long enough to wrap around the house twice.",
	"Write soon and tell me everything, especially the small things nobody else would think to mention.",
];

const SENTENCES_PER_PARAGRAPH = 4;
const SIDE_CHARACTERS = 1300;

function prose(characters: number): string {
	const paragraphs: string[] = [];
	let sentence = 0;
	let length = 0;
	while (length < characters) {
		const parts: string[] = [];
		for (let index = 0; index < SENTENCES_PER_PARAGRAPH; index += 1) {
			parts.push(SENTENCES[sentence % SENTENCES.length] ?? "");
			sentence += 1;
		}
		const paragraph = parts.join(" ");
		paragraphs.push(paragraph);
		length += paragraph.length;
	}
	const text = paragraphs.join("\n");
	const cut = text.lastIndexOf(" ", Math.round(characters));
	return `${text.slice(0, cut).replace(/[.,;?!]$/u, "")}.`;
}

function letter(sides: number): string {
	return `Dear Alex,\n${prose(sides * SIDE_CHARACTERS)}\nLove,\nSam`;
}

const { maxPages } = PAGE_SPECS[DEFAULT_FORMAT];

export const LETTER_FIXTURES = [
	{
		name: "note",
		format: DEFAULT_FORMAT,
		text: "Dear Alex,\n\nThank you for the tea. It was perfect.\n\nLove,\nSam",
		sides: 1,
	},
	{
		name: "one-side",
		format: DEFAULT_FORMAT,
		text: letter(0.75),
		sides: 1,
	},
	{
		name: "blank-lines",
		format: DEFAULT_FORMAT,
		text: "Dear Alex,\n\nThis line   has   runs   of   spaces.\n\n\nTwo empty lines sit above this one.\n\nLove,\nSam",
		sides: 1,
	},
	{
		name: "one-and-a-half",
		format: DEFAULT_FORMAT,
		text: letter(1.5),
		sides: 2,
	},
	{
		name: "nearly-full",
		format: DEFAULT_FORMAT,
		text: letter(maxPages - 0.2),
		sides: maxPages,
	},
	{
		name: "overflow",
		format: DEFAULT_FORMAT,
		text: letter(maxPages + 0.5),
		sides: maxPages,
	},
	{
		name: "postcard-back",
		format: "thanksio:postcard-6x9",
		text: `Dear Alex,\n${prose(500)}\nLove, Sam`,
		sides: 2,
	},
] as const satisfies readonly LetterFixture[];

export type LetterFixtureName = (typeof LETTER_FIXTURES)[number]["name"];

export function letterFixture(name: LetterFixtureName): LetterFixture {
	const fixture = LETTER_FIXTURES.find((item) => item.name === name);
	if (!fixture) throw new Error(`No letter fixture named ${name}`);
	return fixture;
}

function paragraphOf(line: string): ParagraphNode {
	return line === ""
		? { type: "paragraph", attrs: { align: "left" } }
		: {
				type: "paragraph",
				attrs: { align: "left" },
				content: [{ type: "text", text: line }],
			};
}

export function fixtureContent(fixture: LetterFixture): LetterContent {
	return {
		schemaVersion: 1,
		format: fixture.format,
		defaults: {
			font: { kind: "stock", id: "caveat" },
			sizePt: 20,
			color: "ink-blue",
		},
		doc: {
			type: "doc",
			attrs: { elements: [], minSides: 1, frontImageAssetId: null },
			content: fixture.text.split("\n").map(paragraphOf),
		},
	};
}
