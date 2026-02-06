import * as path from "node:path";
import { CACHE_DIR } from "./constants";

export type Hash = string;

export function createLibraryDir(hash: Hash) {
	if (hash.length <= 2) {
		throw Error(
			`Expected hash to be a string greater than two but received "${hash}"`,
		);
	}

	return path.resolve(CACHE_DIR, hash.slice(0, 2), hash.slice(2));
}
