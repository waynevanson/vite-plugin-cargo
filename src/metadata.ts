import type { TransformPluginContext } from "rollup";
import * as v from "valibot";
import type { MetadaSchemaOptions } from "./types";
import { findOnlyOne } from "./utils";

export function findLibraryMetadata(
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
			`Expected exactly 1 package to have the manifest_path of "${options.project}"`,
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
			[
				`Expected exactly 1 target to match the src_path of "${options.id}" and be a "cdylib" target`,
				`Maybe the following is not an entry point "${options.id}"?`,
			].join("\n"),
		);
	}

	return {
		id: package_.id,
		manifestPath: package_.manifest_path,
		name: package_.name,
		target,
	};
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
