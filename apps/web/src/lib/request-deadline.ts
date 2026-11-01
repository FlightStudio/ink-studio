export const REQUEST_DEADLINE_MS = 30_000;

export async function requestDeadline<T>(
	request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
	try {
		return await request(controller.signal);
	} finally {
		clearTimeout(timer);
	}
}
