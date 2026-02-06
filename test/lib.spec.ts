import path from "node:path";
import { build } from "vite";
import wasm from "vite-plugin-wasm";
import { describe, expect, test } from "vitest";
import { cargo } from "../src/index";

describe("lib", () => {
	test("should bundle rust to wasm", async () => {
		const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lib");

		await expect(
			build({
				root: FIXTURE,
				logLevel: "silent",
				plugins: [
					cargo({
						pattern: "**/src/lib.rs",
						cargoBuildProfile: "jesus",
					}),
					wasm(),
				],
				build: {
					lib: {
						entry: "./src/lib.rs",
						formats: ["es"],
						fileName: "index",
					},
				},
			}),
		).resolves.not.toThrow();
	});
});
