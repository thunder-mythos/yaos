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
