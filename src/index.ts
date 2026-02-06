import { execFileSync } from "node:child_process";
import path from "node:path";
import pino from "pino";
import type { TransformPluginContext } from "rollup";
import type { BuildAppHook, Plugin } from "vite";
import { deriveLibraryArtifact as findLibraryArtifact } from "./artifacts";
import { cargoBuild } from "./build-library";
import { findProjectFilePath } from "./find-project-file-path";
import {
	createLibraryDir,
	createLibraryHash,
	type LibraryContextRustBuild,
	type LibraryContextWasmBuild,
	type LibraryDir,
} from "./library";
import { findLibraryMetadata, findProjectMetadata } from "./metadata";
import {
	parsePluginOptions,
	type VitePluginCargoOptions,
	type VitePluginCargoOptionsInternal,
} from "./plugin-options";
import { isString } from "./utils";

export interface Library {
	libraryFilePath: string;
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
			// todo: wasm-bindgen could create many files which won't use the entrypoint. check if importer is in the outDir
			// check if this import came from one of our entrypoints
			const outDir = pluginContext.libraries
				.values()
				.find((library) => library.libraryFilePath === importer)?.outDir;

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
			// 3 Steps
			// 1. Validate we're in a valid rust library based on the libraryFilePath
			// 2. `cargo build`
			// 3. `wasm-bindgen`
			// 4. Link it all together
			async handler(_code, libraryFilePath) {
				const projectFilePath = findProjectFilePath(
					libraryFilePath,
					pluginContext.log,
				);

				const projectMetadata = findProjectMetadata(
					projectFilePath,
					pluginContext.log,
				);

				// find the right library from our file
				// todo: don't use cargo build to find where deps should be
				// metadata should have enough in
				const libraryMetadata = findLibraryMetadata(projectMetadata, {
					libraryFilePath,
					projectFilePath,
				});

				// todo: as user config
				const cargoBuildTarget = "wasm32-unknown-unknown";
				const cargoBuildProfile =
					pluginContext.cargoBuildProfile ??
					(pluginContext.isServe ? "release" : "dev");

				const cargoBuildTargetDir = projectMetadata.target_directory;

				cargoBuild({
					cargoBuildTarget,
					cargoBuildOverrides: pluginContext.cargoBuildOverrides,
					cargoBuildProfile,
					isServe: pluginContext.isServe,
					log: pluginContext.log,
					projectFilePath,
					profile: pluginContext.cargoBuildProfile,
				});

				const rustLibrary = await findLibraryArtifact.call(this, {
					cargoBuildTarget,
					cargoBuildProfile,
					libraryMetadata,
					libraryFilePath,
					projectFilePath,
					cargoBuildTargetDir,
				});

				pluginContext.log.debug(
					{ dependencies: rustLibrary.neighbours },
					"watching-dependencies",
				);

				// Watch for files only
				for (const neighbour of rustLibrary.neighbours) {
					this.addWatchFile(neighbour);
				}

				// todo: use HashSet instead of Map
				const hash = createLibraryHash({
					projectFilePath,
					libraryFilePath,
				});

				const wasmBindgenOutDir = createLibraryDir(hash);

				pluginContext.log.debug({
					hash,
					libraryFilePath,
					outDir: wasmBindgenOutDir,
				});

				// keep track of libraries compiled
				// for resolving `wasm-bingen` files to `outDir`.
				pluginContext.libraries.set(hash, {
					libraryFilePath,
					outDir: wasmBindgenOutDir,
				});

				const libraryTargetName = libraryMetadata.target.name;

				buildWasmBindgen({
					browserless: pluginContext.browserless,
					log: pluginContext.log,
					typescript: pluginContext.typescript,
					wasmBindgenOutDir,
					wasmFilePath: rustLibrary.wasmFilename,
				});

				// copy <name>.d.ts to the <id>.d.ts so user gets type definitions for their rust file.
				if (pluginContext.typescript) {
					await copyTypescriptDeclaration.call(this, {
						wasmBindgenOutDir,
						libraryTargetName,
						libraryFilePath,
					});
				}

				// read `.js` entry point for code resolution
				const code = await readJavascriptEntryPoint.call(this, {
					libraryTargetName,
					wasmBindgenOutDir,
				});

				return { code };
			},
		},
	};
}

async function readJavascriptEntryPoint(
	this: TransformPluginContext,
	library: { wasmBindgenOutDir: string; libraryTargetName: string },
) {
	const entrypoint = path.resolve(
		library.wasmBindgenOutDir,
		`${library.libraryTargetName}.js`,
	);
	const content = await this.fs.readFile(entrypoint, {
		encoding: "utf8",
	});

	return content;
}

// todo: add banner to this file so users don't try to use it.
async function copyTypescriptDeclaration(
	this: TransformPluginContext,
	library: {
		wasmBindgenOutDir: string;
		libraryTargetName: string;
		libraryFilePath: string;
	},
) {
	const source = path.join(
		library.wasmBindgenOutDir,
		`${library.libraryTargetName}.d.ts`,
	);

	const target = `${library.libraryFilePath}.d.ts`;
	await this.fs.copyFile(source, target);
	this.addWatchFile(target);
}

// create `.js` from `.wasm`
//
// `.js` and `.wasm` files are created in outDir,
// and added to dependency graph from imports in the `.js` entrypoint.
export function buildWasmBindgen(input: {
	typescript: boolean;
	browserless: boolean;
	wasmBindgenOutDir: string;
	wasmFilePath: string;
	log: pino.Logger;
}) {
	const args = [
		"--target=bundler",
		input.typescript || `--no-typescript`,
		input.browserless || `--browser`,
		`--out-dir=${input.wasmBindgenOutDir}`,
		input.wasmFilePath,
	].filter(isString);

	input.log.debug({ args }, "wasm-bindgen");

	execFileSync("wasm-bindgen", args);
}
