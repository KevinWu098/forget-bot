import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ComponentType,
    InteractionResponseType,
    InteractionType,
    MessageFlags,
    type APIApplicationCommandInteractionDataOption,
    type APIChatInputApplicationCommandInteraction,
    type APIInteraction,
    type APIMessageApplicationCommandInteraction,
    type APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";

import { handleCommand } from "@/lib/command-handler";
import { tryCatch } from "@/lib/try-catch";
import type {
    ApiCommandInteraction,
    ApiMessageContextInteraction,
} from "@/lib/types";

export async function POST(request: NextRequest) {
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();

    if (!signature || !timestamp) {
        return NextResponse.json({ error: "Invalid request" }, { status: 401 });
    }

    const isValidRequest = await verifyKey(
        body,
        signature,
        timestamp,
        env.DISCORD_PUBLIC_KEY
    );

    if (!isValidRequest) {
        return NextResponse.json(
            { error: "Invalid signature" },
            { status: 401 }
        );
    }

    const { data: interaction, error } = await tryCatch(
        Promise.try(() => JSON.parse(body) as APIInteraction)
    );

    if (error) {
        console.error("❌ Error parsing interaction payload:", error);
        return NextResponse.json(
            { error: "Invalid interaction payload" },
            { status: 400 }
        );
    }

    switch (interaction.type) {
        case InteractionType.Ping:
            return NextResponse.json({
                type: InteractionResponseType.Pong,
            });
        case InteractionType.ApplicationCommand: {
            if (isChatInputCommand(interaction)) {
                const commandInteraction = toCommandInteraction(interaction);

                const { data, error } = await tryCatch(
                    handleCommand(commandInteraction, {
                        environment: env.NODE_ENV,
                    })
                );

                if (error) {
                    console.error("❌ Error executing command:", error);
                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content:
                                "There was an error executing this command!",
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                if (data.modal) {
                    return NextResponse.json({
                        type: InteractionResponseType.Modal,
                        data: data.modal.toJSON(),
                    });
                }

                const responseData: {
                    content: string;
                    flags?: number;
                    components?: unknown[];
                    embeds?: unknown[];
                } = {
                    content: data.content,
                    flags: data.ephemeral ? MessageFlags.Ephemeral : undefined,
                };

                // Add containers or components
                if (data.containers && data.containers.length > 0) {
                    responseData.components = data.containers.map((c) =>
                        c.toJSON()
                    );
                    responseData.flags = (responseData.flags ?? 0) | (1 << 7); // MessageFlags.IsComponentsV2
                } else if (data.components) {
                    responseData.components = data.components.map((c) =>
                        c.toJSON()
                    );
                }

                if (data.embeds) {
                    responseData.embeds = data.embeds.map((e) => e.toJSON());
                }

                return NextResponse.json({
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: responseData,
                });
            } else if (isMessageContextMenuCommand(interaction)) {
                const messageInteraction =
                    toMessageContextInteraction(interaction);

                const { data, error } = await tryCatch(
                    handleCommand(messageInteraction, {
                        environment: env.NODE_ENV,
                    })
                );

                if (error) {
                    console.error(
                        "❌ Error executing message context command:",
                        error
                    );
                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content:
                                "There was an error executing this command!",
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                const responseData: {
                    content: string;
                    flags?: number;
                    components?: unknown[];
                    embeds?: unknown[];
                } = {
                    content: data.content,
                    flags: data.ephemeral ? MessageFlags.Ephemeral : undefined,
                };

                // Add containers or components
                if (data.containers && data.containers.length > 0) {
                    responseData.components = data.containers.map((c) =>
                        c.toJSON()
                    );
                    responseData.flags = (responseData.flags ?? 0) | (1 << 7); // MessageFlags.IsComponentsV2
                } else if (data.components) {
                    responseData.components = data.components.map((c) =>
                        c.toJSON()
                    );
                }

                if (data.embeds) {
                    responseData.embeds = data.embeds.map((e) => e.toJSON());
                }

                return NextResponse.json({
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: responseData,
                });
            }

            return NextResponse.json(
                { error: "Unsupported application command type" },
                { status: 400 }
            );
        }
        case InteractionType.MessageComponent: {
            if (
                interaction.type !== InteractionType.MessageComponent ||
                !("data" in interaction) ||
                !("component_type" in interaction.data)
            ) {
                break;
            }

            const componentInteraction = interaction;

            // Handle button clicks for reminder preset times
            if (
                componentInteraction.data.component_type ===
                ComponentType.Button
            ) {
                const customId = componentInteraction.data.custom_id;

                // Handle cancel reminder button
                if (customId.startsWith("cancel_reminder:")) {
                    const parts = customId.split(":");
                    const runId = parts[1];
                    const expectedUserId = parts[2];

                    const userId =
                        componentInteraction.user?.id ??
                        componentInteraction.member?.user?.id ??
                        "";

                    // Verify the user clicking is the one who created the reminder
                    if (userId !== expectedUserId) {
                        return NextResponse.json({
                            type: InteractionResponseType.ChannelMessageWithSource,
                            data: {
                                content:
                                    "❌ You can only cancel your own reminders.",
                                flags: MessageFlags.Ephemeral,
                            },
                        });
                    }

                    if (!runId) {
                        return NextResponse.json({
                            type: InteractionResponseType.ChannelMessageWithSource,
                            data: {
                                content: "❌ Invalid reminder ID.",
                                flags: MessageFlags.Ephemeral,
                            },
                        });
                    }

                    const { getRun } = await import("workflow/api");
                    const { redis } = await import("@/lib/redis");

                    const run = getRun(runId);
                    const { error } = await tryCatch(run.cancel());

                    if (error) {
                        console.error("❌ Error cancelling reminder:", error);
                        return NextResponse.json({
                            type: InteractionResponseType.ChannelMessageWithSource,
                            data: {
                                content:
                                    "❌ Failed to cancel reminder. It may have already been sent or cancelled.",
                                flags: MessageFlags.Ephemeral,
                            },
                        });
                    }

                    // Clean up Redis entries
                    await redis.srem(`user:${userId}:reminders`, runId);
                    await redis.del(`reminder:${runId}`);

                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: "✅ Reminder cancelled successfully.",
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                if (customId.startsWith("remind_")) {
                    const parts = customId.split(":");
                    const presetPart = parts[0];
                    const messageId = parts[1];
                    const channelId = parts[2];

                    if (presetPart && messageId && channelId) {
                        const preset = presetPart.replace("remind_", "");

                        // Handle custom time with modal
                        if (preset === "custom") {
                            const {
                                ModalBuilder,
                                TextInputBuilder,
                                TextInputStyle,
                                LabelBuilder,
                            } = await import("discord.js");

                            const modal = new ModalBuilder()
                                .setCustomId(
                                    `remind_custom_modal:${messageId}:${channelId}`
                                )
                                .setTitle("Custom Reminder Time");

                            const timeInput = new TextInputBuilder()
                                .setCustomId("time")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder(
                                    "e.g., 5 minutes, 2 hours, tomorrow at 3pm"
                                )
                                .setRequired(true)
                                .setMaxLength(100);

                            const timeLabel = new LabelBuilder()
                                .setLabel("When?")
                                .setTextInputComponent(timeInput);

                            modal.addLabelComponents(timeLabel);

                            return NextResponse.json({
                                type: InteractionResponseType.Modal,
                                data: modal.toJSON(),
                            });
                        }

                        const {
                            parsePresetTime,
                            handleReminderCreation,
                            createMessageLink,
                            createMessagePreview,
                        } =
                            await import("@/commands/create-reminder/context-menu");

                        const userId =
                            componentInteraction.user?.id ??
                            componentInteraction.member?.user?.id ??
                            "";

                        const durationMs = parsePresetTime(preset);

                        if (!durationMs) {
                            return NextResponse.json({
                                type: InteractionResponseType.ChannelMessageWithSource,
                                data: {
                                    content: `❌ Invalid time preset: ${preset}`,
                                    flags: MessageFlags.Ephemeral,
                                },
                            });
                        }

                        // Get cached message content and guild ID
                        const { redis } = await import("@/lib/redis");
                        const cacheKey = `msg_cache:${messageId}`;
                        const messageContent =
                            await redis.get<string>(cacheKey);

                        if (messageContent === null) {
                            return NextResponse.json({
                                type: InteractionResponseType.ChannelMessageWithSource,
                                data: {
                                    content:
                                        "❌ This reminder request has timed out. Please right-click the message again to create a new reminder.",
                                    flags: MessageFlags.Ephemeral,
                                },
                            });
                        }

                        const cachedGuildId = await redis.get<string>(
                            `msg_guild:${messageId}`
                        );
                        const guildId =
                            componentInteraction.guild_id ??
                            cachedGuildId ??
                            undefined;

                        const messageLink = createMessageLink(
                            messageId,
                            channelId,
                            guildId
                        );

                        const messagePreview =
                            createMessagePreview(messageContent);

                        const { data, error } = await tryCatch(
                            handleReminderCreation({
                                durationMs,
                                userId,
                                messageContent,
                                messageLink,
                                messagePreview,
                                sentAt: Date.now(),
                                environment:
                                    env.NODE_ENV === "production"
                                        ? "production"
                                        : "development",
                            })
                        );

                        if (error) {
                            console.error(
                                "❌ Error handling button interaction:",
                                error
                            );
                            return NextResponse.json({
                                type: InteractionResponseType.ChannelMessageWithSource,
                                data: {
                                    content: `❌ ${error instanceof Error ? error.message : "Failed to set reminder."}`,
                                    flags: MessageFlags.Ephemeral,
                                },
                            });
                        }

                        return NextResponse.json({
                            type: InteractionResponseType.ChannelMessageWithSource,
                            data: {
                                content: data.content,
                                flags: MessageFlags.Ephemeral,
                            },
                        });
                    }
                }
            }

            return NextResponse.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "Unknown component interaction",
                    flags: MessageFlags.Ephemeral,
                },
            });
        }
        case InteractionType.ModalSubmit:
            if (interaction.data.custom_id === "remind_modal") {
                const fields = collectModalFields(interaction);
                const time = fields.time;
                const message = fields.message;
                const ephemeral = fields.ephemeral === "true";

                const { handleModalReminder } =
                    await import("@/commands/create-reminder/modal");

                const userId =
                    interaction.user?.id ?? interaction.member?.user?.id ?? "";

                const { data, error } = await tryCatch(
                    handleModalReminder({
                        time: time ?? "",
                        message: message ?? "",
                        ephemeral,
                        userId,
                        sentAt: Date.now(),
                        environment:
                            env.NODE_ENV === "production"
                                ? "production"
                                : "development",
                    })
                );

                if (error) {
                    console.error("❌ Error handling modal submission:", error);
                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: `❌ ${error instanceof Error ? error.message : "Failed to set reminder. Please try again."}`,
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                return NextResponse.json({
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content: data.content,
                        flags: data.ephemeral
                            ? MessageFlags.Ephemeral
                            : undefined,
                    },
                });
            } else if (
                interaction.data.custom_id.startsWith("remind_custom_modal:")
            ) {
                // Handle custom time modal for message context menu
                const parts = interaction.data.custom_id.split(":");
                const messageId = parts[1];
                const channelId = parts[2];

                if (!messageId || !channelId) {
                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: "❌ Invalid modal submission",
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                const fields = collectModalFields(interaction);
                const time = fields.time;

                if (!time) {
                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: "❌ Please provide a time",
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                const { parseSimpleDuration } =
                    await import("@/lib/time-utils");
                const durationMs = parseSimpleDuration(time) ?? 0;

                if (durationMs === 0) {
                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: `❌ Could not parse time "${time}". Please use formats like "5 minutes", "2 hours", "tomorrow at 3pm", or "next Friday at noon".`,
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                // Get cached message content and guild ID
                const { redis } = await import("@/lib/redis");
                const cacheKey = `msg_cache:${messageId}`;
                const messageContent = await redis.get<string>(cacheKey);

                if (messageContent === null) {
                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content:
                                "❌ This reminder request has timed out. Please right-click the message again to create a new reminder.",
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                const cachedGuildId = await redis.get<string>(
                    `msg_guild:${messageId}`
                );
                const guildId =
                    interaction.guild_id ?? cachedGuildId ?? undefined;

                const {
                    handleReminderCreation,
                    createMessageLink,
                    createMessagePreview,
                } = await import("@/commands/create-reminder/context-menu");

                const messageLink = createMessageLink(
                    messageId,
                    channelId,
                    guildId
                );

                const messagePreview = createMessagePreview(messageContent);

                const userId =
                    interaction.user?.id ?? interaction.member?.user?.id ?? "";

                const { data, error } = await tryCatch(
                    handleReminderCreation({
                        durationMs,
                        userId,
                        messageContent,
                        messageLink,
                        messagePreview,
                        sentAt: Date.now(),
                        environment:
                            env.NODE_ENV === "production"
                                ? "production"
                                : "development",
                    })
                );

                if (error) {
                    console.error(
                        "❌ Error handling custom time modal:",
                        error
                    );
                    return NextResponse.json({
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: `❌ ${error instanceof Error ? error.message : "Failed to set reminder."}`,
                            flags: MessageFlags.Ephemeral,
                        },
                    });
                }

                return NextResponse.json({
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content: data.content,
                        flags: MessageFlags.Ephemeral,
                    },
                });
            }

            return NextResponse.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "Unknown modal submission",
                    flags: MessageFlags.Ephemeral,
                },
            });
        default:
            return NextResponse.json(
                { error: "Unsupported interaction type" },
                { status: 400 }
            );
    }
}

