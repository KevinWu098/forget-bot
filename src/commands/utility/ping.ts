import {
    ApplicationIntegrationType,
    InteractionContextType,
    SlashCommandBuilder,
    type CommandInteraction,
} from "discord.js";

import type { CommandResponse } from "@/lib/command-handler";
import type { ForgetBotContext } from "@/lib/types";

export const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Hello World!")
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
    .setContexts(
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel
    );

export async function execute(
    _: CommandInteraction,
    context?: ForgetBotContext
): Promise<CommandResponse> {
    return {
        content: `${context?.environment === "development" ? "[DEVELOPMENT] " : ""} Hello World`,
    };
}
