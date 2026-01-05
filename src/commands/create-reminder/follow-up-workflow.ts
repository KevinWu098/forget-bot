import type { NodeEnv } from "@/env";
import { sleep } from "workflow";

// Escalating intervals: 1h, 2h, 4h, 8h, 12h
const FOLLOW_UP_INTERVALS_MS = [
    1 * 60 * 60 * 1000, // 1 hour
    2 * 60 * 60 * 1000, // 2 hours
    4 * 60 * 60 * 1000, // 4 hours
    8 * 60 * 60 * 1000, // 8 hours
    12 * 60 * 60 * 1000, // 12 hours
];

export async function followUpWorkflow(
    originalMessageId: string,
    channelId: string,
    userId: string,
    message: string,
    environment: NodeEnv,
    messageLink?: string,
    messagePreview?: string
) {
    "use workflow";

    // Track the most recent message ID to check for reactions
    let currentMessageId = originalMessageId;

    for (let i = 0; i < FOLLOW_UP_INTERVALS_MS.length; i++) {
        const intervalMs = FOLLOW_UP_INTERVALS_MS[i] ?? 0;
        const remainingFollowUps = FOLLOW_UP_INTERVALS_MS.length - i - 1;
        const nextIntervalMs = FOLLOW_UP_INTERVALS_MS[i + 1];

        await sleep(intervalMs);

        // Check if user has reacted with checkmark on the most recent message
        const hasAcknowledged = await checkUserReaction(
            currentMessageId,
            channelId,
            userId,
            environment
        );

        if (hasAcknowledged) {
            console.info(
                `✅ [${environment.toUpperCase()}] User ${userId} acknowledged reminder, stopping follow-ups`
            );
            return { acknowledged: true, followUpsSent: i };
        }

        // Send follow-up reminder and update the message ID to check
        currentMessageId = await sendFollowUpMessage(
            channelId,
            userId,
            message,
            environment,
            remainingFollowUps,
            nextIntervalMs,
            messageLink,
            messagePreview
        );
    }

    return {
        acknowledged: false,
        followUpsSent: FOLLOW_UP_INTERVALS_MS.length,
    };
}

async function checkUserReaction(
    messageId: string,
    channelId: string,
    userId: string,
    environment: NodeEnv
): Promise<boolean> {
    "use step";

    const { REST, Routes } = await import("discord.js");
    const { env } = await import("@/env");

    const token =
        environment === "development"
            ? env.DISCORD_TOKEN_DEV
            : env.DISCORD_TOKEN;

    const rest = new REST({ version: "10" }).setToken(token);

    try {
        // Get users who reacted with the checkmark emoji
        const reactions = (await rest.get(
            Routes.channelMessageReaction(channelId, messageId, "✅")
        )) as Array<{ id: string }>;

        // Check if the target user is in the list of people who reacted
        return reactions.some((user) => user.id === userId);
    } catch (error) {
        console.error(
            `❌ Failed to check reactions for message ${messageId}:`,
            error
        );
        // If we can't check reactions, assume not acknowledged to be safe
        return false;
    }
}

function formatInterval(ms: number): string {
    const hours = ms / (60 * 60 * 1000);
    if (hours === 1) {
        return "1 hour";
    }
    return `${hours} hours`;
}

async function sendFollowUpMessage(
    channelId: string,
    userId: string,
    message: string,
    environment: NodeEnv,
    remainingFollowUps: number,
    nextIntervalMs: number | undefined,
    messageLink?: string,
    messagePreview?: string
): Promise<string> {
    "use step";

    const { REST, Routes } = await import("discord.js");
    const { env } = await import("@/env");

    const token =
        environment === "development"
            ? env.DISCORD_TOKEN_DEV
            : env.DISCORD_TOKEN;

    const rest = new REST({ version: "10" }).setToken(token);

    try {
        let content: string;

        if (messageLink && messagePreview) {
            // This is a message context menu reminder
            content = `🔔 **Follow-up reminder about this message:**\n\n> ${messagePreview}\n\n[Jump to message](${messageLink})`;
        } else {
            // This is a regular text reminder
            content = `🔔 **Follow-up reminder:** ${message}`;
        }

        // Add info about next reminder or final notice
        if (remainingFollowUps > 0 && nextIntervalMs) {
            content += `\n\n_React with ✅ to acknowledge. Next reminder in ${formatInterval(nextIntervalMs)} (${remainingFollowUps} remaining)._`;
        } else {
            content += `\n\n_React with ✅ to acknowledge. This is the final reminder._`;
        }

        const sentMessage = (await rest.post(
            Routes.channelMessages(channelId),
            {
                body: { content },
            }
        )) as { id: string };

        // React with checkmark emoji to the follow-up message
        await rest.put(
            Routes.channelMessageOwnReaction(channelId, sentMessage.id, "✅")
        );

        console.info(
            `🔔 [${environment.toUpperCase()}] Follow-up reminder sent to user ${userId} (${remainingFollowUps} remaining)`
        );

        return sentMessage.id;
    } catch (error) {
        console.error(
            `❌ Failed to send follow-up reminder to user ${userId}:`,
            error
        );
        throw error;
    }
}
