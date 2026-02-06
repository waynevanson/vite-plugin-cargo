import { execFileSync } from "node:child_process";
import type pino from "pino";
import type { CargoBuildOverrides } from "./plugin-options";
import { isString } from "./utils";

export function cargoBuild(context: {
	cargoBuildOverrides: CargoBuildOverrides;
	projectFilePath: string;
	log: pino.Logger;
	isServe: boolean;
	profile: undefined | string;
	cargoBuildTarget: string;
	cargoBuildProfile: string;
}) {
	// create `.wasm` from `.rs`
	let args = [
		"build",
		"--lib",
		`--target=${context.cargoBuildTarget}`,
		"--message-format=json",
		`--manifest-path=${context.projectFilePath}`,
		"--quiet",
		`--profile=${context.profile}`,
	].filter(isString);

	context.log.debug({ args }, "cargo-build:raw-args");

	if (context.cargoBuildOverrides) {
		args = context.cargoBuildOverrides(args);
		context.log.debug({ args }, "cargo-build:overridden-args");
	} else {
		context.log.debug("cargo-build:no-overriden-args");
	}

	execFileSync("cargo", args, {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "ignore"],
	});
}
