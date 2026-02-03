import { execFileSync } from "node:child_process";
import { globSync } from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import type { Plugin } from "vite";
import { compileRustLibrary as buildRustLibrary } from "./compile-rust-library";
import { ensureRustLibraryMetadata } from "./find-wasm-name";
import {
	createLibraryDir,
	createLibraryHash,
	type LibraryContextBase,
	type LibraryContextRustBuild,
	type LibraryDir,
} from "./library";
import {
	type VitePluginCargoOptionsInternal as PluginOptions,
	parsePluginOptions,
	type VitePluginCargoOptions,
} from "./plugin-options";
import { isString } from "./utils";

export interface Library {
	id: string;
	outDir: LibraryDir;
}

export interface PluginContext {
	isServe: boolean;
	libraries: Map<string, Library>;
}

export function cargo(pluginOptions_: VitePluginCargoOptions): Plugin<never> {
	const pluginOptions = parsePluginOptions(pluginOptions_);
	const matches = picomatch(pluginOptions.includes, { contains: true });

	const context = {
		isServe: false,
		libraries: new Map<string, Library>(),
	};

	console.log("wadup");
	return {
		name: "vite-plugin-cargo",
		configResolved(config) {
			context.isServe = config.command === "serve";
		},
		async resolveId(source, importer) {
			// check if this import came from one of our entrypoints
			const outDir = context.libraries
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
				// todo: consider: way in the future we could enable users to import any rust file
				// and we'll add overrides instead of relying on Cargo.toml for `lib` information.
				if (!matches(id)) {
					return null;
				}

				const project = getClosestCargoProject(id);
				const libraryContextBase: LibraryContextBase = { id, project };

				const hash = createLibraryHash(libraryContextBase);
				const outDir = createLibraryDir(hash);

				// keep track of libraries compiled
				// for resolving `wasm-bingen` files to `outDir`.
				context.libraries.set(hash, { id, outDir });

				const metadata = ensureRustLibraryMetadata(libraryContextBase);

				const wasm = buildRustLibrary(libraryContextBase, context.isServe);

				// todo: filter watchable files by dependencies
				// after building rust, check the `deps/<crate-identifier>.d` for makefile dependency graph.
				for (const basename of globSync(pluginOptions.includes)) {
					this.addWatchFile(path.resolve(basename));
				}

				const libraryContextRustBuild: LibraryContextRustBuild = {
					id,
					outDir,
					project,
					wasm,
				};

				buildWasmBindgen(pluginOptions, context, libraryContextRustBuild);

				// read `.js` entry point for code resolution
				const entrypoint = path.resolve(outDir, `${metadata.name}.js`);
				const content = await this.fs.readFile(entrypoint, {
					encoding: "utf8",
				});

				// copy <name>.d.ts to the <id>.d.ts so user gets type definitions for their rust file.
				if (pluginOptions.typescript) {
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
export function buildWasmBindgen(
	options: PluginOptions,
	context: PluginContext,
	library: LibraryContextRustBuild,
) {
	const args = [
		"--target=bundler",
		options.typescript || `--no-typescript`,
		options.browserless || `--browser`,
		context.isServe && `--debug`,
		`--out-dir=${library.outDir}`,
		library.wasm,
	].filter(isString);

	execFileSync("wasm-bindgen", args);
}
