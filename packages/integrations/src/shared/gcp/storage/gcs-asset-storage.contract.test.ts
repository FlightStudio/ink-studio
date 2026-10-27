import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
	GenericContainer,
	type StartedTestContainer,
	Wait,
} from "testcontainers";
import { afterAll, beforeAll, expect, it } from "vitest";
import { GcsAssetStorage } from "./gcs-asset-storage.ts";

const bucket = "ink-studio-assets";
const projectId = "ink-studio-test";
const clientEmail = "contract-test@ink-studio-test.iam.gserviceaccount.com";

let container: StartedTestContainer;
let emulatorBaseUrl: string;
let storage: GcsAssetStorage;

beforeAll(async () => {
	container = await new GenericContainer("fsouza/fake-gcs-server:1.56.1")
		.withCommand([
			"-scheme",
			"http",
			"-port",
			"4443",
			"-public-host",
			"localhost:4443",
			"-cors-headers",
			"Content-Type",
		])
		.withExposedPorts(4443)
		.withWaitStrategy(Wait.forHttp("/storage/v1/b", 4443))
		.start();
	emulatorBaseUrl = `http://${container.getHost()}:${container.getMappedPort(4443)}`;
	const created = await fetch(
		`${emulatorBaseUrl}/storage/v1/b?project=${projectId}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: bucket }),
		},
	);
	expect(created.ok).toBe(true);
	storage = new GcsAssetStorage({ bucket, projectId, emulatorBaseUrl });
});

afterAll(async () => {
	await container?.stop();
});

it("a stored object reads back byte for byte", async () => {
	const key = "organizations/org-1/assets/asset-1";
	const bytes = new Uint8Array(randomBytes(70_000));
	await storage.put({ key, bytes, contentType: "image/png" });
	expect(await storage.get(key)).toEqual(bytes);
	const response = await fetch(
		await storage.signedReadUrl({ key, expiresInSeconds: 300 }),
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("image/png");
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});

it("a signed URL signs with real credentials", async () => {
	const { privateKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	});
	const signing = new GcsAssetStorage({
		bucket,
		projectId,
		credentials: { client_email: clientEmail, private_key: privateKey },
	});
	const url = new URL(
		await signing.signedReadUrl({
			key: "organizations/org-1/assets/asset-1",
			expiresInSeconds: 300,
		}),
	);
	expect(url.searchParams.get("X-Goog-Algorithm")).toBe("GOOG4-RSA-SHA256");
	expect(url.searchParams.get("X-Goog-Credential")).toMatch(
		new RegExp(`^${clientEmail}/\\d{8}/auto/storage/goog4_request$`),
	);
	expect(url.searchParams.get("X-Goog-Expires")).toBe("300");
	expect(url.searchParams.get("X-Goog-Signature")).toMatch(/^[0-9a-f]{512}$/);
	expect(url.pathname).toBe(`/${bucket}/organizations/org-1/assets/asset-1`);
});

it("the emulator answers a browser's cross-origin read", async () => {
	const key = "organizations/org-1/assets/asset-cors";
	await storage.put({
		key,
		bytes: new Uint8Array([1, 2, 3]),
		contentType: "image/png",
	});
	const response = await fetch(
		await storage.signedReadUrl({ key, expiresInSeconds: 300 }),
		{ headers: { Origin: "http://localhost:3000" } },
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("access-control-allow-origin")).not.toBeNull();
});
