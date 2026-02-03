import { execFileSync } from "node:child_process";
import path from "node:path";
import type { MetadaSchemaOptions } from "./types";
import { isString } from "./utils";

export function compileRustLibrary(
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

	const ndjson = execFileSync("cargo", args, {
		cwd: path.dirname(options.id),
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "ignore"],
	});

	// get name of `.wasm` file
	const json = ndjson
		.trim()
		.split("\n")
		.map((json) => JSON.parse(json));

	// todo: validation and error messages
	const filename: string = json
		.filter((a) => a?.reason === "compiler-artifact")
		.filter((a) => a?.manifest_path === options.project)[0]?.filenames?.[0];

	return filename;
}
