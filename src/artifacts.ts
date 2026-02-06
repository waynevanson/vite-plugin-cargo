import path from "node:path";
import type { TransformPluginContext } from "rollup";
import * as v from "valibot";
import type { LibraryContextBase } from "./library";
import { findOnlyOne } from "./utils";

export const CompilerArtifact = v.object({
	reason: v.literal("compiler-artifact"),
	manifest_path: v.string(),
	filenames: v.array(v.string()),
	target: v.object({
		name: v.string(),
		src_path: v.string(),
	}),
});

export const Artifacts = v.pipe(
	v.array(v.unknown()),
	v.transform((array) => array.filter((item) => v.is(CompilerArtifact, item))),
);

const createArtifactSchema = (options: {
	libraryFilePath: string;
	projectFilePath: string;
}) =>
	v.object({
		// todo: do we really need to verify this?
		// I mean the library will always be our project.
		// I guess it doesn't hurt.
		manifest_path: v.literal(options.projectFilePath),
		filenames: v.array(v.string()),
		target: v.object({
			name: v.string(),
			src_path: v.literal(options.libraryFilePath),
		}),
	});

export async function deriveLibraryArtifact(
	this: TransformPluginContext,
	artifacts: v.InferOutput<typeof Artifacts>,
	options: { libraryFilePath: string; projectFilePath: string },
) {
	const artifactSchema = createArtifactSchema(options);

	const artifact = findOnlyOne(artifacts, (artifact) =>
		v.is(artifactSchema, artifact),
	);

	if (artifact === undefined) {
		throw new Error(`Expected to find exactly 1 compiler-artifact`);
	}

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
