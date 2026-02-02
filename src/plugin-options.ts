import type picomatch from "picomatch";
import * as v from "valibot";

const enable = v.optional(v.boolean(), false);

const FeaturesSchema = v.pipe(
	v.union([
		v.pipe(
			v.object({
				allFeatures: v.literal(true),
			}),
			v.transform(() => ({ type: "all-features" as const })),
		),
		v.pipe(
			v.object({
				features: v.optional(v.array(v.string())),
				noDefaultFeatures: enable,
			}),
			v.transform((features) => ({
				type: "maybe-features" as const,
				...features,
			})),
		),
	]),
	v.transform((features) => ({ features })),
);

const VitePluginCargoOptionsBaseSchema = v.object({
	includes: v.union([
		v.string(),
		v.array(v.string()),
	]) as v.GenericSchema<picomatch.Glob>,
	noTypescript: enable,
	browserOnly: enable,
});

const VitePluginCargoOptionsSchema = v.intersect([
	VitePluginCargoOptionsBaseSchema,
	FeaturesSchema,
]);

export const parsePluginOptions = v.parser(VitePluginCargoOptionsSchema);

export type VitePluginCargoOptions = v.InferInput<
	typeof VitePluginCargoOptionsSchema
>;
