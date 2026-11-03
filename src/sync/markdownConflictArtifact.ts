/**
 * Markdown conflict-artifact identity.
 *
 * Sibling notes written by ReconciliationController use a distinctive
 * filename. They are local-only safety copies: they must not enter the
 * CRDT or sync. Matching this pattern is the admission gate.
 *
 * Current shape (see ReconciliationController.conflictArtifactPath):
 *   `<base> (conflict[ crdt|disk|editor] <device> <stamp>)[ N].md`
 * Stamp is local time at minute precision: `YYYY-MM-DD HHMM`.
 * The source variant, when present, sits directly after "conflict".
 *
 * Legacy shape, recognised forever so vaults that already hold old
 * artifacts keep treating them as local-only and never sync them as
 * new files:
 *   `<base> (YAOS conflict[- crdt|disk|editor] from <device> <stamp>)[ N].md`
 * Legacy stamp is ISO-8601 with `:` replaced by `-`.
 */
import { formatConflictStamp } from "./conflictStamp";

const LEGACY_MARKDOWN_CONFLICT_ARTIFACT_RE =
	/ \(YAOS conflict(?: - (?:crdt|disk|editor))? from .+ \d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\)(?: \d+)?\.md$/u;

const MARKDOWN_CONFLICT_ARTIFACT_RE =
	/ \(conflict(?: (?:crdt|disk|editor))? .+ \d{4}-\d{2}-\d{2} \d{4}\)(?: \d+)?\.md$/u;

export function isMarkdownConflictArtifactPath(path: string): boolean {
	const normalized = path.replace(/\\/g, "/");
	const name = normalized.slice(normalized.lastIndexOf("/") + 1);
	return MARKDOWN_CONFLICT_ARTIFACT_RE.test(name) || LEGACY_MARKDOWN_CONFLICT_ARTIFACT_RE.test(name);
}

export type MarkdownConflictSource = "crdt" | "disk" | "editor";

/**
 * Build the suffix for a new markdown conflict artifact, without the
 * base name or extension. Exported so generation and tests share one
 * definition of the current format.
 */
export function markdownConflictSuffix(
	device: string,
	source?: MarkdownConflictSource,
	date: Date = new Date(),
): string {
	const variant = source ? ` ${source}` : "";
	return ` (conflict${variant} ${device} ${formatConflictStamp(date)})`;
}
