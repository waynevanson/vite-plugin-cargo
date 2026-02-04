import path from "node:path";
import type { TransformPluginContext } from "rollup";
import type { LibraryContextBase } from "./library";

export async function deriveLibraryArtifact(
	this: TransformPluginContext,
	artifacts: Array<any>,
	options: LibraryContextBase,
) {
	// todo: validation and error messages
	const artifact = artifacts
		.filter((a) => a?.reason === "compiler-artifact")
		.filter((a) => a?.manifest_path === options.project)?.[0];

	// todo: hold paths here
	const libraryName = artifact.target.name;
	const wasmFilename: string = artifact?.filenames?.[0];

	const dependencyFilepath = path.resolve(
		wasmFilename,
		"../deps",
		`${libraryName}.d`,
	);

	const dependencies = await this.fs.readFile(dependencyFilepath, {
		encoding: "utf8",
	});

	const graph = createGraphFromDependencies(dependencies);

	const neighboursEntry = path.resolve(
		wasmFilename,
		"../deps",
		`${libraryName}.wasm`,
	);

	const neighbours = findAllDescendants(neighboursEntry, graph);

	return { wasmFilename, neighbours };
}

export function createGraphFromDependencies(contents: string) {
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

function findAllDescendants(start: string, graph: Map<string, Set<string>>) {
	const collecteds = new Set<string>();
	const initials = graph.get(start);

	if (initials === undefined) {
		throw new Error(`Expect the start value to exist in the dependency graph`);
	}

	const sources = new Set<string>(initials);

	while (sources.size > 0) {
		for (const source of sources) {
			// move from sources into collected
			collecteds.add(source);
			sources.delete(source);

			const targets = graph.get(source) ?? new Set();

			// filter out targets that may have been traversed
			const uncollecteds = targets.difference(collecteds);

			// queue files to be collected
			for (const uncollected of uncollecteds) {
				sources.add(uncollected);
			}
		}
	}

	return collecteds;
}
