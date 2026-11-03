import { App, TFile, type FileStats } from "obsidian";
import * as Y from "yjs";
import { BlobSyncManager } from "../../src/sync/blobSync";
import { VaultSync } from "../../src/sync/vaultSync";
import type { BlobRef } from "../../src/types";
import { suite } from "../harness.ts";

const s = suite("blob-canvas-rollback");

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
	return { vault, files, put, manager, traces };
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

// ISSUE-23: a Canvas file edited locally after the last sync must not be
// rolled back by a stale or concurrent remote version arriving later.
s.section("Test 1: Canvas diverged from synced baseline is preserved, not overwritten");
{
	const { manager, files, put, traces } = makeHarness();
	put("board.canvas", bytes("local-new"));
	const syncedHash = await sha256Hex(bytes("synced-old"));
	// Raw cache entry is the last synced hash. Its stat deliberately does
	// not match the edited file, so a stat-matched lookup returns null.
	manager["hashCache"]["board.canvas"] = { mtime: 0, size: 999, hash: syncedHash };

	await runDownload(manager, "board.canvas", bytes("remote-new"));

	const conflict = findConflict(files, "board", ".canvas");
	s.check(text(files.get("board.canvas")!.data) === "local-new", "local Canvas edit is preserved");
	s.check(!!conflict, "remote Canvas bytes are written to a conflict artifact");
	s.check(
		conflict ? text(files.get(conflict)!.data) === "remote-new" : false,
		"conflict artifact contains remote Canvas bytes",
	);
	s.check(
		traces.some(
			(event) =>
				event.msg === "download-conflict-quarantined" &&
				event.details?.reason === "existing-diverged-before-download",
		),
		"diverged-before-download quarantine is traced",
	);
}

s.section("Test 2: Canvas at its synced baseline is still overwritten by remote");
{
	const { manager, files, put, traces } = makeHarness();
	const stored = put("board.canvas", bytes("local-old"));
	const localHash = await sha256Hex(bytes("local-old"));
	manager["hashCache"]["board.canvas"] = {
		mtime: stored.file.stat.mtime,
		size: stored.file.stat.size,
		hash: localHash,
	};

	await runDownload(manager, "board.canvas", bytes("remote-new"));

	const conflict = findConflict(files, "board", ".canvas");
	s.check(text(files.get("board.canvas")!.data) === "remote-new", "stale Canvas is overwritten by remote bytes");
	s.check(!conflict, "no conflict artifact is created for a stale overwrite");
	s.check(
		traces.some(
			(event) => event.msg === "download-overwrite-decision" && event.details?.action === "overwrite-existing",
		),
		"stale overwrite decision is traced",
	);
}

s.section("Test 3: Canvas with a pending local upload is preserved, not overwritten");
{
	const { manager, files, put } = makeHarness();
	const stored = put("board.canvas", bytes("local-new"));
	const localHash = await sha256Hex(bytes("local-new"));
	manager["hashCache"]["board.canvas"] = {
		mtime: stored.file.stat.mtime,
		size: stored.file.stat.size,
		hash: localHash,
	};
	manager["uploadQueue"].set("board.canvas", {
		path: "board.canvas",
		sizeBytes: stored.file.stat.size,
		retries: 0,
		status: "pending",
		readyAt: 0,
		rerunResets: 0,
	});

	await runDownload(manager, "board.canvas", bytes("remote-new"));

	const conflict = findConflict(files, "board", ".canvas");
	s.check(text(files.get("board.canvas")!.data) === "local-new", "Canvas with pending upload is preserved");
	s.check(!!conflict, "remote Canvas bytes are written to a conflict artifact when upload is pending");
}

await s.done();
