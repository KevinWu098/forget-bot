import type { NodeEnv } from "@/env";
import {
    ApplicationIntegrationType,
    InteractionContextType,
    LabelBuilder,
    ModalBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
    type CommandInteraction,
} from "discord.js";
import { start } from "workflow/api";

import type { CommandResponse } from "@/lib/command-handler";
import { redis } from "@/lib/redis";
import { formatRelativeLA, parseSimpleDuration } from "@/lib/time-utils";
import type { ForgetBotContext } from "@/lib/types";

import { remindWorkflow } from "./remind.workflow";

export const data = new SlashCommandBuilder()
    .setName("remind-modal")
    .setDescription("Set a reminder using a modal form")
    .setIntegrationTypes(
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall
    )
    .setContexts(
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel
    );

export async function execute(
    interaction: CommandInteraction,
    _context: ForgetBotContext
): Promise<CommandResponse> {
    if (!interaction.isChatInputCommand()) {
        return {
            content: "This command only supports slash commands.",
        };
    }

    const modal = new ModalBuilder()
        .setCustomId("remind_modal")
        .setTitle("Set a Reminder");

    const timeInput = new TextInputBuilder()
        .setCustomId("time")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g., 5 minutes, 2 hours, tomorrow at 3pm")
        .setRequired(true)
        .setMaxLength(100);

    const messageInput = new TextInputBuilder()
        .setCustomId("message")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Enter your reminder message...")
        .setRequired(true)
        .setMaxLength(500);

    const ephemeralSelect = new StringSelectMenuBuilder()
        .setCustomId("ephemeral")
        .setPlaceholder("Ephemeral Confirmation?")
        .setRequired(false)
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("True (private)")
                .setValue("true")
                .setDefault(true),
            new StringSelectMenuOptionBuilder()
                .setLabel("False (public reply)")
                .setValue("false")
        );

    const timeLabel = new LabelBuilder()
        .setLabel("When?")
        .setTextInputComponent(timeInput);
    const messageLabel = new LabelBuilder()
        .setLabel("What to remind you about?")
        .setTextInputComponent(messageInput);
    const ephemeralLabel = new LabelBuilder()
        .setLabel("Ephemeral?")
        .setStringSelectMenuComponent(ephemeralSelect);

    modal.addLabelComponents(timeLabel, messageLabel);
    modal.addLabelComponents(ephemeralLabel);

    return {
        content: "",
        modal: modal,
    };
}

export async function handleModalReminder(params: {
    time: string;
    message: string;
    ephemeral: boolean;
    userId: string;
    sentAt: number;
    environment: NodeEnv;
}): Promise<CommandResponse> {
    const { time, message, ephemeral, userId, sentAt, environment } = params;

    if (!time || !message) {
        return {
            content: "Please provide both time and message.",
            ephemeral: true,
        };
    }

    try {
        const durationMs = parseSimpleDuration(time) ?? 0;

        if (durationMs === 0) {
            return {
                content: `❌ Could not parse time "${time}". Please use formats like "5 minutes", "2 hours", "tomorrow at 3pm", or "next Friday at noon".`,
                ephemeral: true,
            };
        }

        const scheduledForMs = sentAt + durationMs;

        const run = await start(remindWorkflow, [
            durationMs,
            scheduledForMs,
            message,
            ephemeral,
            userId,
            environment,
        ]);

        const runId = run.runId;
        await redis.sadd(`user:${userId}:reminders`, runId);

        await redis.hset(`reminder:${runId}`, {
            message,
            userId,
            scheduledFor: scheduledForMs,
            createdAt: sentAt,
        });

        // Set expiration for metadata (365 days)
        await redis.expire(`reminder:${runId}`, 365 * 24 * 60 * 60);

        const relativeTime = formatRelativeLA(scheduledForMs, sentAt);

        return {
            content: `✅ Reminder set! I'll remind you about "${message}" ${relativeTime}`,
            ephemeral,
        };
    } catch (error) {
        console.error("Error setting reminder:", error);
        return {
            content: `❌ ${error instanceof Error ? error.message : "Failed to set reminder. Please try again."}`,
            ephemeral: true,
        };
    }
}
