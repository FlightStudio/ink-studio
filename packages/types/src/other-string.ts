declare const otherStringBrand: unique symbol;

export type OtherString = string & {
	readonly [otherStringBrand]: "OtherString";
};

export function asOtherString(value: string): OtherString {
	return value as OtherString;
}
