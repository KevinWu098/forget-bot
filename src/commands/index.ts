import {
    data as remindData,
    execute as remindExecute,
} from "@/commands/reminder/remind";
import {
    data as pingData,
    execute as pingExecute,
} from "@/commands/utility/ping";
import type {
    CommandInteraction,
    SlashCommandOptionsOnlyBuilder,
} from "discord.js";

import type { CommandResponse } from "@/lib/command-handler";
import type { ForgetBotContext } from "@/lib/types";

export const commands = new Map<
    string,
    {
        data: SlashCommandOptionsOnlyBuilder;
        execute: (
            interaction: CommandInteraction,
            context?: ForgetBotContext
        ) => Promise<CommandResponse>;
    }
>([
    [pingData.name, { data: pingData, execute: pingExecute }],
    [remindData.name, { data: remindData, execute: remindExecute }],
]);
