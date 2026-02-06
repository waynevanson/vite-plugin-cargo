import * as crypto from "node:crypto";
import * as path from "node:path";
import { CACHE_DIR } from "./constants";

export type LibraryContextBase = {
	id: string;
	project: string;
};

export type LibraryContextRustBuild = LibraryContextBase & {
	outDir: string;
	wasm: string;
};

export type LibraryContextWasmBuild = LibraryContextRustBuild & {
	name: string;
};

export type Hash = string;

export function createLibraryHash(library: {
	libraryFilePath: string;
	projectFilePath: string;
}): Hash {
	return crypto
		.createHash("sha256")
		.update(`${library.projectFilePath}:${library.libraryFilePath}`)
		.digest("hex") as Hash;
}

export type LibraryDir = string;

export function createLibraryDir(hash: Hash): LibraryDir {
	if (hash.length <= 2) {
		throw Error(
			`Expected hash to be a string greater than two but received "${hash}"`,
		);
	}

	return path.resolve(CACHE_DIR, hash.slice(0, 2), hash.slice(2));
}
