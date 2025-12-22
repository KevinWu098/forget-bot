import {
    ApplicationIntegrationType,
    InteractionContextType,
    SlashCommandBuilder,
} from "discord.js";

import type { CommandResponse } from "@/lib/command-handler";
import type { ApiCommandInteraction, ForgetBotContext } from "@/lib/types";

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
    _: ApiCommandInteraction,
    __: ForgetBotContext
): Promise<CommandResponse> {
    return {
        content: `Hello World`,
    };
}
