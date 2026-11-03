/**
 * One-time device name prompt: decision logic.
 *
 * Iteration 1 seeded a readable device name from the platform when no
 * name was stored (iPhone, Android, Mac, Windows PC, Linux PC). This
 * module decides whether the one-time prompt modal should appear so a
 * user still on that auto-seeded default can keep it or replace it.
 *
 * The decision is a pure function so it is testable without Obsidian:
 * show only when the prompt has not been handled yet AND the current
 * name is still an auto-seeded default. A custom name never prompts,
 * and a handled prompt never prompts again.
 */

/** Platform flags needed to derive the auto-seeded name. Structurally
 * matches the subset of Obsidian Platform that main.ts reads. */
export interface DevicePlatformFlags {
	isIosApp: boolean;
	isAndroidApp: boolean;
	isMacOS: boolean;
	isWin: boolean;
	isLinux: boolean;
}

/**
 * The auto-seeded device name for a platform, or null when no platform
 * matches. Mirrors the seeding in main.ts; the fallback there is a
 * timestamp id, which is recognised separately by pattern below.
 */
export function autoDeviceNameForPlatform(platform: DevicePlatformFlags): string | null {
	if (platform.isIosApp) return "iPhone";
	if (platform.isAndroidApp) return "Android";
	if (platform.isMacOS) return "Mac";
	if (platform.isWin) return "Windows PC";
	if (platform.isLinux) return "Linux PC";
	return null;
}

/** Every platform-derived auto-seeded name. */
export const AUTO_DEVICE_NAMES: readonly string[] = [
	"iPhone",
	"Android",
	"Mac",
	"Windows PC",
	"Linux PC",
];

/**
 * The pre-platform seeding shape (upstream default and the fallback in
 * main.ts when no platform matches): `device-` plus a base36 stamp.
 * A stored name in this shape is an auto-seeded default, not a choice.
 */
const LEGACY_AUTO_DEVICE_NAME_RE = /^device-[a-z0-9]+$/iu;

export function isAutoSeededDeviceName(deviceName: string, autoDefaultName: string | null): boolean {
	if (!deviceName) return false;
	if (autoDefaultName !== null && deviceName === autoDefaultName) return true;
	if (AUTO_DEVICE_NAMES.includes(deviceName)) return true;
	return LEGACY_AUTO_DEVICE_NAME_RE.test(deviceName);
}

export interface DeviceNamePromptInput {
	deviceName: string;
	/** Auto-seeded default for this platform, or null when unknown. */
	autoDefaultName: string | null;
	/** Persisted flag: the prompt was confirmed or the name was set by hand. */
	promptHandled: boolean;
}

/**
 * Show the one-time prompt only when it has never been handled and the
 * current name is still the auto-seeded default for this platform.
 */
export function shouldShowDeviceNamePrompt(input: DeviceNamePromptInput): boolean {
	if (input.promptHandled) return false;
	return isAutoSeededDeviceName(input.deviceName, input.autoDefaultName);
}

export interface DeviceNameChoice {
	deviceName: string;
	deviceNamePromptHandled: boolean;
}

/**
 * Apply a prompt confirmation: save the edited name (blank keeps the
 * prefilled seeded name) and mark the prompt handled so it never
 * shows again.
 */
export function confirmDeviceNameChoice(
	current: { deviceName: string },
	editedName: string,
): DeviceNameChoice {
	const trimmed = editedName.trim();
	return {
		deviceName: trimmed || current.deviceName,
		deviceNamePromptHandled: true,
	};
}
