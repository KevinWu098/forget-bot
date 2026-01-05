import type { NodeEnv } from "@/env";
import { sleep } from "workflow";

import { followUpWorkflow } from "./follow-up-workflow";

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

    const { sentMessageId, channelId } = await sendDiscordMessage(
        userId,
        message,
        environment,
        scheduledForMs,
        messageLink,
        messagePreview
    );

    // Start follow-up workflow to handle escalating reminders
    await startFollowUpWorkflow(
        sentMessageId,
        channelId,
        userId,
        message,
        environment,
        messageLink,
        messagePreview
    );

    return {
        content: message,
        ephemeral: ephemeral,
    };
}

async function startFollowUpWorkflow(
    messageId: string,
    channelId: string,
    userId: string,
    message: string,
    environment: NodeEnv,
    messageLink?: string,
    messagePreview?: string
) {
    "use step";

    const { start } = await import("workflow/api");

    await start(followUpWorkflow, [
        messageId,
        channelId,
        userId,
        message,
        environment,
        messageLink,
        messagePreview,
    ]);
}

async function sendDiscordMessage(
    userId: string,
    message: string,
    environment: "development" | "production",
    scheduledFor: number,
    messageLink?: string,
    messagePreview?: string
): Promise<{ sentMessageId: string; channelId: string }> {
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

        const sentMessage = (await rest.post(
            Routes.channelMessages(dmChannel.id),
            {
                body: { content },
            }
        )) as { id: string };

        // React with checkmark emoji to the sent message
        await rest.put(
            Routes.channelMessageOwnReaction(dmChannel.id, sentMessage.id, "✅")
        );

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

        return { sentMessageId: sentMessage.id, channelId: dmChannel.id };
    } catch (error) {
        console.error(`❌ Failed to send reminder to user ${userId}:`, error);
        throw error;
    }
}
