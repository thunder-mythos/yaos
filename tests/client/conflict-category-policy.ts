/**
 * Per-category conflict policy, v1: Waypoint folder notes resolve
 * newest-wins silently.
 *
 * The policy module is pure: the controller consults it only where a
 * divergence has already been judged a conflict (closed-file planner
 * returned create-conflict-artifact, or a bound file reached the
 * ambiguous-divergence handling). These tests cover the detector, the
 * newest-wins resolution, and, in the same simulated-canonical style
 * as closed-file-conflict.ts, what the controller does with the
 * resolution: apply the winner wholesale, create NO conflict artifact,
 * and never merge the two contents.
 */

import {
	CONFLICT_CATEGORIES,
	findConflictCategory,
	hasMatchedWaypointMarkerPair,
	isFolderNotePath,
	isWaypointFolderNote,
	resolveConflictByCategory,
} from "../../src/runtime/reconcile/conflictCategoryPolicy";
import { suite } from "../harness.ts";

const s = suite("conflict-category-policy");

const PATH = "Projects/Projects.md";

const regenA = [
	"%% Begin Waypoint %%",
	"- [[Alpha]]",
	"- **[[Subfolder]]**",
	"",
	"%% End Waypoint %%",
].join("\n");

const regenB = [
	"%% Begin Waypoint %%",
	"- [[Beta]]",
	"- [[Gamma]]",
	"",
	"%% End Waypoint %%",
].join("\n");

const landmarkNote = [
	"%% Begin Landmark %%",
	"- [[Alpha]]",
	"",
	"%% End Landmark %%",
].join("\n");

const T_OLD = 1_700_000_000_000;
const T_NEW = 1_700_003_600_000;

// -----------------------------------------------------------------------
// Category structure: one category in v1, name + detector + strategy
// -----------------------------------------------------------------------

s.section("category structure");
{
	s.check(CONFLICT_CATEGORIES.length === 1, "v1 implements exactly one category");
	s.check(CONFLICT_CATEGORIES[0]!.name === "waypoint", "the category is named waypoint");
	s.check(CONFLICT_CATEGORIES[0]!.strategy === "newest-wins", "its strategy is newest-wins");
	s.check(
		findConflictCategory({ path: PATH, contents: [regenA] })?.name === "waypoint",
		"findConflictCategory claims a Waypoint folder note",
	);
	s.check(
		findConflictCategory({ path: PATH, contents: ["plain human text"] }) === null,
		"findConflictCategory claims nothing for a plain folder note",
	);
}

// -----------------------------------------------------------------------
// Detector: folder note shape
// -----------------------------------------------------------------------

s.section("detector: folder note shape");
{
	s.check(isFolderNotePath("Projects/Projects.md"), "basename equals parent folder");
	s.check(isFolderNotePath("a/b/b.md"), "nested folder note qualifies by shape");
	s.check(!isFolderNotePath("Projects.md"), "root file has no parent folder");
	s.check(!isFolderNotePath("Notes/Projects.md"), "basename differs from parent folder");
	s.check(!isFolderNotePath("Projects/Projects.txt"), "non-markdown file is not a folder note");
}

// -----------------------------------------------------------------------
// Detector: marker pairs
// -----------------------------------------------------------------------

s.section("detector: marker pairs");
{
	s.check(hasMatchedWaypointMarkerPair(regenA), "Waypoint pair recognized");
	s.check(hasMatchedWaypointMarkerPair(landmarkNote), "Landmark pair recognized");
	s.check(
		hasMatchedWaypointMarkerPair("> %% Begin Waypoint %%\n> - [[A]]\n> %% End Waypoint %%"),
		"callout-prefixed pair recognized (substring match)",
	);
	s.check(
		!hasMatchedWaypointMarkerPair("%% Begin Waypoint %%\n- [[A]]"),
		"begin marker without end marker does not qualify",
	);
	s.check(
		!hasMatchedWaypointMarkerPair("- [[A]]\n%% End Waypoint %%"),
		"end marker without begin marker does not qualify",
	);
	s.check(
		!hasMatchedWaypointMarkerPair("%% End Waypoint %%\n- [[A]]\n%% Begin Waypoint %%"),
		"reversed Waypoint markers do not qualify",
	);
	s.check(
		!hasMatchedWaypointMarkerPair("%% End Landmark %%\n%% Begin Landmark %%"),
		"reversed Landmark markers do not qualify",
	);
	s.check(
		!hasMatchedWaypointMarkerPair("%% Begin Waypoint %%\n%% End Landmark %%"),
		"mixed begin and end markers do not form a pair",
	);
	s.check(
		!hasMatchedWaypointMarkerPair("%% Waypoint %%"),
		"the bare trigger flag alone is not a generated block",
	);
}

// -----------------------------------------------------------------------
// Detector: BOTH shape and markers are required
// -----------------------------------------------------------------------

