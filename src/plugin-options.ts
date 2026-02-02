import type picomatch from "picomatch";
import * as v from "valibot";

const enable = v.optional(v.boolean(), false);

const FeaturesSchema = v.pipe(
	v.union([
		v.object({ allFeatures: v.literal(true) }),
		v.pipe(
			v.object({
				features: v.optional(v.array(v.string())),
				noDefaultFeatures: enable,
			}),
			v.transform((possibleFeatures) => ({ possibleFeatures })),
		),
	]),
	v.transform((features) => ({ features })),
);

const VitePluginCargoOptionsBaseSchema = v.pipe(
	v.object({
		includes: v.union(
			[v.string(), v.array(v.string())],
			"Glob",
		) as v.GenericSchema<picomatch.Glob>,
		noTypescript: enable,
		browserOnly: enable,
	}),
	v.transform((base) => ({
		typescript: !base.noTypescript,
		browserless: !base.browserOnly,
		includes: base.includes,
	})),
);

const VitePluginCargoOptionsSchema = v.intersect([
	VitePluginCargoOptionsBaseSchema,
	FeaturesSchema,
]);

export const parsePluginOptions = v.parser(VitePluginCargoOptionsSchema);

export type VitePluginCargoOptions = v.InferInput<
	typeof VitePluginCargoOptionsSchema
>;

export type VitePluginCargoOptionsInternal = v.InferOutput<
	typeof VitePluginCargoOptionsSchema
>;
