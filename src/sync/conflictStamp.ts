/**
 * Shared timestamp for conflict artifact names.
 *
 * Minute precision local time, formatted `YYYY-MM-DD HHMM`. Local time is
 * what the user sees on the device that minted the artifact, and minute
 * precision keeps names short. Collision suffixes handle two artifacts
 * minted in the same minute for the same path.
 */
export function formatConflictStamp(date: Date): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`;
}
