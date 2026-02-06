import { execFileSync } from "node:child_process";
import path from "node:path";
import * as v from "valibot";
import type { PluginContext } from ".";
import { Artifacts } from "./artifacts";
import { MetadataSchema } from "./metadata";
import type { MetadaSchemaOptions } from "./types";
import { isString } from "./utils";

export function cargoLocateProject(id: string, context: PluginContext) {
	const args = ["locate-project", "--message-format=plain"];

	context.log.debug(args, "cargo-locate-project");

	const project = execFileSync("cargo", args, {
		stdio: ["ignore", "pipe", "ignore"],
		encoding: "utf-8",
		cwd: path.dirname(id),
	}).trim();

	context.log.debug({ project }, "cargo-project");

	return project;
}

export function cargoMetadata(
	options: MetadaSchemaOptions,
	data: PluginContext,
) {
	const args = ["metadata", "--no-deps", "--format-version=1"];

	data.log.debug({ args }, "cargo-metadata");

	const metacontent = execFileSync("cargo", args, {
		cwd: path.dirname(options.id),
		encoding: "utf-8",
	}).trim();

	const json = JSON.parse(metacontent);
	data.log.debug({ json }, "metadata-raw");

	const parsed = v.parse(MetadataSchema, json);
	data.log.debug({ parsed }, "metadata-parsed");

	return parsed;
}

export async function cargoBuild(
	options: MetadaSchemaOptions,
	context: PluginContext,
) {
	// create `.wasm` from `.rs`
	let args = [
		"build",
		"--lib",
		"--target=wasm32-unknown-unknown",
		"--message-format=json",
		"--color=never",
		"--quiet",
		context.isServe || "--release",
	].filter(isString);

	context.log.debug({ args }, "cargo-build:raw-args");

	if (context.cargoBuildOverrides) {
		args = context.cargoBuildOverrides(args);
		context.log.debug({ args }, "cargo-build:overridden-args");
	} else {
		context.log.debug("cargo-build:no-overriden-args");
	}

	const ndjson = execFileSync("cargo", args, {
		cwd: path.dirname(options.id),
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "ignore"],
	});

	context.log.debug({ ndjson }, "artifacts-ndjson");

	const json = ndjson
		.trim()
		.split("\n")
		.map((json) => JSON.parse(json));

	context.log.debug({ json }, "artifacts");

	// todo: validate json data
	return v.parse(Artifacts, json);
}
