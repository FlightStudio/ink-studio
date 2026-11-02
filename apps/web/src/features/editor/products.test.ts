import { PAGE_SPECS } from "@repo/types";
import { expect, it } from "vitest";
import { productChoices } from "./products.ts";

it("letters come first, then postcards, one card per product", () => {
	expect(productChoices().map((choice) => choice.format)).toEqual([
		"thanksio:letter-windowless",
		"thanksio:postcard-6x9",
	]);
});

it("each card names the product once and says what it holds", () => {
	expect(
		productChoices().map(({ label, description }) => ({ label, description })),
	).toEqual([
		{ label: "Letter", description: "Up to 3 sides of writing" },
		{
			label: "Postcard 6 × 9",
			description: "A photo on the front, your words on the back",
		},
	]);
});

it("a card is drawn in the product's own shape", () => {
	const postcard = PAGE_SPECS["thanksio:postcard-6x9"];
	expect(productChoices()[1]?.aspect).toBe(
		postcard.widthIn / postcard.heightIn,
	);
});
