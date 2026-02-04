import { execFileSync } from "node:child_process";
import path from "node:path";
import type { TransformPluginContext } from "rollup";
import { debug } from "./debug";
import type { MetadaSchemaOptions } from "./types";
import { isString } from "./utils";

export function getClosestCargoProject(id: string) {
	const args = ["locate-project", "--message-format=plain"];

	debug("cargo %s", args.join(" "));

	const project = execFileSync("cargo", args, {
		stdio: ["ignore", "pipe", "ignore"],
		encoding: "utf-8",
		cwd: path.dirname(id),
	}).trim();

	debug("project %o", project);

	return project;
}

export async function compileRustLibrary(
	this: TransformPluginContext,
	options: MetadaSchemaOptions,
	isServe: boolean,
) {
	// create `.wasm` from `.rs`
	const args = [
		"build",
		"--lib",
		"--target=wasm32-unknown-unknown",
		"--message-format=json",
		"--color=never",
		"--quiet",
		isServe || "--release",
	].filter(isString);

	debug("cargo %s", args.join(" "));

	const ndjson = execFileSync("cargo", args, {
		cwd: path.dirname(options.id),
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "ignore"],
	});

	debug("artifacts-ndjson %s", ndjson);

	const json = ndjson
		.trim()
		.split("\n")
		.map((json) => JSON.parse(json));

	debug("artifacts %o", json);

	// todo: validate json data
	return json;
}
