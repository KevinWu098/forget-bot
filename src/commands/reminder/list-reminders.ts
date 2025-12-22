import { formatDistanceToNow } from "date-fns";
import {
    ApplicationIntegrationType,
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
        message: string;
        scheduledFor: number;
        timeRemaining: string;
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
                    message:
                        String(reminderData["message"]) ?? "Message not found",
                    scheduledFor,
                    timeRemaining,
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

    const reminderList = activeReminders
        .map((reminder, index) => {
            return `${index + 1}. **"${reminder.message}"** - in ${reminder.timeRemaining}`;
        })
        .join("\n");

    return {
        content: `📋 **Your Active Reminders:**\n\n${reminderList}`,
        ephemeral: true,
    };
}
