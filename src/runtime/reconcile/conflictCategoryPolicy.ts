/**
 * Per-category conflict policy: the extension point for file categories
 * that must NOT go through the normal conflict handling (preserve the
 * losing side as a conflict artifact, or character-level CRDT merge).
 *
 * A category is a name, a detector, and a strategy. The controller
 * consults this module only at the point where it has already decided a
 * divergence is a conflict (the closed-file planner returned
 * create-conflict-artifact, or a bound file reached the
 * ambiguous-divergence handling). Files no category claims keep the
 * normal behavior untouched.
 *
 * v1 implements exactly one category: Waypoint folder notes, strategy
 * newest-wins. See THUNDER.md, "Per-category conflict policy".
 *
 * Newest signal: the edit times the reconcile code already tracks for
 * the two sides. Disk side: the file's disk mtime (vault stat / the
 * reconcile scan's allStats entry). CRDT side: the mtime recorded in
 * the file's CRDT metadata (fileMeta mtime, set when the CRDT side last
 * created or re-registered the file). Both are imperfect, but they are
 * the same pair of signals the existing conflict code already orders
 * by (closed-file missing-baseline uses disk mtime evidence; path
 * collision ranking in VaultSync uses meta mtime). If either time is
 * missing, or the two are equal, there is no provably newer side: the
 * policy stays silent and normal conflict handling runs.
 */

// -----------------------------------------------------------------------
// Category structure
// -----------------------------------------------------------------------

export type ConflictCategoryStrategy = "newest-wins";

export interface ConflictCategoryDetectionInput {
	readonly path: string;
	/**
	 * Contents of every version available at conflict time (disk, CRDT,
	 * and the editor buffer where one exists). A category qualifies when
	 * ANY available version carries its generated content: a freshly
	 * regenerated note always carries it, even if the other side's
	 * version predates generation.
	 */
	readonly contents: readonly string[];
}

export interface ConflictCategory {
	readonly name: string;
	readonly strategy: ConflictCategoryStrategy;
	detect(input: ConflictCategoryDetectionInput): boolean;
}

// -----------------------------------------------------------------------
// Waypoint detector
// -----------------------------------------------------------------------

/**
 * Generated-block markers from the Waypoint plugin (IdreesInc/Waypoint).
 * These begin/end strings are hardcoded constants in the plugin, never
 * customisable, so they are identical on every device. The separate
 * trigger flags (%% Waypoint %% etc.) are NOT used here: a trigger flag
 * alone means the block has not been generated yet.
 */
export const WAYPOINT_BEGIN_MARKER = "%% Begin Waypoint %%";
export const WAYPOINT_END_MARKER = "%% End Waypoint %%";
export const LANDMARK_BEGIN_MARKER = "%% Begin Landmark %%";
export const LANDMARK_END_MARKER = "%% End Landmark %%";

const MARKER_PAIRS: ReadonlyArray<readonly [string, string]> = [
	[WAYPOINT_BEGIN_MARKER, WAYPOINT_END_MARKER],
	[LANDMARK_BEGIN_MARKER, LANDMARK_END_MARKER],
];

/**
 * True when the content holds a matched marker pair in order: a begin
 * marker at an earlier offset than its end marker, for either the
 * Waypoint pair or the Landmark pair. Substring matching, like the
 * plugin's own search, so callout variants (lines prefixed with >)
 * qualify. A lone marker, or an end marker before its begin marker,
 * does not qualify.
 */
export function hasMatchedWaypointMarkerPair(content: string): boolean {
	for (const [begin, end] of MARKER_PAIRS) {
		const beginIndex = content.indexOf(begin);
		if (beginIndex === -1) continue;
		if (content.indexOf(end, beginIndex + begin.length) > beginIndex) {
			return true;
		}
	}
	return false;
}

/**
 * The Waypoint plugin's default folder note shape: the file's basename
 * (without .md) equals its parent folder's name, e.g. Projects/Projects.md.
 * Root-level files have no parent folder and never qualify.
 */
export function isFolderNotePath(path: string): boolean {
	const parts = path.split("/");
	if (parts.length < 2) return false;
	const fileName = parts[parts.length - 1]!;
	const parentName = parts[parts.length - 2]!;
	if (!fileName.endsWith(".md")) return false;
	const basename = fileName.slice(0, fileName.length - ".md".length);
	return basename.length > 0 && basename === parentName;
}

/**
 * A file is a Waypoint folder note only when BOTH hold: the folder note
 * shape, and a matched marker pair in at least one available version.
 * Shape alone never qualifies (a human folder note with no generated
 * block is a normal file), and markers alone never qualify (a note can
 * quote the markers without the plugin owning it).
 */
export function isWaypointFolderNote(
	path: string,
	contents: readonly string[],
): boolean {
	if (!isFolderNotePath(path)) return false;
	return contents.some((content) => hasMatchedWaypointMarkerPair(content));
}

export const waypointConflictCategory: ConflictCategory = {
	name: "waypoint",
	strategy: "newest-wins",
	detect: (input) => isWaypointFolderNote(input.path, input.contents),
};

/** Every implemented category. v1: Waypoint only. */
export const CONFLICT_CATEGORIES: readonly ConflictCategory[] = [
	waypointConflictCategory,
];

export function findConflictCategory(
	input: ConflictCategoryDetectionInput,
): ConflictCategory | null {
	return CONFLICT_CATEGORIES.find((category) => category.detect(input)) ?? null;
}

// -----------------------------------------------------------------------
// Newest-wins resolution
// -----------------------------------------------------------------------

export interface ConflictSide {
	readonly content: string;
	/** Edit time in Unix ms as tracked by the reconcile code, or null. */
	readonly editedAt: number | null;
}

export interface NewestWinsResolution {
	readonly category: string;
	readonly strategy: ConflictCategoryStrategy;
	readonly winner: "disk" | "crdt";
	/** The winning side's content, wholesale. Never a merge. */
	readonly content: string;
	readonly diskEditedAt: number;
	readonly crdtEditedAt: number;
}

function isUsableTime(value: number | null): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Resolve a conflict by category policy. Returns the resolution when a
 * category claims the file AND its strategy picks a winner; returns
 * null when no category claims the file, or when newest-wins cannot
 * name a provably newer side (a time missing, or both times equal).
 * Null means: run the normal conflict handling.
 */
export function resolveConflictByCategory(input: {
	path: string;
	disk: ConflictSide;
	crdt: ConflictSide;
	/** Extra contents for detection only (e.g. the editor buffer). */
	detectionContents?: readonly string[];
}): NewestWinsResolution | null {
	const category = findConflictCategory({
		path: input.path,
		contents: input.detectionContents ?? [input.disk.content, input.crdt.content],
	});
	if (!category) return null;

	switch (category.strategy) {
		case "newest-wins": {
			const diskEditedAt = input.disk.editedAt;
			const crdtEditedAt = input.crdt.editedAt;
			if (!isUsableTime(diskEditedAt) || !isUsableTime(crdtEditedAt)) {
				return null;
			}
			if (diskEditedAt === crdtEditedAt) return null;
			const winner = diskEditedAt > crdtEditedAt ? "disk" : "crdt";
			return {
				category: category.name,
				strategy: category.strategy,
				winner,
				content: winner === "disk" ? input.disk.content : input.crdt.content,
				diskEditedAt,
				crdtEditedAt,
			};
		}
	}
}
