import { execFileSync } from "node:child_process";
import path from "node:path";
import pino from "pino";
import type { TransformPluginContext } from "rollup";
import type { Plugin } from "vite";
import { cargoBuild } from "./cargo-build";
import { findLibraryDependencies } from "./find-library-dependencies";
import { findProjectFilePath } from "./find-project-file-path";
import { HashSet } from "./hash-set";
import { findLibraryMetadata, findProjectMetadata } from "./metadata";
import {
	parsePluginOptions,
	type VitePluginCargoOptions,
	type VitePluginCargoOptionsInternal,
} from "./plugin-options";
import { createLibraryDir, isString } from "./utils";

export interface LibraryHashable {
	projectFilePath: string;
	libraryFilePath: string;
	cargoBuildTarget: string;
	cargoBuildProfile: string;
}

export interface PluginContext
	extends Omit<VitePluginCargoOptionsInternal, "logLevel"> {
	isServe: boolean;
	libraries: HashSet<LibraryHashable>;
	log: pino.Logger;
}

export function cargo(pluginOptions_: VitePluginCargoOptions): Plugin<never> {
	const {
		browserless,
		typescript,
		cargoBuildTarget,
		cargoBuildOverrides,
		...context
	} = parsePluginOptions(pluginOptions_);

	const log = pino({ level: context.logLevel });

	let isServe = false;
	const libraries = new HashSet<LibraryHashable>();

	return {
		name: "vite-plugin-cargo",
		configResolved(config) {
			isServe = config.command === "serve";
		},
		watchChange: {
			handler(id, change) {
				// todo: instead of watching just dependencies,
				// we need to watch all files and trigger rebuild when the dependencies change.
			},
		},
		async resolveId(source, importer) {
			// todo: wasm-bindgen could create many files which won't use the entrypoint. check if importer is in the outDir
			// check if this import came from one of our entrypoints
			const hash = libraries
				.entries()
				.find(([_hash, library]) => library.libraryFilePath === importer)?.[0];

			if (hash === undefined) {
				return null;
			}

			// ensure source is relative to wasm_bindgen output dir
			return path.resolve(createLibraryDir(hash), source);
		},
		transform: {
			filter: {
				id: context.pattern,
			},
			async handler(_code, libraryFilePath) {
				// todo: as user config
				const cargoBuildProfile =
					context.cargoBuildProfile ?? (isServe ? "release" : "dev");

				const projectFilePath = findProjectFilePath(libraryFilePath, log);

				const projectMetadata = findProjectMetadata(projectFilePath, log);

				// find the right library from our file
				// todo: don't use cargo build to find where deps should be
				// metadata should have enough in
				const libraryMetadata = findLibraryMetadata({
					projectMetadata,
					libraryFilePath,
					projectFilePath,
				});

				const cargoBuildTargetDir = projectMetadata.target_directory;
				const libraryTargetName = libraryMetadata.target.name;

				const libraryBuildDir = path.resolve(
					cargoBuildTargetDir,
					cargoBuildTarget,
					cargoBuildProfile,
				);

				// get workspace target dir from metadata
				cargoBuild({
					log,
					cargoBuildTarget,
					cargoBuildOverrides,
					cargoBuildProfile,
					projectFilePath,
				});

				const wasmFilePath: string = path.resolve(
					libraryBuildDir,
					`${libraryTargetName}.wasm`,
				);

				const libraryDepsDir = path.resolve(libraryBuildDir, "deps");

				const libraryFileDependencies = await findLibraryDependencies.call(
					this,
					{
						libraryDepsDir,
						libraryTargetName,
					},
				);

				log.debug({ libraryFileDependencies }, "watching-dependencies");

				// Watch for files only
				for (const libraryDependencies of libraryFileDependencies) {
					this.addWatchFile(libraryDependencies);
				}

				// keep track of libraries compiled
				// for resolving `wasm-bingen` files to `outDir`.
				const hash = libraries.add({
					projectFilePath,
					libraryFilePath,
					cargoBuildTarget,
					cargoBuildProfile,
				});

				const wasmBindgenOutDir = createLibraryDir(hash);

				log.debug({
					hash,
					libraryFilePath,
					wasmBindgenOutDir,
				});

				buildWasmBindgen({
					browserless,
					log,
					typescript,
					wasmBindgenOutDir,
					wasmFilePath,
				});

				// copy <name>.d.ts to the <id>.d.ts so user gets type definitions for their rust file.
				if (typescript) {
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
