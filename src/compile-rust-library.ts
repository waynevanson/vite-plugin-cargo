import { execFileSync } from "node:child_process";
import path from "node:path";
import type { MetadaSchemaOptions } from "./types";
import { isString } from "./utils";
import { TransformPluginContext } from "rollup";
import { debug } from "./debug";
import { LibraryContextBase } from "./library";

export async function compileRustLibrary(
	this: TransformPluginContext,
	options: MetadaSchemaOptions,
	isServe: boolean,
) {
	// create `.wasm` from `.rs`
	const args = [
		"build",
		"--lib",
		"--target=wasm32-unknown-unknown",
		"--message-format=json",
		"--color=never",
		"--quiet",
		isServe || "--release",
	].filter(isString);

	debug("cargo %s", args.join(" "));

	const ndjson = execFileSync("cargo", args, {
		cwd: path.dirname(options.id),
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "ignore"],
	});

	debug("artifacts-ndjson %s", ndjson);

	// get name of `.wasm` file
	const json = ndjson
		.trim()
		.split("\n")
		.map((json) => JSON.parse(json));

	debug("artifacts %o", json);

	return json;
}

export async function processArtifacts(
	this: TransformPluginContext,
	artifacts: Array<any>,
	options: LibraryContextBase,
) {
	// todo: validation and error messages
	const artifact = artifacts
		.filter((a) => a?.reason === "compiler-artifact")
		.filter((a) => a?.manifest_path === options.project)?.[0];

	const libraryName = artifact.target.name;
	const wasmFileName: string = artifact?.filenames?.[0];

	const depcontents = await readDependenciesFile.call(this, artifact);

	const graph = createGraphFromDependencies(depcontents);

	const start = path.resolve(wasmFileName, "../deps", `${libraryName}.wasm`);
	const neighbours = getNeighbours(start, graph);

	return { wasm: wasmFileName, neighbours };
}

async function readDependenciesFile(
	this: TransformPluginContext,
	artifact: { target: { name: string }; filenames: Array<string> },
) {
	const libraryName = artifact.target.name;
	const wasmFilename: string = artifact?.filenames?.[0];
	const dependencyFilepath = path.resolve(
		wasmFilename,
		"../deps",
		`${libraryName}.d`,
	);

	const contents = await this.fs.readFile(dependencyFilepath, {
		encoding: "utf8",
	});

	return contents;
}

function createGraphFromDependencies(contents: string) {
	return new Map(
		contents
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [source, targets] = line.split(": ");
				return [
					path.resolve(source),
					new Set(targets?.split(" ").map((a) => path.resolve(a)) ?? []),
				] as const;
			}),
	);
}

function getNeighbours(start: string, graph: Map<string, Set<string>>) {
	const collected = new Set<string>();
	const initials = graph.get(start);

	if (initials === undefined) {
		throw new Error(`Expect the start value to exist in the dependency graph`);
	}

	const pendings = new Set<string>(initials);

	while (pendings.size > 0) {
		for (const pending of pendings) {
			collected.add(pending);
			pendings.delete(pending);
		}
	}

	return collected;
}
