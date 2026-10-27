export class UniqueViolationError extends Error {
	readonly constraint: string;

	constructor(constraint: string) {
		super(constraint);
		this.name = "UniqueViolationError";
		this.constraint = constraint;
	}
}
