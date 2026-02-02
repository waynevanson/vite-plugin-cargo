import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import picomatch from "picomatch";
import * as v from "valibot";
import type { Plugin } from "vitest/config";

type MetadaSchemaOptions = { project: string; id: string };

// todo: Replace all schema with only parsing what we need to searching.
const MetadataSchema = (options: MetadaSchemaOptions) =>
	v.nonNullish(
		v.pipe(
			v.object({
				packages: v.array(
					v.pipe(
						v.object({
							manifest_path: v.string(),
							targets: v.array(
								v.object({
									kind: v.array(v.string()),
									name: v.string(),
									src_path: v.string(),
								}),
							),
						}),
						v.transform((package_) =>
							package_.targets.flatMap((target) =>
								target.kind.flatMap((kind) => ({
									manifest_path: package_.manifest_path,
									...target,
									kind,
								})),
							),
						),
					),
				),
			}),
			v.transform((packages) => packages.packages.flat()),
			v.findItem((metadata) =>
				v.is(
					v.object({
						manifest_path: v.literal(options.project),
						name: v.string(),
						src_path: v.literal(options.id),
						kind: v.literal("cdylib"),
					}),
					metadata,
				),
			),
		),
	);

function getClosestCargoProject(id: string) {
	return execFileSync("cargo", ["locate-project", "--message-format=plain"], {
		stdio: ["ignore", "pipe", "ignore"],
		encoding: "utf-8",
		cwd: path.dirname(id),
	}).trim();
}

// todo: what to do there's multiple libraries for the same file?
// Maybe add config force user to resolve this.
function ensureRustLibraryMetadata(options: MetadaSchemaOptions) {
	// validate if the file is the entrypoint to a cdylib target as rust lib
	const metacontent = execFileSync(
		"cargo",
		["metadata", "--no-deps", "--format-version=1"],
		{
			cwd: path.dirname(options.id),
			encoding: "utf-8",
		},
	).trim();

	// find the right library from our file
	const metadata = v.parse(MetadataSchema(options), JSON.parse(metacontent));

	return metadata;
}

function compileLibrary(options: MetadaSchemaOptions, isServe: boolean) {
	// create `.wasm` from `.rs`
	const ndjson = execFileSync(
		"cargo",
		[
			"build",
			"--lib",
			"--target=wasm32-unknown-unknown",
			"--message-format=json",
			"--color=never",
			"--quiet",
			isServe || "--release",
		].filter((a): a is string => typeof a === "string"),
		{
			cwd: path.dirname(options.id),
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		},
	);

	const json = ndjson
		.trim()
		.split("\n")
		.map((json) => JSON.parse(json));

	// find the `.wasm` file
	const filename: string = json
		.filter((a) => a?.reason === "compiler-artifact")
		.filter((a) => a?.manifest_path === options.project)[0]?.filenames?.[0];

	return filename;
}

export type VitePluginCargoOptions = {
	includes: picomatch.Glob;
	browserOnly?: boolean;
	noTypescript?: boolean;
} & (
	| { noDefaultFeatures?: boolean; features?: Array<string> }
	| { allFeatures: true }
);

// 1. Plugin for Rust -> WASM -> WASM + ESM
// Dependencies:
// 1. `cargo`
// 2. `wasm_bindgen`
export function cargo(pluginOptions: VitePluginCargoOptions): Plugin<never> {
	const matches = picomatch(pluginOptions.includes, { contains: true });
	const typescript = !(pluginOptions?.noTypescript ?? false);

	let isServe = false;

	const libraries = new Map<
		string,
		{ outDir: string; project: string; id: string }
	>();

	return {
		name: "vite-plugin-cargo",
		configResolved(config) {
			isServe = config.command === "serve";
		},

		async resolveId(source, importer) {
			// check if this import came from one of our entrypoints
			const entry = libraries
				.values()
				.find((library) => library.id === importer);

			if (entry === undefined) {
				return null;
			}

			// ensure source is relative to wasm_bindgen output dir
			return path.resolve(entry.outDir, source);
		},

		async transform(_code, id) {
			if (!matches(id)) {
				return null;
			}

			const project = getClosestCargoProject(id);
			const options = { id, project };
			const metadata = ensureRustLibraryMetadata(options);
			const hash = createHash("sha256")
				.update(`${project}:${id}`)
				.digest("hex");

			const outDir = path.resolve(
				`node_modules/.cache/vite-plugin-cargo/${hash}`,
			);

			libraries.set(hash, { id, outDir, project });

			const wasm = compileLibrary(options, isServe);

			// create `.js` from `.wasm`
			//
			// `.js` and `.wasm` files are created in outDir,
			// and added to dependency graph from imports in the `.js` entrypoint.
			execFileSync(
				"wasm-bindgen",
				[
					"--target=bundler",
					`--out-dir=${outDir}`,
					isServe && `--debug`,
					typescript || `--no-typescript`,
					pluginOptions.browserOnly && `--browser`,
					wasm,
				].filter((a): a is string => typeof a === "string"),
			);

			const entrypoint = path.resolve(outDir, `${metadata.name}.js`);
			const content = await this.fs.readFile(entrypoint, { encoding: "utf8" });

			// `.d.ts` from `wasm_bindgen` aren't read I believe, so we emit them ourselves.
			// todo: only emit the files we load. Currently we assume they're all loaded.
			if (typescript) {
				// add `.d.ts` to files
				const filenames = await this.fs.readdir(outDir);
				await Promise.all(
					filenames
						.filter((filename) => filename.endsWith(".d.ts"))
						.map(
							async (filename) =>
								await this.load({ id: path.resolve(outDir, filename) }),
						),
				);

				// copy <name>.d.ts to the <id>.d.ts so user gets type definitions
				const source = path.join(outDir, `${metadata.name}.d.ts`);
				const target = `${id}.d.ts`;
				await this.fs.copyFile(source, target);
			}

			return {
				code: content,
			};
		},
	};
}
