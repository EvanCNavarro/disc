/**
 * Browser-side timezone utilities.
 * D1 stores cron_time as HH:MM in UTC. The UI displays and accepts local time.
 */

/** Get the user's IANA timezone (e.g. "America/New_York") */
export function getBrowserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Get a short timezone label (e.g. "EST", "CET") */
export function getTimezoneAbbr(): string {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZoneName: "short",
	});
	const parts = formatter.formatToParts(new Date());
	return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** Get a long timezone label (e.g. "Eastern Standard Time") */
export function getTimezoneLong(): string {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZoneName: "long",
	});
	const parts = formatter.formatToParts(new Date());
	return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/**
 * Convert UTC HH:MM to local HH:MM.
 * Uses a reference date to get the correct offset (DST-aware).
 */
export function utcToLocal(utcTime: string): string {
	const [h, m] = utcTime.split(":").map(Number);
	const ref = new Date();
	ref.setUTCHours(h, m, 0, 0);
	const localH = ref.getHours().toString().padStart(2, "0");
	const localM = ref.getMinutes().toString().padStart(2, "0");
	return `${localH}:${localM}`;
}

/**
 * Convert local HH:MM to UTC HH:MM.
 * Uses a reference date to get the correct offset (DST-aware).
 */
export function localToUtc(localTime: string): string {
	const [h, m] = localTime.split(":").map(Number);
	const ref = new Date();
	ref.setHours(h, m, 0, 0);
	const utcH = ref.getUTCHours().toString().padStart(2, "0");
	const utcM = ref.getUTCMinutes().toString().padStart(2, "0");
	return `${utcH}:${utcM}`;
}

/**
 * Convert UTC HH:MM to a user-friendly local time string.
 * e.g. "04:20" UTC -> "11:20 PM EST" (for UTC-5)
 */
export function formatLocalTime(utcTime: string): string {
	const local = utcToLocal(utcTime);
	const [h, m] = local.split(":").map(Number);
	const ampm = h >= 12 ? "PM" : "AM";
	const h12 = h % 12 || 12;
	const abbr = getTimezoneAbbr();
	return `${h12}:${m.toString().padStart(2, "0")} ${ampm} ${abbr}`;
}
