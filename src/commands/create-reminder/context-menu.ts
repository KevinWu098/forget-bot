import type { NodeEnv } from "@/env";
import { ApplicationCommandType } from "discord-api-types/v10";
import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonBuilder,
    ButtonStyle,
    ContextMenuCommandBuilder,
    InteractionContextType,
} from "discord.js";
import { start } from "workflow/api";

import type { CommandResponse } from "@/lib/command-handler";
import { redis } from "@/lib/redis";
import { formatRelativeLA, parseSimpleDuration } from "@/lib/time-utils";
import type { ApiMessageContextInteraction } from "@/lib/types";

import { remindWorkflow } from "./workflow";

export const data = new ContextMenuCommandBuilder()
    .setName("Remind Me")
    .setType(ApplicationCommandType.Message)
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
    interaction: ApiMessageContextInteraction,
    _context: { environment: NodeEnv }
): Promise<CommandResponse> {
    if (!interaction.isMessageContextMenuCommand()) {
        return {
            content: "This command only supports message context menus.",
            ephemeral: true,
        };
    }

    const messageId = interaction.targetMessage.id;
    const channelId = interaction.targetMessage.channelId;
    const messageContent = interaction.targetMessage.content;
    const guildId = interaction.targetMessage.guildId;

    // Cache the message content temporarily so it's available when button is clicked
    // TTL of 5 minutes should be enough for user to click a button
    const cacheKey = `msg_cache:${messageId}`;
    await redis.setex(cacheKey, 300, messageContent);

    // Store guild ID if available
    if (guildId) {
        await redis.setex(`msg_guild:${messageId}`, 300, guildId);
    }

    // Create preset time buttons
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`remind_30m:${messageId}:${channelId}`)
            .setLabel("30 minutes")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`remind_1h:${messageId}:${channelId}`)
            .setLabel("1 hour")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`remind_2h:${messageId}:${channelId}`)
            .setLabel("2 hours")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`remind_6h:${messageId}:${channelId}`)
            .setLabel("6 hours")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`remind_tomorrow:${messageId}:${channelId}`)
            .setLabel("Tomorrow")
            .setStyle(ButtonStyle.Primary),
    ];

    // Create action rows (max 5 buttons per row)
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttons
    );

    return {
        content: "⏰ When would you like to be reminded about this message?",
        ephemeral: true,
        components: [actionRow],
    };
}

export async function handleReminderCreation(params: {
    durationMs: number;
    userId: string;
    messageContent: string;
    messageLink: string;
    messagePreview: string;
    sentAt: number;
    environment: NodeEnv;
}): Promise<CommandResponse> {
    const {
        durationMs,
        userId,
        messageContent,
        messageLink,
        messagePreview,
        sentAt,
        environment,
    } = params;

    if (durationMs <= 0) {
        return {
            content:
                "❌ Could not parse time. Please use formats like '5 minutes', '2 hours', 'tomorrow at 3pm', etc.",
            ephemeral: true,
        };
    }

    try {
        const scheduledForMs = sentAt + durationMs;

        const run = await start(remindWorkflow, [
            durationMs,
            scheduledForMs,
            messageContent,
            true, // ephemeral - reminders are always private
            userId,
            environment,
            messageLink,
            messagePreview,
        ]);

        const runId = run.runId;
        await redis.sadd(`user:${userId}:reminders`, runId);

        await redis.hset(`reminder:${runId}`, {
            message: messageContent,
            userId,
            scheduledForMs,
            createdAt: sentAt,
            messageLink,
            messagePreview,
        });

        // Set expiration for metadata (365 days)
        await redis.expire(`reminder:${runId}`, 365 * 24 * 60 * 60);

        const relativeTime = formatRelativeLA(scheduledForMs, sentAt);

        return {
            content: `✅ Reminder set! I'll remind you about this message ${relativeTime}`,
            ephemeral: true,
        };
    } catch (error) {
        console.error("Error setting message reminder:", error);
        return {
            content: `❌ ${error instanceof Error ? error.message : "Failed to set reminder. Please try again."}`,
            ephemeral: true,
        };
    }
}

export function parsePresetTime(preset: string): number | null {
    const presets: Record<string, number> = {
        "30m": 30 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "2h": 2 * 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
    };

    if (preset in presets) {
        return presets[preset] ?? null;
    }

    // Special handling for "tomorrow" - default to 9 AM
    if (preset === "tomorrow") {
        return parseSimpleDuration("tomorrow 9am") ?? null;
    }

    return null;
}

export function createMessageLink(
    messageId: string,
    channelId: string,
    guildId?: string
): string {
    if (guildId) {
        return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
    }
    return `https://discord.com/channels/@me/${channelId}/${messageId}`;
}

export function createMessagePreview(content: string, maxLength = 100): string {
    if (!content || content.trim().length === 0) {
        return "[No text content]";
    }

    const trimmed = content.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }

    return trimmed.substring(0, maxLength) + "...";
}
