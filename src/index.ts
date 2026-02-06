import { execFileSync } from "node:child_process";
import path from "node:path";
import pino from "pino";
import type { TransformPluginContext } from "rollup";
import type { Plugin } from "vite";
import { deriveLibraryArtifact as findLibraryArtifact } from "./artifacts";
import { cargoBuild, cargoLocateProject, cargoMetadata } from "./cargo";
import {
	createLibraryDir,
	createLibraryHash,
	type LibraryContextBase,
	type LibraryContextRustBuild,
	type LibraryContextWasmBuild,
	type LibraryDir,
} from "./library";
import { findLibraryMetadata } from "./metadata";
import {
	parsePluginOptions,
	type VitePluginCargoOptions,
	type VitePluginCargoOptionsInternal,
} from "./plugin-options";
import { isString } from "./utils";

export interface Library {
	id: string;
	outDir: LibraryDir;
}

export interface PluginContext
	extends Omit<VitePluginCargoOptionsInternal, "logLevel"> {
	isServe: boolean;
	libraries: Map<string, Library>;
	log: pino.Logger;
}

function createPluginContext(
	pluginOptions: VitePluginCargoOptions,
): PluginContext {
	const options = parsePluginOptions(pluginOptions);

	const log = pino({ level: options.logLevel });

	//@ts-expect-error
	delete options.logLevel;

	const data = {
		...options,
		libraries: new Map<string, Library>(),
		log,
		isServe: false,
	};

	return data;
}

export function cargo(pluginOptions_: VitePluginCargoOptions): Plugin<never> {
	const pluginContext = createPluginContext(pluginOptions_);

	return {
		name: "vite-plugin-cargo",
		configResolved(config) {
			pluginContext.isServe = config.command === "serve";
		},
		async resolveId(source, importer) {
			// check if this import came from one of our entrypoints
			const outDir = pluginContext.libraries
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
				id: pluginContext.pattern,
			},
			async handler(_code, id) {
				const project = cargoLocateProject(id, pluginContext);
				const libraryContextBase: LibraryContextBase = { id, project };

				const hash = createLibraryHash(libraryContextBase);
				const outDir = createLibraryDir(hash);

				pluginContext.log.debug({ hash, id, outDir });

				// keep track of libraries compiled
				// for resolving `wasm-bingen` files to `outDir`.
				pluginContext.libraries.set(hash, { id, outDir });

				const projectMetadata = cargoMetadata(
					libraryContextBase,
					pluginContext,
				);

				// find the right library from our file
				const libraryMetadata = findLibraryMetadata(
					projectMetadata,
					libraryContextBase,
				);

				const artifacts = await cargoBuild(libraryContextBase, pluginContext);

				const rustLibrary = await findLibraryArtifact.call(
					this,
					artifacts,
					libraryContextBase,
				);

				pluginContext.log.debug(
					{ dependencies: rustLibrary.neighbours },
					"watching-dependencies",
				);

				// Watch for files only
				for (const neighbour of rustLibrary.neighbours) {
					this.addWatchFile(neighbour);
				}

				const libraryContextRustBuild: LibraryContextRustBuild = {
					id,
					outDir,
					project,
					wasm: rustLibrary.wasmFilename,
				};

				buildWasmBindgen(pluginContext, libraryContextRustBuild);

				const libraryContextWasmBuild: LibraryContextWasmBuild = {
					...libraryContextRustBuild,
					name: libraryMetadata.name,
				};

				// copy <name>.d.ts to the <id>.d.ts so user gets type definitions for their rust file.
				if (pluginContext.typescript) {
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

// create `.js` from `.wasm`
//
// `.js` and `.wasm` files are created in outDir,
// and added to dependency graph from imports in the `.js` entrypoint.
export function buildWasmBindgen(
	data: PluginContext,
	library: LibraryContextRustBuild,
) {
	const args = [
		"--target=bundler",
		data.typescript || `--no-typescript`,
		data.browserless || `--browser`,
		data.isServe && `--debug`,
		`--out-dir=${library.outDir}`,
		library.wasm,
	].filter(isString);

	data.log.debug({ args }, "wasm-bindgen");

	execFileSync("wasm-bindgen", args);
}
