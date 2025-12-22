import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { verifyKey } from "discord-interactions";
import {
    ApplicationCommandType,
    InteractionResponseType,
    InteractionType,
    MessageFlags,
    type CommandInteraction,
} from "discord.js";
import z from "zod";

import { handleCommand } from "@/lib/command-handler";
import { tryCatch } from "@/lib/try-catch";

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

    const interactionSchema = z.object({
        type: z.enum(InteractionType),
        id: z.string(),
        channel_id: z.string().optional(),
        user: z
            .object({
                id: z.string(),
                username: z.string(),
            })
            .optional(),
        member: z
            .object({
                user: z.object({
                    id: z.string(),
                    username: z.string(),
                }),
            })
            .optional(),
        data: z
            .object({
                id: z.string().optional(),
                name: z.string().optional(),
                type: z.enum(ApplicationCommandType).optional(),
                custom_id: z.string().optional(),
                // Modal submit component payloads can vary by client/library version.
                // Keep this permissive and do robust extraction below.
                components: z.array(z.any()).optional(),
                options: z
                    .array(
                        z.object({
                            name: z.string(),
                            type: z.number(),
                            value: z.union([
                                z.string(),
                                z.number(),
                                z.boolean(),
                            ]),
                        })
                    )
                    .optional(),
            })
            .optional(),
    });

    const interaction = interactionSchema.parse(JSON.parse(body));

    switch (interaction.type) {
        case InteractionType.Ping:
            return NextResponse.json({
                type: InteractionResponseType.Pong,
            });
        case InteractionType.ApplicationCommand: {
            const commandInteraction = {
                ...interaction,
                ...interaction.data,
                commandName: interaction.data?.name,
                user: interaction.user ?? interaction.member?.user,
                channelId: interaction.channel_id,
                createdTimestamp: Date.now(),
                isChatInputCommand: () => true,
                options: {
                    getString: (name: string) => {
                        const option = interaction.data?.options?.find(
                            (opt) => opt.name === name
                        );
                        if (option && typeof option.value === "string") {
                            return option.value;
                        }
                        return null;
                    },
                    getBoolean: (name: string) => {
                        const option = interaction.data?.options?.find(
                            (opt) => opt.name === name
                        );
                        if (option && typeof option.value === "boolean") {
                            return option.value;
                        }
                        return null;
                    },
                },
            } as unknown as CommandInteraction;

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
                        content: "There was an error executing this command!",
                        flags: MessageFlags.Ephemeral,
                    },
                });
            }

            // Check if response contains a modal
            if (data.modal) {
                return NextResponse.json({
                    type: InteractionResponseType.Modal,
                    data: data.modal.toJSON(),
                });
            }

            return NextResponse.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: data.content,
                    flags: data.ephemeral ? MessageFlags.Ephemeral : undefined,
                },
            });
        }
        case InteractionType.ModalSubmit: {
            // Handle modal submission
            const customId = interaction.data?.custom_id;

            if (customId === "remind_modal") {
                // Extract values from modal components
                const components = interaction.data?.components ?? [];
                const fields: Record<string, string> = {};

                const collectFields = (node: unknown) => {
                    if (!node) {
                        return;
                    }
                    if (Array.isArray(node)) {
                        for (const item of node) {
                            collectFields(item);
                        }
                        return;
                    }
                    if (typeof node !== "object") {
                        return;
                    }

                    const obj = node as Record<string, unknown>;
                    const customId = obj.custom_id;

                    if (typeof customId === "string") {
                        const value = obj.value;
                        const values = obj.values;

                        if (typeof value === "string") {
                            fields[customId] = value;
                        } else if (Array.isArray(values)) {
                            fields[customId] =
                                (values[0] as string | undefined) ?? "";
                        }
                    }

                    // Recurse into common nesting keys used by Discord payloads
                    if (obj.components) {
                        collectFields(obj.components);
                    }
                    if (obj.component) {
                        collectFields(obj.component);
                    }
                };

                collectFields(components);

                const time = fields.time;
                const message = fields.message;
                const parseBool = (
                    value: string | undefined,
                    defaultValue: boolean
                ) => {
                    if (!value) {
                        return defaultValue;
                    }
                    const v = value.trim().toLowerCase();
                    if (["1", "true", "t", "yes", "y", "on"].includes(v)) {
                        return true;
                    }
                    if (["0", "false", "f", "no", "n", "off"].includes(v)) {
                        return false;
                    }
                    return defaultValue;
                };

                const publishToChannel = parseBool(fields.publish, false);
                const ephemeral = publishToChannel
                    ? false
                    : parseBool(fields.ephemeral, true);

                // Import and handle the reminder
                const { handleModalReminder } =
                    await import("@/commands/reminder/remind-modal");

                const userId =
                    interaction.user?.id ?? interaction.member?.user?.id ?? "";

                const { data, error } = await tryCatch(
                    handleModalReminder({
                        time: time ?? "",
                        message: message ?? "",
                        ephemeral,
                        publishToChannel,
                        userId,
                        channelId: interaction.channel_id,
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
            }

            return NextResponse.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "Unknown modal submission",
                    flags: MessageFlags.Ephemeral,
                },
            });
        }
        default:
            return NextResponse.json(
                { error: "Unknown interaction type" },
                { status: 400 }
            );
    }
}
