import { isMarkdownSyncable } from "../../src/types";
import {
	isMarkdownConflictArtifactPath,
	markdownConflictSuffix,
} from "../../src/sync/markdownConflictArtifact";
import { formatConflictStamp } from "../../src/sync/conflictStamp";
import {
	evaluateConflictArtifactCap,
	MAX_MARKDOWN_CONFLICT_ARTIFACTS_PER_PATH,
	MAX_MARKDOWN_CONFLICT_ARTIFACTS_SESSION,
} from "../../src/runtime/reconcile/conflictArtifactPolicy";
import { suite } from "../harness.ts";

const s = suite("markdown-conflict-artifact");

const CONFIG = ".obsidian";

s.section("Test 1: new-format sibling names match the detector");
{
	s.check(
		isMarkdownConflictArtifactPath(
			"note (conflict crdt Test Device 2026-08-27 1105).md",
		),
		"new crdt sibling",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"folder/note (conflict disk Laptop 2026-08-27 1105).md",
		),
		"new disk sibling in a folder",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"note (conflict editor Laptop 2026-08-27 1105).md",
		),
		"new editor sibling",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"note (conflict Laptop 2026-05-11 1200).md",
		),
		"new unscoped sibling",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"note (conflict crdt Test Device 2026-08-27 1105) 2.md",
		),
		"new counter suffix",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"note (conflict Windows PC 2026-08-27 1105).md",
		),
		"new sibling with a device name containing a space",
	);
	s.check(
		!isMarkdownConflictArtifactPath("note.md"),
		"ordinary markdown is not an artifact",
	);
	s.check(
		!isMarkdownConflictArtifactPath(
			"photo (conflict remote 2026-08-27 1105).png",
		),
		"blob remote-conflict names are a different pattern",
	);
	s.check(
		!isMarkdownConflictArtifactPath("Meeting notes about a conflict.md"),
		"the word conflict in a title is not enough",
	);
}

s.section("Test 1b: generation produces the new format");
{
	const when = new Date(2026, 7, 27, 11, 5);
	s.check(
		formatConflictStamp(when) === "2026-08-27 1105",
		"stamp is local minute precision YYYY-MM-DD HHMM",
	);
	s.check(
		markdownConflictSuffix("Test Device", "crdt", when) ===
			" (conflict crdt Test Device 2026-08-27 1105)",
		"crdt suffix uses the new format with variant after conflict",
	);
	s.check(
		markdownConflictSuffix("Laptop", undefined, when) ===
			" (conflict Laptop 2026-08-27 1105)",
		"unscoped suffix uses the new format",
	);
	s.check(
		!markdownConflictSuffix("Laptop", "disk", when).includes("YAOS"),
		"generated suffix contains no YAOS",
	);
	const generated = `note${markdownConflictSuffix("Test Device", "crdt", when)}.md`;
	s.check(
		isMarkdownConflictArtifactPath(generated),
		"a generated name is detected as an artifact",
	);
}

s.section("Test 1c: legacy names are still detected forever");
{
	s.check(
		isMarkdownConflictArtifactPath(
			"note (YAOS conflict - crdt from Test Device 2026-08-27T11-05-00Z).md",
		),
		"legacy crdt sibling",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"folder/note (YAOS conflict - disk from Laptop 2026-08-27T11-05-00Z).md",
		),
		"legacy disk sibling in a folder",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"note (YAOS conflict - editor from Laptop 2026-08-27T11-05-00Z).md",
		),
		"legacy editor sibling",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"note (YAOS conflict from Laptop 2026-05-11T12-00-00Z).md",
		),
		"legacy unscoped sibling",
	);
	s.check(
		isMarkdownConflictArtifactPath(
			"note (YAOS conflict - crdt from Test Device 2026-08-27T11-05-00Z) 2.md",
		),
		"legacy counter suffix",
	);
	s.check(
		!isMarkdownConflictArtifactPath(
			"photo (YAOS remote conflict 2026-08-27T11-05-00Z).png",
		),
		"legacy blob names are not markdown artifacts",
	);
}

s.section("Test 2: conflict siblings are not markdown-syncable");
{
	const artifact =
		"Notes/idea (conflict crdt Laptop 2026-08-27 1105).md";
	const legacyArtifact =
		"Notes/idea (YAOS conflict - crdt from Laptop 2026-08-27T11-05-00Z).md";
	s.check(
		isMarkdownSyncable("Notes/idea.md", [], CONFIG),
		"ordinary note still syncs",
	);
	s.check(
		!isMarkdownSyncable(artifact, [], CONFIG),
		"new conflict sibling is not CRDT-syncable",
	);
	s.check(
		!isMarkdownSyncable(legacyArtifact, [], CONFIG),
		"legacy conflict sibling is not CRDT-syncable",
	);
	s.check(
		!isMarkdownSyncable(artifact, ["Notes/"], CONFIG),
		"still rejected when the folder is otherwise included",
	);
}

s.section("Test 3: per-path cap allows one pair then stops");
{
	const first = evaluateConflictArtifactCap({ artifactsForPath: 0, artifactsInSession: 0 });
	s.check(first.allowed && first.reason === "ok", "first mint allowed");
	const second = evaluateConflictArtifactCap({ artifactsForPath: 1, artifactsInSession: 1 });
	s.check(second.allowed && second.reason === "ok", "second mint (disk sibling) allowed");
	const third = evaluateConflictArtifactCap({
		artifactsForPath: MAX_MARKDOWN_CONFLICT_ARTIFACTS_PER_PATH,
		artifactsInSession: 2,
	});
	s.check(!third.allowed && third.reason === "path-cap", "third mint on the same path is capped");
}

s.section("Test 4: session cap stops minting even on a fresh path");
{
	const decision = evaluateConflictArtifactCap({
		artifactsForPath: 0,
		artifactsInSession: MAX_MARKDOWN_CONFLICT_ARTIFACTS_SESSION,
	});
	s.check(!decision.allowed && decision.reason === "session-cap", "session cap wins over a fresh path");
}

await s.done();
