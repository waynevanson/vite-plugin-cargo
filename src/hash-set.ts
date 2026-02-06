import { type Hasher, type HasherOptions, hasher } from "node-object-hash";

export class HashSet<Value> implements Iterable<Value> {
	#hasher: Hasher;
	#map: Map<string, Value>;

	constructor(values: Iterable<Value>, hasherOptions?: HasherOptions) {
		this.#hasher = hasher(hasherOptions);

		const entries = Array.from(
			values,
			(value) => [this.#hasher.hash(value), value] as const,
		);

		this.#map = new Map(entries);
	}

	private hash(value: Value) {
		return this.#hasher.hash(value);
	}

	has(value: Value) {
		return this.#map.has(this.hash(value));
	}

	add(value: Value): this {
		const hash = this.hash(value);
		this.#map.set(hash, value);
		return this;
	}

	delete(value: Value) {
		const hash = this.hash(value);
		return this.#map.delete(hash);
	}

	values() {
		return this.#map.values();
	}

	entries() {
		return this.#map.entries();
	}

	hashes() {
		return this.#map.keys();
	}

	[Symbol.iterator]() {
		return this.values();
	}
}
