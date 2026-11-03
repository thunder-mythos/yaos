# YAOS, Thunder Build

Personal build of [kavinsood/yaos](https://github.com/kavinsood/yaos) for Thunder's own use. Fork: [thunder-mythos/yaos](https://github.com/thunder-mythos/yaos). Thunder branch: `thunder`.

Status (2026-11-02): base setup only. No fixes built yet, nothing deployed, no release cut. This branch is the home for the fix-first build Thunder ordered on 2026-11-02: fix and smooth YAOS standalone first, on its own branch, iteratively, custom to him, before any mixing with Thunder Sync.

## Hard boundaries

- No live deploy without Thunder's word. Do not deploy to, redeploy, or modify his live Cloudflare worker (`yaos.viraajschadha.workers.dev`).
- No mixing into Thunder Sync in this workstream. That integration comes later, if at all, and only on his order.
- No binding R2. His current worker runs with attachments and snapshots off and no R2 bound. That stays until he says otherwise.
- No touching live device configs. Settings and `data.json` files on his devices are not read, copied, or changed by this work.
- No reading, printing, or logging any sync token or credential. If a config file appears, report presence only.
- No pushes to `main`, no releases, and no tags from this branch without his separate order for that step.

## Base decision (2026-11-02)

Base chosen: fork `main` as-is, commit `c1e5c73dc7faa6eefce3d818c185a518ad870a89`. The `thunder` branch was created directly from it. No merge was done.

Reasoning, from the live check on 2026-11-02:

- Upstream latest release is 2.1.1, tag `2.1.1` at commit `2174eb89538ce7e213e9e33a0e75ecaf1a3f1f58`, published 2026-08-27. Verified with `gh release list` and the tags API. Upstream `main` is exactly that commit, 0 commits ahead of the tag and 0 commits behind it.
- Fork `main` vs upstream `main`: 1 ahead, 0 behind. Fork `main` vs tag 2.1.1: 1 ahead, 0 behind. There is no version gap to close and nothing upstream to merge in.
- Versions match on both sides: `manifest.json` 2.1.1, `package.json` 2.1.1, server package 0.3.0 (`SERVER_VERSION` 0.3.0). `minAppVersion` is 1.13.0 on both sides.
- Schema is pinned at exactly v3 on both sides: `SCHEMA_VERSION = 3` in `src/sync/schema.ts`, `SERVER_SCHEMA_VERSION = 3` in `server/src/version.ts`, and `EXPECTED_SCHEMA_VERSION = 3` in `scripts/guard-schema-version.mjs`. Plugin, server, and room must all be v3 or sync is refused. The base does not touch that line.
- Fork `main` does contain one Thunder change that upstream does not have, and it must be preserved: commit `c1e5c73d` "Comment out r2_buckets section" (2026-10-03), which comments out the `[[r2_buckets]]` binding (`YAOS_BUCKET`, bucket `yaos`) in `server/wrangler.toml`. That matches how his worker was deployed in October, with attachments and snapshots off and no R2 bound.

Why the other options were not picked:

- Option (b), fork `main` merged or fast-forwarded to the latest upstream release: a no-op. Fork `main` already contains the full 2.1.1 release, and upstream `main` has not moved past it. There is nothing to merge, so merge risk is avoided by not merging at all.
- Option (c), branch off upstream latest directly: would drop commit `c1e5c73d` and silently re-enable the R2 bucket binding in `server/wrangler.toml`. That reverses a deliberate deploy choice of his. Rejected.

Other branches, for the record and left untouched: fork `excalidraw` and fork `yaos3` each match their upstream counterparts exactly (0 ahead, 0 behind) at the time of this check. Upstream also has a `client-remake` branch with no fork counterpart. None of those are the base for this work. They carry different schema work and are not mainline 2.1.1.

## Fix scope waiting on this branch

From the November 2026 research, to be built and tested iteratively on a vault copy, with acceptance tests passing before any live wiring is even proposed:

- SYNC-01: delete-while-disabled resurrection.
- SYNC-02: re-enable discard edge.
- ISSUE-68: idle auth rejection and false receipts.
- ISSUE-23: Canvas rollback and Excalidraw freeze.
- ISSUE-19: .base rollback.

## Files that are Thunder's in this repo

- `THUNDER.md` (this file)
- `yaos-thunder-state.json`

Everything else on this branch is upstream 2.1.1 plus the one preserved fork commit above, until fix work lands and is documented here as it lands.

## State

See `yaos-thunder-state.json` for the recorded base commit, base version, schema version, branch, and date.

## Customization defaults, List A (local only, 2026-11-03)

Implemented from `~/workspace/yaos-fix-work/customization.md`, List A only. Nothing here is pushed, deployed, or live. The live worker is unchanged; the ticket TTL below is staged config that takes effect only on a redeploy Thunder orders separately.

- A1: attachment sync defaults off (`DEFAULT_SETTINGS.enableAttachmentSync`), and the migration that forced it back on for settings without an explicit choice is removed. A stored choice is kept as stored. Toggle stays in settings.
- A2: once capabilities are known and report no R2 (attachments and snapshots both off), the background capability poll backs off from 30 seconds to 6 hours. Startup and manual settings refreshes still re-check immediately.
- A3: a device with no stored name is seeded from the platform (iPhone, Android, Mac, Windows PC, Linux PC) instead of `device-` plus a timestamp. An existing name is never renamed, and the name stays editable in settings. No new prompt modal was added; that part stays for Thunder's call.
- A4: the update manifest URL points at his fork (`thunder-mythos/yaos` releases) instead of upstream, so upstream releases stop reading as updates he should take.
- A5: staged only in `server/wrangler.toml` as `YAOS_TICKET_TTL_MS = "3600000"` (60 minutes). Live worker unchanged until a redeploy.
- A6: external edits default to `closed-only` instead of `always`. Reversible in settings, Advanced, "Edits from other apps".
- A7: remote cursors default off. Toggle stays in the Collaboration group.
- A8: no code change, deliberate decisions recorded here: `maxFileSizeKB` stays 2048 and `attachmentConcurrency` stays 1, because his sample data fits both with headroom and concurrency 1 matches the un-abortable transfer note in code.

List B from the customization analysis is unchanged and stays a decision list for Thunder. Nothing from List B was implemented.

## R2 is an opt-in (docs only, 2026-11-03)

R2 is NOT enabled. The live worker is unchanged, no bucket is bound, and attachments and snapshots stay off. Text sync works without R2. R2 is only needed for the attachment plane and for snapshots, and the plugin already gates both on the server capability, so nothing breaks while it is off.

Enable path, for when Thunder orders it:

1. Enable R2 in the Cloudflare dashboard for the account that hosts the worker.
2. Create the R2 bucket named `yaos` (the bucket name in the commented binding in `server/wrangler.toml`).
3. Uncomment the `[[r2_buckets]]` block in `server/wrangler.toml` (binding `YAOS_BUCKET`, bucket `yaos`).
4. Redeploy the worker. This is a separate step Thunder orders on its own; it is not done as part of this docs change, and the ticket TTL staged in the same file takes effect at that redeploy too.
5. In plugin settings, turn on attachments or snapshots. The Attachments group in settings states the R2 requirement on its face.

Until those steps run, leave the binding commented out.

## Per-category conflict policy: Waypoint folder notes (v1, 2026-11-03)

Implemented in `src/runtime/reconcile/conflictCategoryPolicy.ts`, hooked into `src/runtime/reconciliationController.ts` at the two points where a markdown divergence is decided as a conflict: the closed-file reconcile path (planner returned create-conflict-artifact) and the bound-file ambiguous-divergence handling (the path the SYNC-02 both-changed gate feeds into). Normal files are untouched.

- Structure: a category has a name, a detector, and a strategy, in one small policy module (`CONFLICT_CATEGORIES`). This structure exists so more categories can be added later without new plumbing. Only the Waypoint category is implemented in v1.
- Policy: Waypoint folder notes resolve NEWEST WINS, silently. The newer side replaces the older side wholesale. No conflict artifact file is created, and no character-level CRDT merge of the two versions is attempted for that file.
- Why: a Waypoint block is machine-generated from the folder contents, so the newer regeneration is the more accurate one. Merging two regenerations character by character is what garbled the links on 2026-10-09; preserving the loser as a conflict note only litters the vault with stale generated lists.
- Detector rule: a file qualifies ONLY if BOTH hold. (a) Folder note shape: the file basename (without .md) equals its parent folder name, the Waypoint plugin's default folder note rule. (b) Its content contains a matched marker pair in order, either `%% Begin Waypoint %%` then `%% End Waypoint %%`, or `%% Begin Landmark %%` then `%% End Landmark %%`. The markers are hardcoded constants in the plugin and are never customisable. The pair may appear in the local or the incoming version; a freshly regenerated note always carries it. A folder-named note without the markers never qualifies, and a note containing markers but not folder-shaped never qualifies. A lone or reversed marker does not qualify, and the bare trigger flags (`%% Waypoint %%`, `%% Landmark %%`) do not qualify: they mean the block has not been generated yet.
- Newest signal: disk side is the file's disk mtime; CRDT side is the mtime recorded in the file's CRDT metadata (fileMeta mtime). These are the edit times the reconcile code already tracks, and the pair the existing conflict code already orders by. Both are imperfect (the CRDT metadata mtime is stamped when the CRDT side creates or re-registers the file, not on every remote edit), but they are the best signals present in that code path. If either time is missing, or both are equal, there is no provably newer side: the policy stays silent and normal conflict handling runs.
- Deliberate v1 choice: newest-wins applies to the WHOLE file, including any user text outside the generated block, even though the Waypoint plugin itself preserves outside text when it regenerates (it rewrites only the marked block). Simplicity wins for v1; the cost is that, in a conflict where both sides also edited outside the block differently, the losing side's outside-block edits are discarded with the rest of its version.
