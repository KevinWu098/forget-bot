import { data, execute as pingExecute } from "@/commands/utility/ping";
import type { CommandInteraction, SlashCommandBuilder } from "discord.js";

import type { CommandResponse } from "@/lib/command-handler";
import type { ForgetBotContext } from "@/lib/types";

export const commands = new Map<
    string,
    {
        data: SlashCommandBuilder;
        execute: (
            interaction: CommandInteraction,
            context?: ForgetBotContext
        ) => Promise<CommandResponse>;
    }
>([[data.name, { data, execute: pingExecute }]]);
