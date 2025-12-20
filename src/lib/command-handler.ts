import { commands } from "@/commands";
import type { CommandInteraction } from "discord.js";

import { WHITELIST } from "@/lib/constants";

import type { ForgetBotContext } from "./types";

export type CommandResponse = {
    content: string;
    ephemeral?: boolean;
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

    // ? TODO: What is going on here?
    if (typeof result === "string") {
        return { content: result };
    } else if (result && typeof result === "object" && "content" in result) {
        return result;
    } else {
        return { content: "Command executed successfully" };
    }
}
