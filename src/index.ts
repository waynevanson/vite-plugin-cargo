import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import { globSync } from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import type { Plugin } from "vite";
import { compileRustLibrary as buildRustLibrary } from "./compile-rust-library";
import { ensureRustLibraryMetadata } from "./find-wasm-name";
import {
	parsePluginOptions,
	type VitePluginCargoOptions,
} from "./plugin-options";
import type { MetadaSchemaOptions } from "./types";

const CACHE_DIR = "node_modules/.cache/vitest-plugin-cargo";

// 1. Plugin for Rust -> WASM -> WASM + ESM
// Dependencies:
// 1. `cargo`
// 2. `wasm_bindgen`
// todo: ensure that all rust files required match.
// the transform?

function createProjectHash(options: MetadaSchemaOptions) {
	return crypto
		.createHash("sha256")
		.update(`${options.project}:${options.id}`)
		.digest("hex");
}

interface Library {
	id: string;
	outDir: string;
}

export function cargo(pluginOptions_: VitePluginCargoOptions): Plugin<never> {
	const pluginOptions = parsePluginOptions(pluginOptions_);
	const matches = picomatch(pluginOptions.includes, { contains: true });
	const typescript = !(pluginOptions?.noTypescript ?? false);

	let isServe = false;

	const libraries = new Map<string, Library>();

	return {
		name: "vite-plugin-cargo",
		configResolved(config) {
			isServe = config.command === "serve";
		},
		async resolveId(source, importer) {
			// check if this import came from one of our entrypoints
			const outDir = libraries
				.values()
				.find((library) => library.id === importer)?.outDir;

			if (outDir === undefined) {
				return null;
			}

			// ensure source is relative to wasm_bindgen output dir
			return path.resolve(outDir, source);
		},
		transform: {
			filter: {
				id: pluginOptions.includes,
			},
			async handler(_code, id) {
				// todo: throw when importing a non-entry point.
				// todo: way in the future we could enable users to import any rust file
				// and we'll add overrides instead of relying on Cargo.toml for `lib` information.
				if (!matches(id)) {
					return null;
				}

				const project = getClosestCargoProject(id);

				const options = { id, project };

				const metadata = ensureRustLibraryMetadata(options);

				const wasm = buildRustLibrary(options, isServe);

				// todo: filter watchable files by dependencies
				// after building rust, check the `deps/<crate-identifier>.d` for makefile dependency graph.
				for (const basename of globSync(pluginOptions.includes)) {
					this.addWatchFile(path.resolve(basename));
				}

				const hash = createProjectHash(options);

				const outDir = path.resolve(CACHE_DIR, hash);

				// keep track of libraries compiled
				// for resolving `wasm-bingen` files to `outDir`.
				libraries.set(hash, { id, outDir });

				buildWasmBindgen({
					browserOnly: pluginOptions.browserOnly,
					isServe,
					outDir,
					typescript,
					wasm,
				});

				// read `.js` entry point for code resolution
				const entrypoint = path.resolve(outDir, `${metadata.name}.js`);
				const content = await this.fs.readFile(entrypoint, {
					encoding: "utf8",
				});

				// copy <name>.d.ts to the <id>.d.ts so user gets type definitions for their rust file.
				if (typescript) {
					const source = path.join(outDir, `${metadata.name}.d.ts`);
					const target = `${id}.d.ts`;
					await this.fs.copyFile(source, target);
				}

				return {
					code: content,
				};
			},
		},
	};
}

export function getClosestCargoProject(id: string) {
	return execFileSync("cargo", ["locate-project", "--message-format=plain"], {
		stdio: ["ignore", "pipe", "ignore"],
		encoding: "utf-8",
		cwd: path.dirname(id),
	}).trim();
}

// create `.js` from `.wasm`
//
// `.js` and `.wasm` files are created in outDir,
// and added to dependency graph from imports in the `.js` entrypoint.
export function buildWasmBindgen(options: {
	outDir: string;
	isServe: boolean;
	typescript: boolean;
	browserOnly: boolean;
	wasm: string;
}) {
	const args = [
		"--target=bundler",
		`--out-dir=${options.outDir}`,
		options.isServe && `--debug`,
		options.typescript || `--no-typescript`,
		options.browserOnly && `--browser`,
		options.wasm,
	].filter((a): a is string => typeof a === "string");

	execFileSync("wasm-bindgen", args);
}
