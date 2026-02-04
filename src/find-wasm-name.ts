import { execFileSync } from "node:child_process";
import path from "node:path";
import type { TransformPluginContext } from "rollup";
import * as v from "valibot";
import { debug } from "./debug";
import type { MetadaSchemaOptions } from "./types";

export function getRustMetadata(options: MetadaSchemaOptions) {
	const args = ["metadata", "--no-deps", "--format-version=1"];
	debug("cargo %s", args.join(" "));
	const metacontent = execFileSync("cargo", args, {
		cwd: path.dirname(options.id),
		encoding: "utf-8",
	}).trim();

	const json = JSON.parse(metacontent);

	debug("metadata %s", JSON.stringify(json, null, 2));

	return json;
}

export function getLibraryData(
	this: TransformPluginContext,
	metadata: unknown,
	options: MetadaSchemaOptions,
) {
	return v.parse(MetadataSchema(options), metadata);
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
