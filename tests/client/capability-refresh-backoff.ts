/**
 * Thunder fork List A2: once capabilities are known and report no R2
 * (attachments and snapshots both off), the background capability poll
 * backs off from 30 seconds to 6 hours. Startup and manual refreshes
 * bypass this gate, so this only quiets the idle background tick.
 */
import {
	CAPABILITY_REFRESH_INTERVAL_MS,
	CAPABILITY_REFRESH_INTERVAL_NO_R2_MS,
	CapabilityUpdateService,
} from "../../src/runtime/capabilityUpdateService";
import type { VaultSyncSettings } from "../../src/settings/settingsStore";
import { DEFAULT_SETTINGS } from "../../src/settings/settingsStore";
import type { ServerCapabilities } from "../../src/sync/serverCapabilities";
import { suite } from "../harness.ts";

const s = suite("capability-refresh-backoff");

function makeService(attachments: boolean | null, snapshots: boolean | null): CapabilityUpdateService {
	const settings: VaultSyncSettings = { ...DEFAULT_SETTINGS, host: "https://example.test" };
	const service = new CapabilityUpdateService({
		getSettings: () => settings,
		pluginVersion: "2.1.1",
		schemaVersion: 3,
		trace: () => {},
		log: () => {},
		persistPluginState: async () => {},
		hasSyncRuntime: () => false,
		isSyncConnectedAndProviderSynced: () => false,
		refreshAttachmentSyncRuntime: async () => {},
		triggerDailySnapshot: () => {},
		stopSyncRuntimeForCompatibility: () => {},
		setStatusError: () => {},
		scheduleTraceStateSnapshot: () => {},
		updateSettings: async () => {},
	});
	if (attachments !== null && snapshots !== null) {
		const capabilities: ServerCapabilities = {
			claimed: true,
			authMode: "claim",
			attachments,
			snapshots,
			serverVersion: "0.3.0",
			minPluginVersion: null,
			recommendedPluginVersion: null,
			schemaVersion: 3,
			updateProvider: null,
			updateRepoUrl: null,
			updateRepoBranch: null,
		};
		service.hydratePersistedCaches({ host: "https://example.test", capabilities }, null);
	}
	return service;
}

s.section("Backoff interval constant is 6 hours");
{
	s.check(
		CAPABILITY_REFRESH_INTERVAL_NO_R2_MS === 6 * 60 * 60 * 1000,
		"no-R2 backoff interval is 6 hours",
	);
	s.check(
		CAPABILITY_REFRESH_INTERVAL_NO_R2_MS > CAPABILITY_REFRESH_INTERVAL_MS,
		"no-R2 interval is longer than the standard 30 second interval",
	);
}

s.section("Unknown capabilities keep the 30 second poll");
{
	const service = makeService(null, null);
	s.check(
		service.shouldRefreshCapabilities(CAPABILITY_REFRESH_INTERVAL_MS),
		"unknown capabilities refresh at 30 seconds",
	);
}

s.section("Known R2 keeps the 30 second poll");
{
	const service = makeService(true, true);
	s.check(
		service.shouldRefreshCapabilities(CAPABILITY_REFRESH_INTERVAL_MS),
		"R2 capabilities refresh at 30 seconds",
	);
}

s.section("Known no-R2 backs off to 6 hours");
{
	const service = makeService(false, false);
	s.check(
		!service.shouldRefreshCapabilities(CAPABILITY_REFRESH_INTERVAL_MS),
		"no-R2 capabilities do not refresh at 30 seconds",
	);
	s.check(
		!service.shouldRefreshCapabilities(CAPABILITY_REFRESH_INTERVAL_NO_R2_MS - 1),
		"no-R2 capabilities do not refresh just before 6 hours",
	);
	s.check(
		service.shouldRefreshCapabilities(CAPABILITY_REFRESH_INTERVAL_NO_R2_MS),
		"no-R2 capabilities refresh at 6 hours",
	);
}

await s.done();
