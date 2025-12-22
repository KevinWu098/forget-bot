import { sleep } from "workflow";

export async function remindWorkflow(
    sentAt: number,
    time: string,
    message: string,
    ephemeral: boolean,
    userId: string,
    channelId: string | undefined,
    environment: "development" | "production",
    publishToChannel: boolean
) {
    "use workflow";

    // Calculate duration inline to avoid step overhead
    const durationMs = calculateDuration(time, sentAt);

    if (!durationMs) {
        throw new Error(
            "Could not parse time. Please use formats like '5 minutes', 'tomorrow at 3pm', '2 hours', '30 seconds', etc."
        );
    }

    await sleep(durationMs);

    const scheduledFor = sentAt + durationMs;
    await sendDiscordMessage(
        userId,
        message,
        channelId,
        environment,
        publishToChannel,
        scheduledFor
    );

    return {
        content: message,
        ephemeral: ephemeral,
    };
}

function calculateDuration(time: string, _sentAt: number): number | null {
    console.info(`Parsing time: "${time}"`);

    // NOTE: This parsing logic is duplicated from @/lib/parse-duration.ts
    // because workflow functions must be self-contained and cannot dynamically
    // import external modules. The logic is kept in sync manually.

    // Parse simple duration formats (e.g., "5 minutes", "30 seconds", "2 hours")
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
                console.info(`Duration parsed: ${amount * multiplier}ms`);
                return amount * multiplier;
            }
        }
    }

    // TODO: Add support for complex date/time parsing with chrono-node
    // For now, only simple durations are supported
    return null;
}

async function sendDiscordMessage(
    userId: string,
    message: string,
    channelId: string | undefined,
    environment: "development" | "production",
    publishToChannel: boolean,
    scheduledFor: number
) {
    "use step";

    const { REST, Routes } = await import("discord.js");
    const { env } = await import("@/env");
    const { redis } = await import("@/lib/redis");

    // Use the correct token based on environment
    const token =
        environment === "development"
            ? env.DISCORD_TOKEN_DEV
            : env.DISCORD_TOKEN;

    const rest = new REST({ version: "10" }).setToken(token);

    try {
        const content = `⏰ **Reminder:** ${message}`;

        // Try publishing to the originating channel if requested.
        // If that fails (missing perms/app not installed to guild/etc), fall back to DM.
        if (publishToChannel && channelId) {
            try {
                await rest.post(Routes.channelMessages(channelId), {
                    body: { content },
                });
            } catch (error) {
                console.warn(
                    "Channel publish failed; falling back to DM",
                    error
                );
                const dmChannel = (await rest.post(Routes.userChannels(), {
                    body: { recipient_id: userId },
                })) as { id: string };
                await rest.post(Routes.channelMessages(dmChannel.id), {
                    body: {
                        content: `${content}\n\n(Couldn’t publish in the channel, so I DM’d you instead.)`,
                    },
                });
            }
        } else {
            const dmChannel = (await rest.post(Routes.userChannels(), {
                body: { recipient_id: userId },
            })) as { id: string };
            await rest.post(Routes.channelMessages(dmChannel.id), {
                body: { content },
            });
        }

        console.info(
            `✅ [${environment.toUpperCase()}] Reminder sent to user ${userId}: ${message}`
        );

        const reminderIds = await redis.smembers(`user:${userId}:reminders`);

        for (const runId of reminderIds) {
            const reminderData = (await redis.hgetall(
                `reminder:${runId}`
            )) as Record<string, string>;

            if (
                reminderData &&
                reminderData.message === message &&
                reminderData.scheduledFor === String(scheduledFor)
            ) {
                await redis.srem(`user:${userId}:reminders`, runId);
                await redis.del(`reminder:${runId}`);
                break;
            }
        }
    } catch (error) {
        console.error(`❌ Failed to send reminder to user ${userId}:`, error);
        throw error;
    }
}
