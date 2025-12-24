import * as chrono from "chrono-node";

const LA_TZ = "America/Los_Angeles";

type YMD = { y: number; m: number; d: number };

function ymdInTimeZone(date: Date, timeZone: string): YMD {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "";

    return {
        y: Number(get("year")),
        m: Number(get("month")),
        d: Number(get("day")),
    };
}

function formatTimeLA(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: LA_TZ,
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatDateLA(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: LA_TZ,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function isSameYmd(a: YMD, b: YMD): boolean {
    return a.y === b.y && a.m === b.m && a.d === b.d;
}

function addDays(ymd: YMD, days: number): YMD {
    // Convert YMD to a UTC date, add days in UTC, then re-project back into LA for comparison.
    // This avoids locale-dependent parsing.
    const utc = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    utc.setUTCDate(utc.getUTCDate() + days);
    return ymdInTimeZone(utc, LA_TZ);
}

/**
 * Formats a timestamp as a human-friendly LA-local relative string.
 *
 * Examples:
 * - "Today at 3:05 PM"
 * - "Tomorrow at 9:00 AM"
 * - "Monday at 2:30 PM"
 * - "January 5, 2026 at 4:10 PM"
 */
export function formatRelativeLA(
    scheduledForMs: number,
    nowMs: number = Date.now()
): string {
    const now = new Date(nowMs);
    const scheduled = new Date(scheduledForMs);

    const nowYmd = ymdInTimeZone(now, LA_TZ);
    const schedYmd = ymdInTimeZone(scheduled, LA_TZ);

    const time = formatTimeLA(scheduled);

    if (isSameYmd(schedYmd, nowYmd)) {
        return `Today at ${time}`;
    }
    if (isSameYmd(schedYmd, addDays(nowYmd, 1))) {
        return `Tomorrow at ${time}`;
    }

    // Within the next 6 days: use weekday
    for (let i = 2; i <= 6; i++) {
        if (isSameYmd(schedYmd, addDays(nowYmd, i))) {
            const weekday = new Intl.DateTimeFormat("en-US", {
                timeZone: LA_TZ,
                weekday: "long",
            }).format(scheduled);
            return `${weekday} at ${time}`;
        }
    }

    return `${formatDateLA(scheduled)} at ${time}`;
}

/**
 * Creates a Date object for a specific time in LA timezone.
 * @param year - Full year (e.g., 2025)
 * @param month - Month (1-12)
 * @param day - Day of month (1-31)
 * @param hour - Hour in 24-hour format (0-23)
 * @param minute - Minute (0-59)
 * @returns Date object representing that LA time
 */
function createLADate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number
): Date {
    // Create a string in LA timezone and parse it
    // Format: "2025-12-23T02:00:00" interpreted as LA time
    const timeStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

    // Use Intl to create a Date in LA timezone
    // We'll use a formatter to get the offset, then adjust
    const testDate = new Date(timeStr + "Z"); // Start with UTC
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: LA_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    // Get what time it would be in LA for various UTC times
    // We'll use a binary search approach, but simpler: just try the naive approach
    // and then adjust based on the actual LA time we get back

    // Parse as if it were UTC, then figure out the offset
    let candidate = new Date(
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
    );

    // Get LA components of this candidate
    const parts = formatter.formatToParts(candidate);
    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "";

    const laHour = Number(get("hour"));
    const laMinute = Number(get("minute"));
    const laDay = Number(get("day"));
    const laMonth = Number(get("month"));
    const laYear = Number(get("year"));

    // Calculate the difference in minutes
    const targetMinutes = hour * 60 + minute;
    const actualMinutes = laHour * 60 + laMinute;
    let diffMinutes = targetMinutes - actualMinutes;

    // Check if we crossed a day boundary
    if (laYear !== year || laMonth !== month || laDay !== day) {
        // Adjust for day crossing
        if (laDay < day || laMonth < month || laYear < year) {
            diffMinutes += 24 * 60;
        } else {
            diffMinutes -= 24 * 60;
        }
    }

    // Adjust the candidate
    candidate = new Date(candidate.getTime() + diffMinutes * 60 * 1000);

    return candidate;
}

/**
 * Gets the current LA timezone components.
 */
function getLAComponents(nowMs: number): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
} {
    const now = new Date(nowMs);
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: LA_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(now);

    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "";

    return {
        year: Number(get("year")),
        month: Number(get("month")),
        day: Number(get("day")),
        hour: Number(get("hour")),
        minute: Number(get("minute")),
        second: Number(get("second")),
    };
}

