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
