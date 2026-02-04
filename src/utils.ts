export function isString(value: unknown): value is string {
	return typeof value === "string";
}

export function findOnlyOne<T, U extends T>(
	array: Array<T>,
	predicate: ((item: T) => item is U) | ((value: T) => boolean),
): U | undefined {
	let found: U | undefined;

	for (const item of array) {
		if (!predicate(item)) {
			continue;
		}

		if (found !== undefined) {
			break;
		}

		found = item as U;
	}

	return found;
}
