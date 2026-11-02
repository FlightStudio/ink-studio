export const MERGE_FIELDS = {
	first_name: { label: "First name", sample: "Alex", longest: "Maximiliana" },
	last_name: {
		label: "Last name",
		sample: "Rivera",
		longest: "Wolfeschlegelstein",
	},
} as const satisfies Record<
	string,
	{ label: string; sample: string; longest: string }
>;

export type MergeFieldKey = keyof typeof MERGE_FIELDS;

export type MergeValues = Record<MergeFieldKey, string>;

function valuesOf(value: "sample" | "longest"): MergeValues {
	return Object.fromEntries(
		Object.entries(MERGE_FIELDS).map(([key, field]) => [key, field[value]]),
	) as MergeValues;
}

export const SAMPLE_MERGE_VALUES: MergeValues = valuesOf("sample");

export const LONGEST_MERGE_VALUES: MergeValues = valuesOf("longest");
