import { formatDistanceToNow } from "date-fns";
import {
    ApplicationIntegrationType,
    EmbedBuilder,
    InteractionContextType,
    SlashCommandBuilder,
} from "discord.js";
import { getRun } from "workflow/api";

import type { CommandResponse } from "@/lib/command-handler";
import { redis } from "@/lib/redis";
import { tryCatch } from "@/lib/try-catch";
import type { ApiCommandInteraction, ForgetBotContext } from "@/lib/types";

export const data = new SlashCommandBuilder()
    .setName("list-reminders")
    .setDescription("List all your active reminders")
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
    .setContexts(
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel
    );

export async function execute(
    interaction: ApiCommandInteraction,
    _: ForgetBotContext
): Promise<CommandResponse> {
    if (!interaction.isChatInputCommand()) {
        return {
            content: "This command only supports slash commands.",
        };
    }

    const userId = interaction.user.id;

    const { data: reminderIds, error } = await tryCatch(
        redis.smembers(`user:${userId}:reminders`)
    );

    if (error) {
        const errorMessage = "❌ Error listing reminders";

        console.error(`❌ Error listing reminders:`, error);
        return {
            content: errorMessage,
            ephemeral: true,
        };
    }

    if (!reminderIds.length) {
        return {
            content: "You have no active reminders.",
            ephemeral: true,
        };
    }

    const activeReminders: Array<{
        runId: string;
        message: string;
        scheduledFor: number;
        timeRemaining: string;
        messageLink?: string;
        messagePreview?: string;
    }> = [];

    await Promise.all(
        reminderIds.map(async (runId) => {
            const { data: run, error } = await tryCatch(
                Promise.resolve(getRun(runId))
            );

            if (error) {
                console.error(`❌ Error getting run ${runId}:`, error);
                return runId;
            }

            const status = await run.status;
            if (status !== "running" && status !== "pending") {
                await redis.srem(`user:${userId}:reminders`, runId);
                await redis.del(`reminder:${runId}`);
            }

            const reminderData = await redis.hgetall(`reminder:${runId}`);

            if (reminderData && reminderData.message) {
                const scheduledFor = Number(reminderData.scheduledForMs);
                const timeRemaining = formatDistanceToNow(scheduledFor, {
                    addSuffix: false,
                });

                activeReminders.push({
                    runId,
                    message:
                        String(reminderData["message"]) ?? "Message not found",
                    scheduledFor,
                    timeRemaining,
                    messageLink: reminderData.messageLink
                        ? String(reminderData.messageLink)
                        : undefined,
                    messagePreview: reminderData.messagePreview
                        ? String(reminderData.messagePreview)
                        : undefined,
                });
            }
        })
    );

    if (activeReminders.length === 0) {
        return {
            content: "You have no active reminders.",
            ephemeral: true,
        };
    }

    activeReminders.sort((a, b) => a.scheduledFor - b.scheduledFor);

    // Create separate embeds for each reminder (max 10)
    const embeds: EmbedBuilder[] = [];

    // Add header content
    const headerContent =
        activeReminders.length > 10
            ? `📋 **Your Active Reminders** (showing 10 of ${activeReminders.length})`
            : `📋 **Your Active Reminders** (${activeReminders.length} total)`;

    for (let i = 0; i < Math.min(activeReminders.length, 10); i++) {
        const reminder = activeReminders[i];
        if (!reminder) {
            continue;
        }

        // Format the message display
        const messageDisplay =
            reminder.messagePreview ??
            (reminder.message.length > 200
                ? reminder.message.substring(0, 200) + "..."
                : reminder.message);

        const embed = new EmbedBuilder()
            .setColor(0x5865f2) // Discord blurple
            .setDescription(messageDisplay)
            .addFields(
                {
                    name: "⏳ Time Remaining",
                    value: `In **${reminder.timeRemaining}**`,
                    inline: true,
                },
                {
                    name: "📅 Scheduled For",
                    value: `<t:${Math.floor(reminder.scheduledFor / 1000)}:F>`,
                    inline: true,
                }
            );

        // Make the embed clickable if there's a message link
        if (reminder.messageLink) {
            embed.setURL(reminder.messageLink);
            embed.setTitle("Jump to Message 🔗");
        }

        embeds.push(embed);
    }

    return {
        content: headerContent,
        ephemeral: true,
        embeds,
    };
}
