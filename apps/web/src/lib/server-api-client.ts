import { healthSchema } from "@repo/api";

export async function getServerHealth(origin: string) {
	const response = await fetch(new URL("/api/health", origin));
	if (!response.ok) {
		throw new Error(`health responded ${response.status}`);
	}
	return healthSchema.parse(await response.json());
}
