import { errorMessages } from "@repo/errors";
import type { Session } from "@repo/types";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "../env.ts";
import { getDb } from "./services.ts";

export class SessionError extends Error {
	readonly code: "unauthenticated" | "no_organization";

	constructor(code: "unauthenticated" | "no_organization") {
		super(errorMessages[code]);
		this.name = "SessionError";
		this.code = code;
	}
}

export const getSession = cache(async (): Promise<Session | null> => {
	const cookieStore = await cookies();
	const devUserCookie = cookieStore.get("dev_user")?.value;
	const devUserAllowed = env.NODE_ENV !== "production";
	const email =
		devUserAllowed && devUserCookie ? devUserCookie : env.DEV_USER_EMAIL;
	const db = getDb();
	const user = await db.users.byExternalId(`dev:${email}`);
	if (!user) return null;
	return {
		user,
		userOrganization: await db.organizationUsers.userOrganizationByUserId(
			user.id,
		),
	};
});

export async function getSessionOrRedirect(): Promise<Session> {
	const session = await getSession();
	if (!session) redirect("/");
	return session;
}

export async function requireSession(): Promise<Session> {
	const session = await getSession();
	if (!session) throw new SessionError("unauthenticated");
	return session;
}

export async function requireUserOrganization(): Promise<
	Session & { userOrganization: NonNullable<Session["userOrganization"]> }
> {
	const session = await requireSession();
	if (!session.userOrganization) throw new SessionError("no_organization");
	return { ...session, userOrganization: session.userOrganization };
}
