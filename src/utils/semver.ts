function parseSemver(version: string): number[] | null {
	const normalized = version.trim();
	// The fork version scheme carries a prerelease suffix (for example
	// 2.1.1-thunder.1). Compare on the numeric core so floor checks keep
	// working on fork builds instead of going blind on their own version.
	const match = /^(\d+(?:\.\d+){0,2})(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(normalized);
	const core = match?.[1];
	if (!core) {
		return null;
	}
	return core.split(".").map((part) => Number(part));
}

export function compareSemver(left: string, right: string): number | null {
	const leftParts = parseSemver(left);
	const rightParts = parseSemver(right);
	if (!leftParts || !rightParts) return null;
	const maxLength = Math.max(leftParts.length, rightParts.length);
	for (let i = 0; i < maxLength; i++) {
		const leftValue = leftParts[i] ?? 0;
		const rightValue = rightParts[i] ?? 0;
		if (leftValue < rightValue) return -1;
		if (leftValue > rightValue) return 1;
	}
	return 0;
}
