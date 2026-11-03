/**
 * SYNC-02 regression — bound-file three-way gate.
 *
 * handleBoundFileSyncGap() used to pick a winner purely by which side the
 * editor buffer happened to equal, without ever asking whether BOTH sides
 * had moved away from the persisted baseline while the plugin was off.
 * When both sides changed, one side was silently overwritten with no
 * conflict artifact.
 *
 * The gate is the pure classifier the controller now consults BEFORE the
 * equality shortcuts: when it fires, the shortcuts are skipped and the
 * existing ambiguous-divergence handling (preserve both sides, converge
 * to the editor) runs instead.
 */

import { isBoundFileBothChanged } from "../../src/runtime/reconcile/closedFilePlanner";
import { suite } from "../harness.ts";

const s = suite("bound-file-three-way-gate");

const BASE = "hash-baseline";
const DISK = "hash-disk-edit";
const CRDT = "hash-crdt-edit";

s.section("both sides changed from baseline");
{
	s.check(
		isBoundFileBothChanged({ baselineHash: BASE, diskHash: DISK, crdtHash: CRDT }) === true,
		"disk and CRDT both differ from baseline and from each other: gate fires",
	);
}

s.section("one-sided changes keep the equality shortcuts");
{
	s.check(
		isBoundFileBothChanged({ baselineHash: BASE, diskHash: BASE, crdtHash: CRDT }) === false,
		"disk at baseline, CRDT changed: one-sided, gate stays off",
	);
	s.check(
		isBoundFileBothChanged({ baselineHash: BASE, diskHash: DISK, crdtHash: BASE }) === false,
		"CRDT at baseline, disk changed: one-sided, gate stays off",
	);
	s.check(
		isBoundFileBothChanged({ baselineHash: BASE, diskHash: BASE, crdtHash: BASE }) === false,
		"nothing changed from baseline: gate stays off",
	);
}

s.section("converged and unknown-baseline cases stay off");
{
	s.check(
		isBoundFileBothChanged({ baselineHash: BASE, diskHash: DISK, crdtHash: DISK }) === false,
		"both sides moved to the SAME content: converged, gate stays off",
	);
	s.check(
		isBoundFileBothChanged({ baselineHash: null, diskHash: DISK, crdtHash: CRDT }) === false,
		"no baseline recorded: gate stays off (shortcuts keep legacy behavior)",
	);
}

await s.done();
