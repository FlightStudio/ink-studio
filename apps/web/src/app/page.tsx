import { Title } from "@/components/shared/title";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	const session = await getSession();
	const studio = session?.userOrganization?.organization.name;
	return (
		<main>
			<Title>Ink Studio</Title>
			{session && studio ? (
				<p>
					{session.user.email} · {studio}
				</p>
			) : (
				<p>Run pnpm seed, then refresh this page.</p>
			)}
		</main>
	);
}
