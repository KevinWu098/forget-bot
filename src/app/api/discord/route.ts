import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    InteractionResponseType,
    InteractionType,
    MessageFlags,
    type APIApplicationCommandInteractionDataOption,
    type APIChatInputApplicationCommandInteraction,
    type APIInteraction,
    type APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";

import { handleCommand } from "@/lib/command-handler";
import { tryCatch } from "@/lib/try-catch";
import type { ApiCommandInteraction } from "@/lib/types";

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
            if (!isChatInputCommand(interaction)) {
                return NextResponse.json(
                    { error: "Unsupported application command type" },
                    { status: 400 }
                );
            }

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
                        content: "There was an error executing this command!",
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

            return NextResponse.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: data.content,
                    flags: data.ephemeral ? MessageFlags.Ephemeral : undefined,
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
                    await import("@/commands/reminder/remind-modal");

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

    const rows = (interaction.data.components ?? []) as Array<{
        components?: Array<{
            custom_id?: unknown;
            value?: unknown;
            values?: unknown;
        }>;
    }>;

    for (const row of rows) {
        for (const component of row.components ?? []) {
            const customId = component.custom_id;

            if (typeof customId !== "string") {
                continue;
            }

            if (typeof component.value === "string") {
                fields[customId] = component.value;
                continue;
            }

            const values = component.values;
            if (Array.isArray(values) && values[0]) {
                fields[customId] = String(values[0]);
            }
        }
    }

    return fields;
}
