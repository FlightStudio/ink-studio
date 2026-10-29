import { PAGE_SPECS, type PageFormatId, type PageSpec } from "@repo/types";

export type ProductChoice = {
	format: PageFormatId;
	label: string;
	description: string;
	aspect: number;
};

function describe(spec: PageSpec): string {
	return spec.front === "image"
		? "A photo on the front, your words on the back"
		: `Up to ${spec.maxPages} sides of writing`;
}

export function productChoices(): ProductChoice[] {
	const rank = (format: PageFormatId) =>
		PAGE_SPECS[format].product === "letter" ? 0 : 1;
	return (Object.keys(PAGE_SPECS) as PageFormatId[])
		.sort((left, right) => rank(left) - rank(right))
		.map((format) => {
			const spec = PAGE_SPECS[format];
			return {
				format,
				label: spec.label,
				description: describe(spec),
				aspect: spec.widthIn / spec.heightIn,
			};
		});
}