function toCommandInteraction(
    interaction: APIChatInputApplicationCommandInteraction
): ApiCommandInteraction {
    const findOption = (name: string) =>
        findOptionValue(interaction.data.options, name);

    const getString = (name: string) => {
        const option = findOption(name);
        return option?.type === ApplicationCommandOptionType.String &&
            typeof option.value === "string"
            ? option.value
            : null;
    };

    const getBoolean = (name: string) => {
        const option = findOption(name);
        return option?.type === ApplicationCommandOptionType.Boolean &&
            typeof option.value === "boolean"
            ? option.value
            : null;
    };

    return {
        id: interaction.id,
        commandName: interaction.data.name,
        user: interaction.user ??
            interaction.member?.user ?? {
                id: "",
                username: "unknown",
            },
        channelId: interaction.channel_id ?? null,
        createdTimestamp: Date.now(),
        isChatInputCommand: () => true,
        options: {
            getString,
            getBoolean,
        },
    };
}

function isChatInputCommand(
    interaction: APIInteraction
): interaction is APIChatInputApplicationCommandInteraction {
    return (
        interaction.type === InteractionType.ApplicationCommand &&
        interaction.data?.type === ApplicationCommandType.ChatInput
    );
}

function isMessageContextMenuCommand(
    interaction: APIInteraction
): interaction is APIMessageApplicationCommandInteraction {
    return (
        interaction.type === InteractionType.ApplicationCommand &&
        interaction.data?.type === ApplicationCommandType.Message
    );
}

