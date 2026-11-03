import {
	conflictPathFor,
	isBlobConflictArtifactPath,
} from "../../src/sync/blobSync";
import { suite } from "../harness.ts";

const s = suite("blob-conflict-artifact");

s.section("Test 1: generation produces the new format");
{
	const when = new Date(2026, 7, 27, 11, 5);
	const generated = conflictPathFor("img.png", when);
	s.check(
		generated === "img (conflict remote 2026-08-27 1105).png",
		"blob artifact uses the new format",
	);
	s.check(!generated.includes("YAOS"), "generated blob name contains no YAOS");
	s.check(
		conflictPathFor("folder/photo.jpg", when) ===
			"folder/photo (conflict remote 2026-08-27 1105).jpg",
		"generation keeps the folder and extension",
	);
	s.check(
		isBlobConflictArtifactPath(generated),
		"a generated blob name is detected as an artifact",
	);
}

s.section("Test 2: detection accepts new names");
{
	s.check(
		isBlobConflictArtifactPath("img (conflict remote 2026-08-27 1105).png"),
		"new blob artifact",
	);
	s.check(
		isBlobConflictArtifactPath("folder/board (conflict remote 2026-08-27 1105).canvas"),
		"new blob artifact in a folder",
	);
	s.check(
		isBlobConflictArtifactPath("img (conflict remote 2026-08-27 1105) 2.png"),
		"new blob artifact with collision suffix",
	);
	s.check(
		!isBlobConflictArtifactPath("img.png"),
		"ordinary blob is not an artifact",
	);
	s.check(
		!isBlobConflictArtifactPath("note (conflict crdt Laptop 2026-08-27 1105).md"),
		"markdown artifact names are a different pattern",
	);
}

s.section("Test 3: detection still accepts legacy names");
{
	s.check(
		isBlobConflictArtifactPath("img (YAOS remote conflict 2026-08-27T11-05-00Z).png"),
		"legacy blob artifact",
	);
	s.check(
		isBlobConflictArtifactPath("folder/img (YAOS remote conflict 2026-08-27T11-05-00Z).png"),
		"legacy blob artifact in a folder",
	);
	s.check(
		isBlobConflictArtifactPath("img (YAOS remote conflict 2026-08-27T11-05-00Z) 2.png"),
		"legacy blob artifact with collision suffix",
	);
}

await s.done();
