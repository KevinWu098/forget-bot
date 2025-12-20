import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { verifyKey } from "discord-interactions";
import {
    ApplicationCommandType,
    InteractionResponseType,
    InteractionType,
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
                id: z.string(),
                name: z.string(),
                type: z.enum(ApplicationCommandType),
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
                    environment:
                        env.NODE_ENV === "production"
                            ? "production"
                            : "development",
                })
            );

            if (error) {
                console.error("❌ Error executing command:", error);
                return NextResponse.json({
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content: "There was an error executing this command!",
                        flags: 64, // ephemeral
                    },
                });
            }

            return NextResponse.json({
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: data.content,
                    flags: data.ephemeral ? 64 : undefined, // 64 = ephemeral flag
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
