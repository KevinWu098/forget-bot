import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType,
    SlashCommandBuilder,
} from "discord.js";
import { start } from "workflow/api";

import type { CommandResponse } from "@/lib/command-handler";
import { redis } from "@/lib/redis";
import { formatRelativeLA, parseSimpleDuration } from "@/lib/time-utils";
import type { ApiCommandInteraction, ForgetBotContext } from "@/lib/types";

import { remindWorkflow } from "./workflow";

export const data = new SlashCommandBuilder()
    .setName("remind-me")
    .setDescription("Set a reminder")
    .setIntegrationTypes(
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall
    )
    .setContexts(
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel
    )
    .addStringOption((option) =>
        option
            .setName("time")
            .setDescription("When to remind you")
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName("message")
            .setDescription("What to remind you about")
            .setRequired(true)
    )
    .addBooleanOption((option) =>
        option
            .setName("ephemeral")
            .setDescription(
                "Whether to send the reminder as an ephemeral message (only visible to you). Defaults to true."
            )
            .setRequired(false)
    );

export async function execute(
    interaction: ApiCommandInteraction,
    context: ForgetBotContext
): Promise<CommandResponse> {
    if (!interaction.isChatInputCommand()) {
        return {
            content: "This command only supports slash commands.",
        };
    }

    const sentAt = interaction.createdTimestamp;
    const time = interaction.options.getString("time");
    const message = interaction.options.getString("message");
    const ephemeral = interaction.options.getBoolean("ephemeral") ?? true;
    const userId = interaction.user.id;

    if (!time || !message) {
        return {
            content: "Please provide a time AND message.",
        };
    }

    try {
        const durationMs = parseSimpleDuration(time) ?? 0;
        const scheduledForMs = sentAt + durationMs;

        const run = await start(remindWorkflow, [
            durationMs,
            scheduledForMs,
            message,
            ephemeral,
            userId,
            context?.environment,
        ]);

        const runId = run.runId;
        await redis.sadd(`user:${userId}:reminders`, runId);

        await redis.hset(`reminder:${runId}`, {
            message,
            userId,
            scheduledForMs,
            createdAt: sentAt,
        });

        // Set expiration for metadata (365 days)
        await redis.expire(`reminder:${runId}`, 365 * 24 * 60 * 60);

        const relativeTime = formatRelativeLA(scheduledForMs, sentAt);

        const cancelButton = new ButtonBuilder()
            .setCustomId(`cancel_reminder:${runId}:${userId}`)
            .setLabel("Cancel Reminder")
            .setStyle(ButtonStyle.Danger);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            cancelButton
        );

        return {
            content: `✅ Reminder set! I'll remind you about "${message}" ${relativeTime}`,
            ephemeral,
            components: [actionRow],
        };
    } catch (error) {
        console.error("Error setting reminder:", error);
        return {
            content: `❌ ${error instanceof Error ? error.message : "Failed to set reminder. Please try again."}`,
            ephemeral: true,
        };
    }
}
