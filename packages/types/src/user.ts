export type User = {
	id: string;
	externalId: string;
	email: string;
	name: string;
};

export type NewUser = {
	externalId: string;
	email: string;
	name: string;
};
