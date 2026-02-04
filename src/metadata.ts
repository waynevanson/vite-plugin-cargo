import type { TransformPluginContext } from "rollup";
import * as v from "valibot";
import type { MetadaSchemaOptions } from "./types";

// this seems like a lot of work just to get the library name out of the metadata..
// I think it's more validation
// We have access to name later when we cargo build.
export function getLibraryData(
	this: TransformPluginContext,
	metadata: v.InferOutput<typeof MetadataSchema>,
	options: MetadaSchemaOptions,
) {
	const package_ = findOnlyOne(
		metadata.packages,
		(a) => a.manifest_path === options.project,
	);

	if (package_ === undefined) {
		throw new Error(
			`Expected at least 1 package to have the manifest_path of ${options.project}`,
		);
	}

	const TargetSchema = v.object({
		name: v.string(),
		src_path: v.literal(options.id),
		kind: v.tuple([v.literal("cdylib")]),
		crate_types: v.tuple([v.literal("cdylib")]),
	});

	const target = findOnlyOne(package_?.targets ?? [], (target) =>
		v.is(TargetSchema, target),
	);

	if (target === undefined) {
		throw new Error(
			`Expected at least 1 target to match the src_path of ${options.id} and be a cdylib target`,
		);
	}

	return {
		libraryName: target.name,
	};
}

export function findOnlyOne<T, U extends T>(
	array: Array<T>,
	predicate: ((item: T) => item is U) | ((value: T) => boolean),
): U | undefined {
	let found: U | undefined;

	for (const item of array) {
		if (!predicate(item)) {
			continue;
		}

		if (found !== undefined) {
			throw new Error(`Found multiple of the same item`);
		}

		found = item as U;
	}

	return found;
}

// There's more data but we're only going to validate what we need
export const MetadataSchema = v.object({
	packages: v.array(
		v.object({
			name: v.string(),
			id: v.string(),
			manifest_path: v.string(),
			dependencies: v.array(
				v.object({
					name: v.string(),
					source: v.string(),
					req: v.string(),
					kind: v.nullable(v.string()),
				}),
			),
			targets: v.array(
				v.object({
					kind: v.array(v.string()),
					crate_types: v.array(v.string()),
					name: v.string(),
					src_path: v.string(),
				}),
			),
		}),
	),
});
