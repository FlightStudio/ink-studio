import type { NextConfig } from "next";

const lanHost = process.env.DEV_LAN_HOST?.trim();

const nextConfig: NextConfig = {
	allowedDevOrigins: [
		"127.0.0.1",
		"host.docker.internal",
		...(lanHost ? [lanHost] : []),
	],
};

export default nextConfig;