s.section("detector: shape and markers are both required");
{
	s.check(isWaypointFolderNote(PATH, [regenA]), "shape + Waypoint pair qualifies");
	s.check(isWaypointFolderNote(PATH, [landmarkNote]), "shape + Landmark pair qualifies");
	s.check(
		isWaypointFolderNote(PATH, ["no markers on this side", regenB]),
		"qualifies when the pair is in the incoming version only",
	);
	s.check(
		!isWaypointFolderNote(PATH, ["folder-shaped, human written, no markers"]),
		"folder-shaped note without markers never qualifies",
	);
	s.check(
		!isWaypointFolderNote("Notes/Projects.md", [regenA]),
		"markers in a non-folder-shaped note never qualify",
	);
}

// -----------------------------------------------------------------------
// Resolution: two devices regenerate the same folder note while apart
// -----------------------------------------------------------------------

/**
 * Simulated controller application, mirroring the closed-file hook:
 * a non-null resolution is applied wholesale with no artifact; a null
 * resolution falls back to the normal conflict behavior, which here
 * preserves the losing side as one conflict artifact.
 */
function simulateReconcile(input: {
	path: string;
	diskContent: string;
	crdtContent: string;
	diskEditedAt: number | null;
	crdtEditedAt: number | null;
}): { canonical: string; artifacts: string[] } {
	const artifacts: string[] = [];
	const resolution = resolveConflictByCategory({
		path: input.path,
		disk: { content: input.diskContent, editedAt: input.diskEditedAt },
		crdt: { content: input.crdtContent, editedAt: input.crdtEditedAt },
	});
	if (resolution) {
		return { canonical: resolution.content, artifacts };
	}
	// Normal conflict behavior: the losing side is preserved as an artifact.
	artifacts.push(input.crdtContent);
	return { canonical: input.diskContent, artifacts };
}

s.section("two devices regenerate while apart: newest wins, no artifact");
{
	const diskNewer = simulateReconcile({
		path: PATH,
		diskContent: regenA,
		crdtContent: regenB,
		diskEditedAt: T_NEW,
		crdtEditedAt: T_OLD,
	});
	s.check(diskNewer.canonical === regenA, "newer disk regeneration wins wholesale");
	s.check(diskNewer.artifacts.length === 0, "no conflict artifact is created (disk newer)");

	const crdtNewer = simulateReconcile({
		path: PATH,
		diskContent: regenA,
		crdtContent: regenB,
		diskEditedAt: T_OLD,
		crdtEditedAt: T_NEW,
	});
	s.check(crdtNewer.canonical === regenB, "newer CRDT regeneration wins wholesale");
	s.check(crdtNewer.artifacts.length === 0, "no conflict artifact is created (CRDT newer)");
	s.check(
		crdtNewer.canonical !== regenA && !crdtNewer.canonical.includes("Alpha"),
		"result is exactly one side, no merged garbling of the two regenerations",
	);

	const resolution = resolveConflictByCategory({
		path: PATH,
		disk: { content: regenA, editedAt: T_OLD },
		crdt: { content: landmarkNote, editedAt: T_NEW },
	});
	s.check(
		resolution !== null && resolution.winner === "crdt" && resolution.content === landmarkNote,
		"a Landmark regeneration resolves newest-wins the same way",
	);
}

s.section("marker-less folder note keeps normal conflict behavior");
{
	const result = simulateReconcile({
		path: PATH,
		diskContent: "my offline edits to the folder note",
		crdtContent: "remote edits to the same note",
		diskEditedAt: T_NEW,
		crdtEditedAt: T_OLD,
	});
	s.check(result.artifacts.length === 1, "normal conflict artifact is created");
	s.check(
		resolveConflictByCategory({
			path: PATH,
			disk: { content: "a", editedAt: T_NEW },
			crdt: { content: "b", editedAt: T_OLD },
		}) === null,
		"policy stays silent for a marker-less folder note",
	);
}

s.section("markers without the folder shape keep normal conflict behavior");
{
	const result = simulateReconcile({
		path: "Notes/Projects.md",
		diskContent: regenA,
		crdtContent: regenB,
		diskEditedAt: T_NEW,
		crdtEditedAt: T_OLD,
	});
	s.check(result.artifacts.length === 1, "normal conflict artifact is created");
	s.check(
		resolveConflictByCategory({
			path: "Notes/Projects.md",
			disk: { content: regenA, editedAt: T_NEW },
			crdt: { content: regenB, editedAt: T_OLD },
		}) === null,
		"policy stays silent when the file is not folder-shaped",
	);
}

s.section("no provably newer side: policy stays silent");
{
	s.check(
		resolveConflictByCategory({
			path: PATH,
			disk: { content: regenA, editedAt: T_OLD },
			crdt: { content: regenB, editedAt: T_OLD },
		}) === null,
		"equal edit times fall back to normal conflict handling",
	);
	s.check(
		resolveConflictByCategory({
			path: PATH,
			disk: { content: regenA, editedAt: null },
			crdt: { content: regenB, editedAt: T_OLD },
		}) === null,
		"a missing disk time falls back to normal conflict handling",
	);
	s.check(
		resolveConflictByCategory({
			path: PATH,
			disk: { content: regenA, editedAt: T_NEW },
			crdt: { content: regenB, editedAt: null },
		}) === null,
		"a missing CRDT time falls back to normal conflict handling",
	);
}

await s.done();
