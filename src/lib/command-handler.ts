import { commands } from "@/commands";
import type { NodeEnv } from "@/env";
import type { CommandInteraction, ModalBuilder } from "discord.js";

import { WHITELIST } from "@/lib/constants";
import { tryCatch } from "@/lib/try-catch";
import type { ForgetBotContext } from "@/lib/types";

export type CommandResponse = {
    content: string;
    ephemeral?: boolean;
    modal?: ModalBuilder;
};

export async function handleCommand(
    interaction: CommandInteraction,
    context: ForgetBotContext
): Promise<CommandResponse> {
    if (!WHITELIST.has(interaction.user.id)) {
        return {
            content: [
                "🚫 **Access denied**",
                "You don’t have permission to forget.",
            ].join("\n"),
            ephemeral: true,
        };
    }

    const commandName = interaction.commandName;
    const command = commands.get(commandName);

    if (!command) {
        return {
            content: `❌ Command "${commandName}" not found`,
            ephemeral: true,
        };
    }

    const { data, error } = await tryCatch(
        command.execute(interaction, context)
    );

    if (error) {
        const errorMessage = `❌ Error executing command "${commandName}"`;

        console.error(`${errorMessage}:`, error);
        return {
            content: errorMessage,
            ephemeral: true,
        };
    }

    return {
        content: withEnvironment(data.content, context.environment),
        ephemeral: data.ephemeral,
        modal: data.modal,
    };
}

function withEnvironment(content: string, environment: NodeEnv) {
    return `${environment === "development" ? "[DEVELOPMENT] " : ""}${content}`;
}
