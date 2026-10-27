import { logger } from "@/lib/logger";

export function GET() {
	logger.info("health");
	return Response.json({ ok: true });
}
