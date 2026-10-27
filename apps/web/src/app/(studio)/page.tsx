import { Desk } from "@repo/ui/components/desk";
import Link from "next/link";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	const session = await getSession();
	const studio = session?.userOrganization?.organization.name;
	return (
		<Desk className="grid place-items-center px-6 py-16">
			<main className="flex w-full max-w-md flex-col items-center gap-3 text-center">
				{session && studio ? (
					<>
						<p className="text-label text-ink-muted">Signed in</p>
						<h1 className="font-display text-display">Ink Studio</h1>
						<p className="text-ui text-ink-muted">
							{session.user.email} · {studio}
						</p>
					</>
				) : (
					<>
						<h1 className="font-display text-display">Nobody is signed in</h1>
						<p className="text-ui text-ink-muted">
							Run pnpm seed, then refresh this page.
						</p>
					</>
				)}
				<Link
					href="/styleguide"
					className="mt-6 rounded-full bg-paper px-4 py-2 text-ui shadow-float transition-shadow duration-(--duration-quick) hover:shadow-none focus-visible:outline-2 focus-visible:outline-ring"
				>
					Open the style guide
				</Link>
			</main>
		</Desk>
	);
}
