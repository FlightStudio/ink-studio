const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseOrigin(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

export function isPlatformOrigin(
	origin: string | null,
	platformUrl: string,
): boolean {
	if (origin === null) return false;
	const request = parseOrigin(origin);
	const platform = new URL(platformUrl);
	if (request === null || request.origin !== origin) return false;
	if (request.origin === platform.origin) return true;
	return (
		LOOPBACK_HOSTS.has(platform.hostname) &&
		LOOPBACK_HOSTS.has(request.hostname) &&
		request.protocol === platform.protocol &&
		request.port === platform.port
	);
}
