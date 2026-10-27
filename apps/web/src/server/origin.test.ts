import { expect, it } from "vitest";
import { isPlatformOrigin } from "./origin.ts";

it("the platform's own origin is accepted", () => {
	expect(
		isPlatformOrigin(
			"https://studio.example.com",
			"https://studio.example.com",
		),
	).toBe(true);
});

it("localhost, 127.0.0.1 and ::1 stand for each other on the same port", () => {
	for (const platform of [
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"http://[::1]:3000",
	]) {
		expect(isPlatformOrigin("http://localhost:3000", platform)).toBe(true);
		expect(isPlatformOrigin("http://127.0.0.1:3000", platform)).toBe(true);
		expect(isPlatformOrigin("http://[::1]:3000", platform)).toBe(true);
	}
});

it("a loopback origin on another port or scheme is refused", () => {
	expect(
		isPlatformOrigin("http://localhost:3001", "http://127.0.0.1:3000"),
	).toBe(false);
	expect(
		isPlatformOrigin("https://localhost:3000", "http://127.0.0.1:3000"),
	).toBe(false);
});

it("a loopback origin is refused when the platform is not on loopback", () => {
	expect(
		isPlatformOrigin("http://localhost:3000", "http://192.168.1.20:3000"),
	).toBe(false);
});

it("another site, a missing origin and a malformed origin are refused", () => {
	expect(
		isPlatformOrigin("https://evil.example", "http://localhost:3000"),
	).toBe(false);
	expect(isPlatformOrigin(null, "http://localhost:3000")).toBe(false);
	expect(isPlatformOrigin("null", "http://localhost:3000")).toBe(false);
	expect(isPlatformOrigin("not a url", "http://localhost:3000")).toBe(false);
});
