import { execFileSync } from "node:child_process";
import path from "node:path";
import { TransformPluginContext } from "rollup";
import * as v from "valibot";
import type { MetadaSchemaOptions } from "./types";

// todo: what to do there's multiple libraries for the same file?
// Maybe add config force user to resolve this.
export function ensureRustLibraryMetadata(
	this: TransformPluginContext,
	options: MetadaSchemaOptions,
) {
	// validate if the file is the entrypoint to a cdylib target as rust lib
	const metacontent = execFileSync(
		"cargo",
		["metadata", "--no-deps", "--format-version=1"],
		{
			cwd: path.dirname(options.id),
			encoding: "utf-8",
		},
	).trim();

	const json = JSON.parse(metacontent);

	this.debug({ message: json });

	// find the right library from our file
	const metadata = v.parse(MetadataSchema(options), JSON.parse(metacontent));

	return metadata;
}

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
