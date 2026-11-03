import {
	DEFAULT_SETTINGS,
	readVaultSyncSettings,
} from "../../src/settings/settingsStore";
import {
	AUTO_DEVICE_NAMES,
	autoDeviceNameForPlatform,
	confirmDeviceNameChoice,
	isAutoSeededDeviceName,
	shouldShowDeviceNamePrompt,
	type DevicePlatformFlags,
} from "../../src/settings/deviceNamePrompt";
import { suite } from "../harness.ts";

const s = suite("device-name-prompt");

const NO_FLAGS: DevicePlatformFlags = {
	isIosApp: false,
	isAndroidApp: false,
	isMacOS: false,
	isWin: false,
	isLinux: false,
};

s.section("Test 1: platform mapping matches the iteration 1 seeding");
{
	s.check(autoDeviceNameForPlatform({ ...NO_FLAGS, isIosApp: true }) === "iPhone", "iOS seeds iPhone");
	s.check(autoDeviceNameForPlatform({ ...NO_FLAGS, isAndroidApp: true }) === "Android", "Android seeds Android");
	s.check(autoDeviceNameForPlatform({ ...NO_FLAGS, isMacOS: true }) === "Mac", "macOS seeds Mac");
	s.check(autoDeviceNameForPlatform({ ...NO_FLAGS, isWin: true }) === "Windows PC", "Windows seeds Windows PC");
	s.check(autoDeviceNameForPlatform({ ...NO_FLAGS, isLinux: true }) === "Linux PC", "Linux seeds Linux PC");
	s.check(autoDeviceNameForPlatform(NO_FLAGS) === null, "unknown platform has no seeded name");
	s.check(AUTO_DEVICE_NAMES.length === 5, "five platform names are recognised");
}

s.section("Test 2: default name and no flag shows the prompt");
{
	for (const name of AUTO_DEVICE_NAMES) {
		s.check(
			shouldShowDeviceNamePrompt({ deviceName: name, autoDefaultName: name, promptHandled: false }),
			`shows for auto default ${name}`,
		);
	}
	s.check(
		shouldShowDeviceNamePrompt({ deviceName: "Mac", autoDefaultName: null, promptHandled: false }),
		"shows for a platform name even when the platform lookup is unavailable",
	);
	s.check(
		shouldShowDeviceNamePrompt({ deviceName: "device-mabc123", autoDefaultName: null, promptHandled: false }),
		"shows for the legacy timestamp seed shape",
	);
}

s.section("Test 3: handled flag suppresses the prompt");
{
	s.check(
		!shouldShowDeviceNamePrompt({ deviceName: "Mac", autoDefaultName: "Mac", promptHandled: true }),
		"default name with flag set does not show",
	);
	s.check(
		!shouldShowDeviceNamePrompt({ deviceName: "device-mabc123", autoDefaultName: null, promptHandled: true }),
		"legacy seed with flag set does not show",
	);
}

s.section("Test 4: a custom name never shows the prompt");
{
	s.check(
		!shouldShowDeviceNamePrompt({ deviceName: "Thunder Laptop", autoDefaultName: "Mac", promptHandled: false }),
		"custom name does not show",
	);
	s.check(
		!shouldShowDeviceNamePrompt({ deviceName: "", autoDefaultName: "Mac", promptHandled: false }),
		"empty name does not show",
	);
	s.check(
		!isAutoSeededDeviceName("Thunder Laptop", "Mac"),
		"custom name is not auto-seeded",
	);
	s.check(
		isAutoSeededDeviceName("Windows PC", "Windows PC"),
		"platform default is auto-seeded",
	);
}

s.section("Test 5: confirming saves the name and sets the flag");
{
	const kept = confirmDeviceNameChoice({ deviceName: "Mac" }, "Mac");
	s.check(kept.deviceName === "Mac", "keeping the prefilled name saves it unchanged");
	s.check(kept.deviceNamePromptHandled === true, "keeping marks the prompt handled");
	const edited = confirmDeviceNameChoice({ deviceName: "Mac" }, "  Studio Mac  ");
	s.check(edited.deviceName === "Studio Mac", "an edited name is saved trimmed");
	s.check(edited.deviceNamePromptHandled === true, "editing marks the prompt handled");
	const blank = confirmDeviceNameChoice({ deviceName: "Mac" }, "   ");
	s.check(blank.deviceName === "Mac", "a blank edit keeps the prefilled name");
	s.check(blank.deviceNamePromptHandled === true, "a blank edit still marks the prompt handled");
	// After confirm, the decision flips to no-show for both outcomes.
	s.check(
		!shouldShowDeviceNamePrompt({
			deviceName: kept.deviceName,
			autoDefaultName: "Mac",
			promptHandled: kept.deviceNamePromptHandled,
		}),
		"after keep, the prompt does not show again",
	);
	s.check(
		!shouldShowDeviceNamePrompt({
			deviceName: edited.deviceName,
			autoDefaultName: "Mac",
			promptHandled: edited.deviceNamePromptHandled,
		}),
		"after edit, the prompt does not show again",
	);
}

s.section("Test 6: the handled flag persists through settings load");
{
	s.check(DEFAULT_SETTINGS.deviceNamePromptHandled === false, "fresh settings start unhandled");
	const fresh = readVaultSyncSettings(null);
	s.check(fresh.settings.deviceNamePromptHandled === false, "loaded fresh settings are unhandled");
	const stored = readVaultSyncSettings({ deviceNamePromptHandled: true });
	s.check(stored.settings.deviceNamePromptHandled === true, "a stored handled flag is preserved");
}

await s.done();
