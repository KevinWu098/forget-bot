import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { verifyKey } from "discord-interactions";
import { InteractionResponseType, InteractionType } from "discord.js";

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

    const interaction = JSON.parse(body);

    switch (interaction.type) {
        case InteractionType.Ping:
            return NextResponse.json({
                type: InteractionResponseType.Pong,
            });
        case InteractionType.ApplicationCommand:
            const { data, error } = await tryCatch(
                handleCommand(interaction, {
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
        default:
            return NextResponse.json(
                { error: "Unknown interaction type" },
                { status: 400 }
            );
    }
}
