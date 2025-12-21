import {
    ApplicationIntegrationType,
    InteractionContextType,
    SlashCommandBuilder,
    type CommandInteraction,
} from "discord.js";
import { getRun } from "workflow/api";

import type { CommandResponse } from "@/lib/command-handler";
import { redis } from "@/lib/redis";
import type { ForgetBotContext } from "@/lib/types";

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
    interaction: CommandInteraction,
    _: ForgetBotContext
): Promise<CommandResponse> {
    if (!interaction.isChatInputCommand()) {
        return {
            content: "This command only supports slash commands.",
        };
    }

    const userId = interaction.user.id;

    try {
        const reminderIds = await redis.smembers(`user:${userId}:reminders`);

        if (reminderIds.length === 0) {
            return {
                content: "You have no active reminders.",
                ephemeral: true,
            };
        }

        // Fetch details for each reminder
        const activeReminders: Array<{
            message: string;
            scheduledFor: number;
            timeRemaining: string;
        }> = [];

        for (const runId of reminderIds) {
            try {
                // Check if workflow is still running
                const run = getRun(runId);
                const status = await run.status;

                if (status === "running") {
                    // Get reminder metadata
                    const reminderData = await redis.hgetall(
                        `reminder:${runId}`
                    );

                    if (reminderData && reminderData.message) {
                        const scheduledFor = Number(reminderData.scheduledFor);
                        const timeRemaining = formatTimeRemaining(
                            scheduledFor - Date.now()
                        );

                        activeReminders.push({
                            message:
                                String(reminderData["message"]) ??
                                "Message not found",
                            scheduledFor,
                            timeRemaining,
                        });
                    }
                } else {
                    await redis.srem(`user:${userId}:reminders`, runId);
                    await redis.del(`reminder:${runId}`);
                }
            } catch (error) {
                console.error(`Error fetching reminder ${runId}:`, error);
                await redis.srem(`user:${userId}:reminders`, runId);
                await redis.del(`reminder:${runId}`);
            }
        }

        if (activeReminders.length === 0) {
            return {
                content: "You have no active reminders.",
                ephemeral: true,
            };
        }

        // Sort by scheduled time
        activeReminders.sort((a, b) => a.scheduledFor - b.scheduledFor);

        // Format response
        const reminderList = activeReminders
            .map((reminder, index) => {
                return `${index + 1}. **"${reminder.message}"** - in ${reminder.timeRemaining}`;
            })
            .join("\n");

        return {
            content: `📋 **Your Active Reminders:**\n\n${reminderList}`,
            ephemeral: true,
        };
    } catch (error) {
        console.error("Error listing reminders:", error);
        return {
            content: `❌ Failed to list reminders. Please try again.`,
            ephemeral: true,
        };
    }
}

function formatTimeRemaining(ms: number): string {
    if (ms < 0) {
        return "overdue";
    }

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        const remainingHours = hours % 24;
        return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0
            ? `${hours}h ${remainingMinutes}m`
            : `${hours}h`;
    }
    if (minutes > 0) {
        const remainingSeconds = seconds % 60;
        return remainingSeconds > 0
            ? `${minutes}m ${remainingSeconds}s`
            : `${minutes}m`;
    }
    return `${seconds}s`;
}
