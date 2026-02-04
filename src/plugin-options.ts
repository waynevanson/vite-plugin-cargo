import type picomatch from "picomatch";
import type { StringFilter } from "rollup";
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

const PatternSchema = v.union([v.string(), v.instance(RegExp)]);
const MaybeArraySchema = <TSchema extends v.GenericSchema>(schema: TSchema) =>
	v.union([schema, v.array(schema)]);

const StringFilterSchema: v.GenericSchema<StringFilter> = v.union([
	PatternSchema,
	MaybeArraySchema(PatternSchema),
	v.object({
		include: v.optional(v.union([MaybeArraySchema(PatternSchema)])),
		exclude: v.optional(v.union([MaybeArraySchema(PatternSchema)])),
	}),
]);

const VitePluginCargoOptionsBaseSchema = v.pipe(
	v.object({
		pattern: StringFilterSchema,
		noTypescript: enable,
		browserOnly: enable,
		cargoBuildOverrides: v.optional(
			v.pipe(
				v.function(),
				v.args(v.strictTuple([v.array(v.string())])),
				v.returns(v.array(v.string())),
			),
		),
	}),
	v.transform((base) => ({
		typescript: !base.noTypescript,
		browserless: !base.browserOnly,
		pattern: base.pattern,
		cargoBuildOverrides: base.cargoBuildOverrides,
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
