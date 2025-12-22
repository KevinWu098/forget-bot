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
 * Parses simple duration formats like "5 minutes", "30 seconds", "2 hours", etc.
 * Supports: seconds (s), minutes (m), hours (h), days (d), weeks (w)
 * @param time - Time string to parse (e.g., "5 minutes", "2h", "30s")
 * @returns Duration in milliseconds, or null if parsing fails
 */
export function parseSimpleDuration(time: string): number | null {
    const normalized = time.toLowerCase().trim();

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

    return null;
}
