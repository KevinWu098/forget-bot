import {
    ApplicationIntegrationType,
    InteractionContextType,
    SlashCommandBuilder,
    type CommandInteraction,
} from "discord.js";
import { start } from "workflow/api";

import type { CommandResponse } from "@/lib/command-handler";
import type { ForgetBotContext } from "@/lib/types";

import { remindWorkflow } from "./remind.workflow";

export const data = new SlashCommandBuilder()
    .setName("remind-me")
    .setDescription("Set a reminder")
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
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
    interaction: CommandInteraction,
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
    const channelId = interaction.channelId;

    if (!time || !message) {
        return {
            content: "Please provide a time AND message.",
        };
    }

    try {
        await start(remindWorkflow, [
            sentAt,
            time,
            message,
            ephemeral,
            userId,
            channelId,
            context?.environment,
        ]);

        return {
            content: `✅ Reminder set! I'll remind you: "${message}"`,
            ephemeral: ephemeral,
        };
    } catch (error) {
        console.error("Error setting reminder:", error);
        return {
            content: `❌ ${error instanceof Error ? error.message : "Failed to set reminder. Please try again."}`,
            ephemeral: true,
        };
    }
}
