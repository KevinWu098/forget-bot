import type { NodeEnv } from "@/env";
import { sleep } from "workflow";

export async function remindWorkflow(
    durationMs: number,
    scheduledForMs: number,
    message: string,
    ephemeral: boolean,
    userId: string,
    environment: NodeEnv,
    messageLink?: string,
    messagePreview?: string
) {
    "use workflow";

    if (!durationMs) {
        throw new Error(
            "Could not parse time. Please use formats like '5 minutes', 'tomorrow at 3pm', '2 hours', '30 seconds', etc."
        );
    }

    await sleep(durationMs);

    await sendDiscordMessage(
        userId,
        message,
        environment,
        scheduledForMs,
        messageLink,
        messagePreview
    );

    return {
        content: message,
        ephemeral: ephemeral,
    };
}

async function sendDiscordMessage(
    userId: string,
    message: string,
    environment: "development" | "production",
    scheduledFor: number,
    messageLink?: string,
    messagePreview?: string
) {
    "use step";

    const { REST, Routes } = await import("discord.js");
    const { env } = await import("@/env");
    const { redis } = await import("@/lib/redis");

    const token =
        environment === "development"
            ? env.DISCORD_TOKEN_DEV
            : env.DISCORD_TOKEN;

    const rest = new REST({ version: "10" }).setToken(token);

    try {
        let content: string;

        if (messageLink && messagePreview) {
            // This is a message context menu reminder
            content = `⏰ **Reminder about this message:**\n\n> ${messagePreview}\n\n[Jump to message](${messageLink})`;
        } else {
            // This is a regular text reminder
            content = `⏰ **Reminder:** ${message}`;
        }

        const dmChannel = (await rest.post(Routes.userChannels(), {
            body: { recipient_id: userId },
        })) as { id: string };

        await rest.post(Routes.channelMessages(dmChannel.id), {
            body: { content },
        });

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
                reminderData.scheduledForMs === String(scheduledFor)
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