function toMessageContextInteraction(
    interaction: APIMessageApplicationCommandInteraction
): ApiMessageContextInteraction {
    const targetMessage =
        interaction.data.resolved?.messages?.[interaction.data.target_id];

    const guildId = interaction.guild_id;
    const channelId = interaction.channel?.id ?? interaction.channel_id ?? "";
    const messageId = interaction.data.target_id;

    const messageLink = guildId
        ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}`
        : `https://discord.com/channels/@me/${channelId}/${messageId}`;

    return {
        id: interaction.id,
        commandName: interaction.data.name,
        user: interaction.user ??
            interaction.member?.user ?? {
                id: "",
                username: "unknown",
            },
        targetMessage: {
            id: messageId,
            content: targetMessage?.content ?? "",
            channelId,
            guildId: guildId ?? undefined,
            url: messageLink,
        },
        createdTimestamp: Date.now(),
        isMessageContextMenuCommand: () => true,
    };
}

function findOptionValue(
    options: APIApplicationCommandInteractionDataOption[] | undefined,
    name: string
): OptionWithValue | null {
    if (!options?.length) {
        return null;
    }

    for (const option of options) {
        if ("options" in option && option.options) {
            const nested = findOptionValue(option.options, name);
            if (nested) {
                return nested;
            }
        }

        if (option.name === name && "value" in option) {
            return option as OptionWithValue;
        }
    }

    return null;
}

type OptionWithValue = APIApplicationCommandInteractionDataOption & {
    value?: unknown;
};

function collectModalFields(interaction: APIModalSubmitInteraction) {
    const fields: Record<string, string> = {};

    const visit = (node: unknown) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        const obj = node as Record<string, unknown>;
        const customId = obj.custom_id;

        if (typeof customId === "string") {
            if (typeof obj.value === "string") {
                fields[customId] = obj.value;
            } else if (Array.isArray(obj.values) && obj.values.length > 0) {
                fields[customId] = String(obj.values[0]);
            }
        }

        if ("components" in obj) {
            visit(obj.components);
        }
        if ("component" in obj) {
            visit(obj.component);
        }
    };

    visit(interaction.data?.components);

    return fields;
}
