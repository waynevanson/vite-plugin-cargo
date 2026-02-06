import { execFileSync } from "node:child_process";
import type pino from "pino";
import * as v from "valibot";
import { Artifacts } from "./artifacts";
import type { CargoBuildOverrides } from "./plugin-options";
import { isString } from "./utils";

export async function cargoBuild(context: {
	cargoBuildOverrides: CargoBuildOverrides;
	projectFilePath: string;
	log: pino.Logger;
	isServe: boolean;
	profile: undefined | string;
}) {
	const profile = (context.profile ?? context.isServe) ? "release" : "dev";
	// create `.wasm` from `.rs`
	let args = [
		"build",
		"--lib",
		"--target=wasm32-unknown-unknown",
		"--message-format=json",
		`--manifest-path=${context.projectFilePath}`,
		"--color=never",
		"--quiet",
		`--profile=${profile}`,
	].filter(isString);

	context.log.debug({ args }, "cargo-build:raw-args");

	if (context.cargoBuildOverrides) {
		args = context.cargoBuildOverrides(args);
		context.log.debug({ args }, "cargo-build:overridden-args");
	} else {
		context.log.debug("cargo-build:no-overriden-args");
	}

	const ndjson = execFileSync("cargo", args, {
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
