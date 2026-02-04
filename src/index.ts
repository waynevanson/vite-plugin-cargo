import { execFileSync } from "node:child_process";
import path from "node:path";
import type { TransformPluginContext } from "rollup";
import type { Plugin } from "vite";
import { compileRustLibrary as buildRustLibrary } from "./compile-rust-library";
import { debug } from "./debug";
import { getLibraryData, getRustMetadata } from "./find-wasm-name";
import {
	createLibraryDir,
	createLibraryHash,
	type LibraryContextBase,
	type LibraryContextRustBuild,
	type LibraryContextWasmBuild,
	type LibraryDir,
} from "./library";
import {
	parsePluginOptions,
	type VitePluginCargoOptionsInternal as PluginOptions,
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

// use our own debugger for debugging.
export function cargo(pluginOptions_: VitePluginCargoOptions): Plugin<never> {
	const pluginOptions = parsePluginOptions(pluginOptions_);

	const context = {
		isServe: false,
		libraries: new Map<string, Library>(),
	};

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
			// todo: throw when importing a non-entry point.
			// todo: consider: way in the future we could enable users to import any rust file
			// and we'll add overrides instead of relying on Cargo.toml for `lib` information.
			async handler(_code, id) {
				const project = getClosestCargoProject(id);
				const libraryContextBase: LibraryContextBase = { id, project };

				const hash = createLibraryHash(libraryContextBase);
				const outDir = createLibraryDir(hash);

				debug("library %s", { hash, id, outDir });

				// keep track of libraries compiled
				// for resolving `wasm-bingen` files to `outDir`.
				context.libraries.set(hash, { id, outDir });

				const metadatas = getRustMetadata(libraryContextBase);

				// find the right library from our file
				const metadata = getLibraryData.call(
					this,
					metadatas,
					libraryContextBase,
				);

				const rustLibrary = await buildRustLibrary.call(
					this,
					libraryContextBase,
					context.isServe,
				);

				debug("watching-dependencies %s", rustLibrary.neighbours);

				// Watch for files only
				for (const neighbour of rustLibrary.neighbours) {
					this.addWatchFile(neighbour);
				}

				const libraryContextRustBuild: LibraryContextRustBuild = {
					id,
					outDir,
					project,
					wasm: rustLibrary.wasm,
				};

				buildWasmBindgen(pluginOptions, context, libraryContextRustBuild);

				const libraryContextWasmBuild: LibraryContextWasmBuild = {
					...libraryContextRustBuild,
					name: metadata.name,
				};

				// copy <name>.d.ts to the <id>.d.ts so user gets type definitions for their rust file.
				if (pluginOptions.typescript) {
					await copyTypescriptDeclaration.call(this, libraryContextWasmBuild);
				}

				// read `.js` entry point for code resolution
				const code = await readJavascriptEntryPoint.call(
					this,
					libraryContextWasmBuild,
				);

				return { code };
			},
		},
	};
}

async function readJavascriptEntryPoint(
	this: TransformPluginContext,
	library: LibraryContextWasmBuild,
) {
	const entrypoint = path.resolve(library.outDir, `${library.name}.js`);
	const content = await this.fs.readFile(entrypoint, {
		encoding: "utf8",
	});

	return content;
}

async function copyTypescriptDeclaration(
	this: TransformPluginContext,
	library: LibraryContextWasmBuild,
) {
	const source = path.join(library.outDir, `${library.name}.d.ts`);
	const target = `${library.id}.d.ts`;
	await this.fs.copyFile(source, target);
}

export function getClosestCargoProject(id: string) {
	const args = ["locate-project", "--message-format=plain"];

	debug("cargo %s", args.join(" "));

	const project = execFileSync("cargo", args, {
		stdio: ["ignore", "pipe", "ignore"],
		encoding: "utf-8",
		cwd: path.dirname(id),
	}).trim();

	debug("project %o", project);

	return project;
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

	debug("wasm-bindgen %s", args.join(" "));

	execFileSync("wasm-bindgen", args);
}
