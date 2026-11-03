/**
 * Closed-file reconcile planner — pure decision logic for the authoritative
 * reconciliation path.
 *
 * This planner is called once per file during startup/reconnect reconciliation.
 * It takes pre-computed inputs (hashes, mode, open/bound state) and returns
 * a typed action. The controller executes the action with side effects.
 *
 * Constraints:
 *   - Synchronous (no async)
 *   - No Obsidian imports
 *   - No Yjs imports
 *   - No disk I/O
 *   - No trace calls
 *   - No `this`
 *   - Pure: same inputs → same output
 */

import {
	decideClosedFileConflict,
	type ClosedFileConflictDecision,
	type ClosedFileConflictInput,
	type MissingBaselineWinnerPolicy,
} from "../../sync/closedFileConflict";

// -----------------------------------------------------------------------
// Input type — everything the planner needs to decide
// -----------------------------------------------------------------------

export interface ClosedFileReconcileInput {
	readonly path: string;
	readonly mode: "authoritative" | "conservative";
	readonly isOpenOrBound: boolean;

	// Content hashes (pre-computed by caller)
	readonly diskHash: string;
	readonly crdtHash: string;
	readonly baselineHash: string | null;

	// Mtime evidence for missing-baseline tiebreak
	readonly diskMtime?: number;
	readonly lastDiskIndexPersistedAt?: number;
}

// -----------------------------------------------------------------------
// Output type — what the controller should do
// -----------------------------------------------------------------------

export type ClosedFileReconcileAction =
	| { kind: "no-op"; path: string; reason: string }
	| { kind: "apply-remote-to-disk"; path: string; reason: string }
	| { kind: "import-disk-to-crdt"; path: string; reason: string }
	| { kind: "create-conflict-artifact"; path: string; reason: string;
			winner: "disk" | "crdt"; preserveSide: "disk" | "crdt";
			missingBaselinePolicy?: MissingBaselineWinnerPolicy }
	| { kind: "defer-to-crdt-flush"; path: string; reason: string };

// -----------------------------------------------------------------------
// Planner — pure function, no side effects
// -----------------------------------------------------------------------

/**
 * Plan the reconcile action for a single closed file.
 *
 * Decision tree:
 *   1. If not authoritative mode → defer to CRDT flush (CRDT wins)
 *   2. If file is open or bound → defer to CRDT flush (live editing takes priority)
 *   3. If disk == CRDT → no-op
 *   4. If authoritative + closed + hashes differ → delegate to decideClosedFileConflict
 *      which uses three-way baseline comparison
 */
export function planClosedFileReconcile(input: ClosedFileReconcileInput): ClosedFileReconcileAction {
	const { path, mode, isOpenOrBound, diskHash, crdtHash, baselineHash, diskMtime, lastDiskIndexPersistedAt } = input;

	// Rule 1: non-authoritative mode → CRDT wins, flush to disk.
	if (mode !== "authoritative") {
		return { kind: "defer-to-crdt-flush", path, reason: "non-authoritative-mode" };
	}

	// Rule 2: file is open or editor-bound → don't touch it during reconcile.
	if (isOpenOrBound) {
		return { kind: "defer-to-crdt-flush", path, reason: "open-or-bound" };
	}

	// Rule 3: disk and CRDT agree → nothing to do.
	if (diskHash === crdtHash) {
		return { kind: "no-op", path, reason: "disk-equals-crdt" };
	}

	// Rule 4: authoritative + closed + hashes differ → three-way conflict resolution.
	const conflictInput: ClosedFileConflictInput = {
		baselineHash,
		diskHash,
		crdtHash,
		diskMtime,
		lastDiskIndexPersistedAt,
	};

	const decision = decideClosedFileConflict(conflictInput);
	return mapConflictDecisionToAction(path, decision);
}

// -----------------------------------------------------------------------
// Bound-file three-way gate (SYNC-02)
// -----------------------------------------------------------------------

export interface BoundFileThreeWayInput {
	readonly baselineHash: string | null;
	readonly diskHash: string;
	readonly crdtHash: string;
}

/**
 * Decide whether a bound (open) file changed on BOTH sides while the
 * plugin was off.
 *
 * handleBoundFileSyncGap() historically chose a winner purely from which
 * side the editor buffer happened to equal. That is only sound when at
 * most one side moved from the persisted baseline: the unchanged side is
 * the one the editor matches, and the changed side is real work. When
 * disk and CRDT BOTH differ from the baseline and from each other, the
 * equality shortcut silently discards one side's work with no conflict
 * artifact.
 *
 * Returns true only for that both-changed case. The controller then
 * skips the equality shortcuts and falls through to the existing
 * ambiguous-divergence handling, which preserves both sides as conflict
 * artifacts and converges the path to the editor content.
 *
 * A null baseline (file never settled through a reconcile) returns
 * false: without a baseline there is no proof both sides changed, so
 * the legacy shortcut behavior is kept rather than manufacturing
 * conflict artifacts for ordinary live divergence.
 */
export function isBoundFileBothChanged(input: BoundFileThreeWayInput): boolean {
	const { baselineHash, diskHash, crdtHash } = input;
	if (baselineHash === null) return false;
	if (diskHash === crdtHash) return false;
	return diskHash !== baselineHash && crdtHash !== baselineHash;
}

/**
 * Map a ClosedFileConflictDecision to a ClosedFileReconcileAction.
 */
function mapConflictDecisionToAction(
	path: string,
	decision: ClosedFileConflictDecision & { _missingBaselinePolicy?: MissingBaselineWinnerPolicy },
): ClosedFileReconcileAction {
	switch (decision.kind) {
		case "no-op":
			return { kind: "no-op", path, reason: "conflict-decision-no-op" };

		case "apply-remote-to-disk":
			return { kind: "apply-remote-to-disk", path, reason: decision.reason };

		case "import-disk-to-crdt":
			return { kind: "import-disk-to-crdt", path, reason: decision.reason };

		case "preserve-conflict":
			return {
				kind: "create-conflict-artifact",
				path,
				reason: decision.reason,
				winner: decision.winner,
				preserveSide: decision.preserveDisk ? "disk" : "crdt",
				missingBaselinePolicy: decision._missingBaselinePolicy,
			};
	}
}
