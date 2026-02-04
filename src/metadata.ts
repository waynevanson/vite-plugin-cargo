import type { TransformPluginContext } from "rollup";
import * as v from "valibot";
import type { MetadaSchemaOptions } from "./types";

export function getLibraryData(
	this: TransformPluginContext,
	metadata: unknown,
	options: MetadaSchemaOptions,
) {
	return v.parse(singleMetaSchema(options), metadata);
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

// todo: Replace all schema with only parsing what we need to searching.
const singleMetaSchema = (options: MetadaSchemaOptions) =>
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
