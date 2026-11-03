/**
 * Missing-on-disk classification for startup reconciliation (SYNC-01).
 *
 * reconcileVault() classifies every CRDT path absent from the syncable
 * disk set as createdOnDisk. That one bucket conflates two opposite
 * cases:
 *
 *   - the file is new to this device (never materialized here), so it
 *     must be written from CRDT;
 *   - the file WAS materialized here and the user deleted it while the
 *     plugin was disabled, so the absence is an offline delete that must
 *     tombstone the CRDT entry instead of resurrecting the file.
 *
 * The persisted disk index is the discriminator. An entry proves the
 * file was on this device's disk at the last settled reconcile; its
 * contentHash is the three-way baseline. If the CRDT content still
 * equals the baseline, nobody else touched the file and the delete is
 * clean. If the CRDT content moved past the baseline, a remote edit
 * raced the local delete: the delete still wins at the path, but the
 * CRDT side must be preserved as a conflict artifact first.
 *
 * Pure decision logic only: the controller executes the action.
 * Constraints match the sibling planners in this folder: synchronous,
 * no Obsidian imports, no I/O, no side effects.
 */

export interface MissingOnDiskInput {
	readonly mode: "authoritative" | "conservative";
	/**
	 * True absence from the vault's full file listing. A path can be
	 * missing from the syncable set while still existing on disk (for
	 * example excluded by settings patterns); that is not a delete.
	 */
	readonly absentFromDiskListing: boolean;
	/** The persisted disk index holds an entry for this path. */
	readonly hasDiskIndexEntry: boolean;
	/** Baseline content hash from the disk index entry, if recorded. */
	readonly baselineHash: string | null;
	/** Hash of the current CRDT content, if it could be read. */
	readonly crdtHash: string | null;
}

export type MissingOnDiskAction =
	| { kind: "create-on-disk"; reason: string }
	| { kind: "offline-delete"; reason: "known-path-absent-crdt-at-baseline" }
	| { kind: "offline-delete-conflict"; reason: "known-path-absent-crdt-past-baseline" };

export function classifyMissingOnDiskPath(input: MissingOnDiskInput): MissingOnDiskAction {
	// Deletes are destructive and cross-device. Only an authoritative
	// reconcile (full server state or a proven local cache) may infer
	// one from absence.
	if (input.mode !== "authoritative") {
		return { kind: "create-on-disk", reason: "non-authoritative-mode" };
	}

	// The file exists on disk but outside the syncable set (excluded by
	// settings, oversized, unreadable). Absence from the syncable set is
	// not evidence of a delete.
	if (!input.absentFromDiskListing) {
		return { kind: "create-on-disk", reason: "present-on-disk-outside-syncable-set" };
	}

	// No index entry: this device never materialized the file. It is a
	// new arrival, not a delete.
	if (!input.hasDiskIndexEntry) {
		return { kind: "create-on-disk", reason: "never-materialized-on-this-device" };
	}

	// An entry without a baseline hash proves presence but not content.
	// Without the baseline there is no way to tell a clean delete from a
	// delete racing a remote edit, so keep the legacy non-destructive
	// behavior rather than guessing.
	if (input.baselineHash === null) {
		return { kind: "create-on-disk", reason: "no-baseline-hash" };
	}
	if (input.crdtHash === null) {
		return { kind: "create-on-disk", reason: "crdt-content-unavailable" };
	}

	if (input.crdtHash === input.baselineHash) {
		return { kind: "offline-delete", reason: "known-path-absent-crdt-at-baseline" };
	}
	return { kind: "offline-delete-conflict", reason: "known-path-absent-crdt-past-baseline" };
}

// -----------------------------------------------------------------------
// Blob plane twin
// -----------------------------------------------------------------------

export interface MissingBlobOnDiskInput {
	readonly mode: "authoritative" | "conservative";
	/** True absence from the vault's full file listing (see text plane). */
	readonly absentFromDiskListing: boolean;
	/** The path is currently inside the blob-syncable set. */
	readonly isSyncable: boolean;
	/**
	 * Hash recorded in the persisted blob hash cache for this path, if
	 * any. A cache entry proves this device hashed the blob from its own
	 * disk before; it plays the disk-index role for the blob plane.
	 */
	readonly cachedHash: string | null;
	/** Hash of the blob the CRDT currently points at. */
	readonly crdtHash: string;
}

export type MissingBlobOnDiskAction =
	| { kind: "download"; reason: string }
	| { kind: "offline-delete"; reason: "known-blob-absent-crdt-at-cached-hash" }
	| { kind: "offline-delete-conflict"; reason: "known-blob-absent-crdt-past-cached-hash" };

/**
 * Blob-plane twin of classifyMissingOnDiskPath, with the persisted blob
 * hash cache as the discriminator instead of the Markdown disk index.
 * Same rules: authoritative only, true absence only, no cache entry
 * means new to this device, cache hash equal to the CRDT hash means a
 * clean offline delete, and a moved CRDT hash means delete raced a
 * remote change.
 */
export function classifyMissingBlobOnDisk(input: MissingBlobOnDiskInput): MissingBlobOnDiskAction {
	if (input.mode !== "authoritative") {
		return { kind: "download", reason: "non-authoritative-mode" };
	}
	if (!input.absentFromDiskListing) {
		return { kind: "download", reason: "present-on-disk-outside-syncable-set" };
	}
	if (!input.isSyncable) {
		return { kind: "download", reason: "not-blob-syncable" };
	}
	if (input.cachedHash === null) {
		return { kind: "download", reason: "never-materialized-on-this-device" };
	}
	if (input.cachedHash === input.crdtHash) {
		return { kind: "offline-delete", reason: "known-blob-absent-crdt-at-cached-hash" };
	}
	return { kind: "offline-delete-conflict", reason: "known-blob-absent-crdt-past-cached-hash" };
}
