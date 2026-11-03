/**
 * SYNC-01 regression — CRDT path missing from disk classification.
 *
 * reconcileVault() used to classify every CRDT path absent from disk as
 * createdOnDisk unconditionally, so a file deleted on this device while
 * the plugin was disabled was silently resurrected on re-enable, on
 * every device, forever.
 *
 * The persisted disk index separates the two cases that "not on disk"
 * conflates: an entry with a baseline content hash means this device
 * materialized the file before, so absence is an offline delete; no
 * entry means the file is new to this device and must be created.
 */

import {
	classifyMissingBlobOnDisk,
	classifyMissingOnDiskPath,
} from "../../src/runtime/reconcile/missingOnDiskPolicy";
import { suite } from "../harness.ts";

const s = suite("missing-on-disk-policy");

const BASE = "hash-baseline";
const MOVED = "hash-remote-edit";

function classify(overrides: Partial<Parameters<typeof classifyMissingOnDiskPath>[0]> = {}) {
	return classifyMissingOnDiskPath({
		mode: "authoritative",
		absentFromDiskListing: true,
		hasDiskIndexEntry: true,
		baselineHash: BASE,
		crdtHash: BASE,
		...overrides,
	});
}

s.section("known path absent, CRDT unchanged since baseline: offline delete");
{
	s.check(
		classify().kind === "offline-delete",
		"index entry + baseline + CRDT at baseline: offline-delete",
	);
}

s.section("known path absent, CRDT moved since baseline: delete-vs-edit conflict");
{
	s.check(
		classify({ crdtHash: MOVED }).kind === "offline-delete-conflict",
		"index entry + baseline + CRDT past baseline: offline-delete-conflict",
	);
}

s.section("unknown path absent: create from CRDT (unchanged legacy behavior)");
{
	s.check(
		classify({ hasDiskIndexEntry: false, baselineHash: null, crdtHash: MOVED }).kind === "create-on-disk",
		"no index entry: create-on-disk",
	);
	s.check(
		classify({ baselineHash: null }).kind === "create-on-disk",
		"index entry without baseline hash: cannot prove CRDT state, create-on-disk",
	);
	s.check(
		classify({ crdtHash: null }).kind === "create-on-disk",
		"CRDT content unavailable for hashing: create-on-disk",
	);
}

s.section("guards: mode and true absence");
{
	s.check(
		classify({ mode: "conservative" }).kind === "create-on-disk",
		"conservative mode never deletes: create-on-disk",
	);
	s.check(
		classify({ absentFromDiskListing: false }).kind === "create-on-disk",
		"file exists on disk but was filtered out of the syncable set (excluded by settings): not a delete, create-on-disk",
	);
}

s.section("blob plane twin: persisted hash cache is the discriminator");
{
	const blob = (overrides: Partial<Parameters<typeof classifyMissingBlobOnDisk>[0]> = {}) =>
		classifyMissingBlobOnDisk({
			mode: "authoritative",
			absentFromDiskListing: true,
			isSyncable: true,
			cachedHash: BASE,
			crdtHash: BASE,
			...overrides,
		});

	s.check(blob().kind === "offline-delete", "blob: cache entry + CRDT at cached hash: offline-delete");
	s.check(
		blob({ crdtHash: MOVED }).kind === "offline-delete-conflict",
		"blob: cache entry + CRDT past cached hash: offline-delete-conflict",
	);
	s.check(
		blob({ cachedHash: null }).kind === "download",
		"blob: no cache entry (new to this device): download",
	);
	s.check(
		blob({ absentFromDiskListing: false }).kind === "download",
		"blob: file exists on disk outside the syncable set: download, not delete",
	);
	s.check(
		blob({ isSyncable: false }).kind === "download",
		"blob: path no longer blob-syncable: download, not delete",
	);
	s.check(
		blob({ mode: "conservative" }).kind === "download",
		"blob: conservative mode never deletes: download",
	);
}

await s.done();