/**
 * Parses duration or natural language time expressions in LA timezone.
 * Supports: seconds (s), minutes (m), hours (h), days (d), weeks (w), and
 * natural phrases like "in 5 minutes" or "tomorrow at 3pm" via chrono-node.
 *
 * IMPORTANT: Natural language times like "3pm" or "tomorrow at 2pm" are
 * interpreted in LA timezone (America/Los_Angeles), not the system timezone.
 *
 * @param time - Time string to parse (e.g., "5 minutes", "2h", "30s", "tomorrow at 3pm")
 * @returns Duration in milliseconds, or null if parsing fails
 */
export function parseSimpleDuration(
    time: string,
    nowMs: number = Date.now()
): number | null {
    const trimmed = time.trim();
    const normalized = trimmed.toLowerCase();

    // First, try duration patterns (these are timezone-independent)
    const patterns = [
        { regex: /^(\d+\.?\d*)\s*(seconds?|secs?|s)$/i, multiplier: 1000 },
        {
            regex: /^(\d+\.?\d*)\s*(minutes?|mins?|m)$/i,
            multiplier: 60 * 1000,
        },
        {
            regex: /^(\d+\.?\d*)\s*(hours?|hrs?|h)$/i,
            multiplier: 60 * 60 * 1000,
        },
        {
            regex: /^(\d+\.?\d*)\s*(days?|d)$/i,
            multiplier: 24 * 60 * 60 * 1000,
        },
        {
            regex: /^(\d+\.?\d*)\s*(weeks?|w)$/i,
            multiplier: 7 * 24 * 60 * 60 * 1000,
        },
    ];

    for (const { regex, multiplier } of patterns) {
        const match = normalized.match(regex);
        if (match && match[1]) {
            const amount = parseFloat(match[1]);
            if (!isNaN(amount) && amount > 0) {
                return amount * multiplier;
            }
        }
    }

    // Get current LA time components
    const laComponents = getLAComponents(nowMs);

    // Try to match simple time patterns manually (in LA timezone)
    // Patterns like "2am", "3pm", "14:30", "2:30 pm"
    const timeOnlyPattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
    const timeMatch = normalized.match(timeOnlyPattern);

    if (timeMatch) {
        let hour = Number(timeMatch[1]);
        const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
        const meridiem = timeMatch[3]?.toLowerCase();

        // Convert to 24-hour format
        if (meridiem === "pm" && hour !== 12) {
            hour += 12;
        } else if (meridiem === "am" && hour === 12) {
            hour = 0;
        }

        // Create target date in LA timezone for today
        let targetDate = createLADate(
            laComponents.year,
            laComponents.month,
            laComponents.day,
            hour,
            minute
        );

        // If the time has already passed today, schedule for tomorrow
        if (targetDate.getTime() <= nowMs) {
            // Add one day
            const tomorrow = new Date(
                targetDate.getTime() + 24 * 60 * 60 * 1000
            );
            const tomorrowLA = getLAComponents(tomorrow.getTime());
            targetDate = createLADate(
                tomorrowLA.year,
                tomorrowLA.month,
                tomorrowLA.day,
                hour,
                minute
            );
        }

        const durationMs = targetDate.getTime() - nowMs;
        return durationMs > 0 ? durationMs : null;
    }

    // Try "tomorrow at X" pattern
    const tomorrowPattern = /^tomorrow\s+(?:at\s+)?(.+)$/i;
    const tomorrowMatch = trimmed.match(tomorrowPattern);

    if (tomorrowMatch) {
        const timeStr = tomorrowMatch[1];
        const timeParsed = timeStr?.match(timeOnlyPattern);

        if (timeParsed) {
            let hour = Number(timeParsed[1]);
            const minute = timeParsed[2] ? Number(timeParsed[2]) : 0;
            const meridiem = timeParsed[3]?.toLowerCase();

            if (meridiem === "pm" && hour !== 12) {
                hour += 12;
            } else if (meridiem === "am" && hour === 12) {
                hour = 0;
            }

            // Get tomorrow in LA timezone
            const tomorrowMs = nowMs + 24 * 60 * 60 * 1000;
            const tomorrowLA = getLAComponents(tomorrowMs);

            const targetDate = createLADate(
                tomorrowLA.year,
                tomorrowLA.month,
                tomorrowLA.day,
                hour,
                minute
            );

            const durationMs = targetDate.getTime() - nowMs;
            return durationMs > 0 ? durationMs : null;
        }
    }

    // Fall back to chrono for more complex expressions
    // Note: chrono will parse in system timezone, but for expressions like
    // "in 5 minutes" or "next Friday" the timezone doesn't matter much
    const parsedDate = chrono.parseDate(trimmed, new Date(nowMs), {
        forwardDate: true,
    });

    if (!parsedDate) {
        return null;
    }

    const durationMs = parsedDate.getTime() - nowMs;
    return durationMs > 0 ? durationMs : null;
}
