import { commands } from "@/commands";
import type { NodeEnv } from "@/env";
import type { CommandInteraction, ModalBuilder } from "discord.js";

import { WHITELIST } from "@/lib/constants";
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

    if (!commandName) {
        throw new Error("No command name found in interaction");
    }

    const command = commands.get(commandName);

    if (!command) {
        throw new Error(`Command "${commandName}" not found`);
    }

    const result = await command.execute(interaction, context);

    return {
        content: withEnvironment(result.content, context.environment),
        ephemeral: result.ephemeral,
        modal: result.modal,
    };
}

function withEnvironment(content: string, environment: NodeEnv) {
    return `${environment === "development" ? "[DEVELOPMENT] " : ""}${content}`;
}
