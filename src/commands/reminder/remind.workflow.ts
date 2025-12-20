import { sleep } from "workflow";

export async function remindWorkflow(
    sentAt: number,
    time: string,
    message: string,
    ephemeral: boolean,
    userId: string,
    channelId: string | undefined,
    environment: "development" | "production"
) {
    "use workflow";

    const durationMs = await calculateDuration(time, sentAt);

    if (!durationMs) {
        throw new Error(
            "Could not parse time. Please use formats like '5 minutes', 'tomorrow at 3pm', '2 hours', '30 seconds', etc."
        );
    }

    await sleep(durationMs);

    await sendDiscordMessage(userId, message, channelId, environment);

    return {
        content: message,
        ephemeral: ephemeral,
    };
}

async function calculateDuration(
    time: string,
    sentAt: number
): Promise<number | null> {
    "use step";

    const now = new Date(sentAt);

    console.info(
        `Parsing time: "${time}" with reference date: ${now.toISOString()}`
    );

    // First try simple duration parsing (e.g., "5 minutes", "30 seconds", "2 hours")
    const simpleDuration = parseSimpleDuration(time);
    if (simpleDuration) {
        console.info(`Simple duration parsed: ${simpleDuration}ms`);
        return simpleDuration;
    }

    // Fall back to chrono-node for more complex date/time parsing
    const chrono = await import("chrono-node");
    const parsedResults = chrono.parse(time, now);

    console.info(`Chrono parsed ${parsedResults.length} results`);

    if (parsedResults.length === 0) {
        return null;
    }

    const parsedDate = parsedResults[0]?.start.date();

    if (!parsedDate) {
        return null;
    }

    const durationMs = parsedDate.getTime() - now.getTime();

    console.info(
        `Duration calculated: ${durationMs}ms (${durationMs / 1000 / 60} minutes)`
    );

    if (durationMs <= 0) {
        return null;
    }

    return durationMs;
}

function parseSimpleDuration(time: string): number | null {
    // Parse simple duration formats like "5 minutes", "30 seconds", "2 hours", etc.
    const normalized = time.toLowerCase().trim();

    // Match patterns like "5 minutes", "5m", "5 mins", etc.
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

async function sendDiscordMessage(
    userId: string,
    message: string,
    _channelId: string | undefined,
    environment: "development" | "production"
) {
    "use step";

    const { REST, Routes } = await import("discord.js");
    const { env } = await import("@/env");

    // Use the correct token based on environment
    const token =
        environment === "development"
            ? env.DISCORD_TOKEN_DEV
            : env.DISCORD_TOKEN;

    const rest = new REST({ version: "10" }).setToken(token);

    try {
        // Create a DM channel with the user
        const dmChannel = (await rest.post(Routes.userChannels(), {
            body: {
                recipient_id: userId,
            },
        })) as { id: string };

        // Send the reminder message to the DM channel
        await rest.post(Routes.channelMessages(dmChannel.id), {
            body: {
                content: `⏰ **Reminder:** ${message}`,
            },
        });

        console.info(
            `✅ [${environment.toUpperCase()}] Reminder sent to user ${userId}: ${message}`
        );
    } catch (error) {
        console.error(`❌ Failed to send reminder to user ${userId}:`, error);
        throw error;
    }
}
