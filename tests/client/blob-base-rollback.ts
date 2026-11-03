import { App, TFile, type FileStats } from "obsidian";
import * as Y from "yjs";
import { BlobSyncManager } from "../../src/sync/blobSync";
import { VaultSync } from "../../src/sync/vaultSync";
import type { BlobRef } from "../../src/types";
import { suite } from "../harness.ts";

const s = suite("blob-base-rollback");

function bytes(text: string): ArrayBuffer {
	const encoded = new TextEncoder().encode(text);
	return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

function text(buffer: ArrayBuffer): string {
	return new TextDecoder().decode(buffer);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface StoredFile {
	file: TFile;
	data: ArrayBuffer;
}

function makeFile(path: string, stat: FileStats): TFile {
	const file = new TFile();
	file.path = path;
	file.stat = stat;
	return file;
}

function makeVaultFixture() {
	let clock = 1;
	const files = new Map<string, StoredFile>();
	function put(path: string, data: ArrayBuffer): StoredFile {
		const existing = files.get(path);
		const writtenAt = clock++;
		const stat: FileStats = {
			ctime: existing?.file.stat.ctime ?? writtenAt,
			mtime: writtenAt,
			size: data.byteLength,
		};
		const file = existing?.file ?? makeFile(path, stat);
		file.path = path;
		file.stat = stat;
		files.set(path, { file, data });
		return { file, data };
	}
	const vault = {
		getAbstractFileByPath: (path: string) => files.get(path)?.file ?? null,
		getFiles: () => Array.from(files.values()).map((stored) => stored.file),
		readBinary: async (file: TFile) => {
			const stored = files.get(file.path);
			if (!stored) throw new Error("missing file");
			return stored.data;
		},
		modifyBinary: async (file: TFile, data: ArrayBuffer) => {
			put(file.path, data);
		},
		createBinary: async (path: string, data: ArrayBuffer) => {
			if (files.has(path)) {
				const error = new Error("exists") as Error & { code?: string };
				error.code = "EEXIST";
				throw error;
			}
			put(path, data);
		},
		createFolder: async () => {},
		adapter: {
			stat: async (path: string) => files.get(path)?.file.stat ?? null,
		},
		configDir: ".obsidian",
	};
	return { vault, files, put };
}

function makeHarness() {
	const { vault, files, put } = makeVaultFixture();
	const traces: Array<{ source: string; msg: string; details?: Record<string, unknown> }> = [];
	const ydoc = new Y.Doc();
	const vaultSync = Object.assign(Object.create(VaultSync.prototype) as VaultSync, {
		ydoc,
		pathToBlob: ydoc.getMap<BlobRef>("pathToBlob"),
		blobTombstones: ydoc.getMap<{ deletedAt: number }>("blobTombstones"),
		debug: false,
	});
	const app = Object.assign(Object.create(App.prototype) as App, {
		vault,
		fileManager: {},
	});
	const manager = new BlobSyncManager(
		app,
		vaultSync,
		{
			host: "https://worker.example",
			token: "test",
			vaultId: "vault",
			maxAttachmentSizeKB: 1024,
			attachmentConcurrency: 1,
			debug: false,
		},
		{},
		(source, msg, details) => traces.push({ source, msg, details }),
	);
	return { vault, files, put, manager, traces, vaultSync };
}

async function runDownload(
	manager: BlobSyncManager,
	path: string,
	data: ArrayBuffer,
): Promise<string> {
	const hash = await sha256Hex(data);
	manager["blobClient"].download = async () => data;
	await manager["processDownload"]({
		path,
		hash,
		sizeBytes: data.byteLength,
		retries: 0,
		status: "processing",
		readyAt: 0,
		rerunResets: 0,
	});
	return hash;
}

function findConflict(files: Map<string, StoredFile>, stem: string, ext: string): string | undefined {
	return Array.from(files.keys()).find(
		(path) => path.startsWith(`${stem} (YAOS remote conflict`) && path.endsWith(ext),
	);
}

// ISSUE-19, .base half: .base files ride the same blob plane as .canvas,
// so the download-rollback fix must hold for them by name, not just in
// general. The bulk-clipping half is a separate, unproven shape and is
// not covered by this suite.
s.section("Test 1: .base diverged from synced baseline is preserved, not overwritten");
{
	const { manager, files, put, traces } = makeHarness();
	put("view.base", bytes("local-new"));
	const syncedHash = await sha256Hex(bytes("synced-old"));
	manager["hashCache"]["view.base"] = { mtime: 0, size: 999, hash: syncedHash };

	await runDownload(manager, "view.base", bytes("remote-new"));

	const conflict = findConflict(files, "view", ".base");
	s.check(text(files.get("view.base")!.data) === "local-new", "local .base edit is preserved");
	s.check(!!conflict, "remote .base bytes are written to a conflict artifact");
	s.check(
		conflict ? text(files.get(conflict)!.data) === "remote-new" : false,
		"conflict artifact contains remote .base bytes",
	);
	s.check(
		traces.some(
			(event) =>
				event.msg === "download-conflict-quarantined" &&
				event.details?.reason === "existing-diverged-before-download",
		),
		"diverged-before-download quarantine is traced for .base",
	);
}

s.section("Test 2: .base at its synced baseline is still overwritten by remote");
{
	const { manager, files, put } = makeHarness();
	const stored = put("view.base", bytes("local-old"));
	const localHash = await sha256Hex(bytes("local-old"));
	manager["hashCache"]["view.base"] = {
		mtime: stored.file.stat.mtime,
		size: stored.file.stat.size,
		hash: localHash,
	};

	await runDownload(manager, "view.base", bytes("remote-new"));

	const conflict = findConflict(files, "view", ".base");
	s.check(text(files.get("view.base")!.data) === "remote-new", "stale .base is overwritten by remote bytes");
	s.check(!conflict, "no conflict artifact is created for a stale .base overwrite");
}

// ISSUE-19, same-size offline edit: a .base layout change that keeps the
// file size identical must still reach the upload queue on authoritative
// reconcile, even when the hash cache has no stat-matching entry (the
// normal state after a restart, an offline edit, or a cache loss).
s.section("Test 3: same-size .base edit with no cache hit is queued for upload");
{
	const { manager, put, vaultSync } = makeHarness();
	manager["blobClient"].exists = async () => [];
	manager["blobClient"].upload = async () => {};
	const syncedHash = await sha256Hex(bytes("aaaaaaaaaa"));
	vaultSync.pathToBlob.set("view.base", { hash: syncedHash, size: 10 });
	put("view.base", bytes("bbbbbbbbbb"));

	const result = manager.reconcile("authoritative", []);

	s.check(result.uploadQueued === 1, "same-size edited .base is queued for upload");
}

s.section("Test 4: unchanged .base with cache matching CRDT is not queued");
{
	const { manager, put, vaultSync } = makeHarness();
	const stored = put("view.base", bytes("aaaaaaaaaa"));
	const syncedHash = await sha256Hex(bytes("aaaaaaaaaa"));
	vaultSync.pathToBlob.set("view.base", { hash: syncedHash, size: 10 });
	manager["hashCache"]["view.base"] = {
		mtime: stored.file.stat.mtime,
		size: stored.file.stat.size,
		hash: syncedHash,
	};

	const result = manager.reconcile("authoritative", []);

	s.check(result.uploadQueued === 0, "unchanged .base is not queued for upload");
}

await s.done();
