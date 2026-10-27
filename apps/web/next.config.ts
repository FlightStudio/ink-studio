import type { NextConfig } from "next";

const lanHost = process.env.DEV_LAN_HOST?.trim();

const nextConfig: NextConfig = {
	allowedDevOrigins: [
		"127.0.0.1",
		"host.docker.internal",
		...(lanHost ? [lanHost] : []),
	],
	outputFileTracingIncludes: {
		"/fonts/stock/[fontId]": ["../../packages/render/fonts/*.ttf"],
	},
};

export default nextConfig;
