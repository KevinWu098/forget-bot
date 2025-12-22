import {
    data as listRemindersData,
    execute as listRemindersExecute,
} from "@/commands/reminder/list-reminders";
import {
    data as remindData,
    execute as remindExecute,
} from "@/commands/reminder/remind";
import {
    data as remindMessageData,
    execute as remindMessageExecute,
} from "@/commands/reminder/remind-message";
import {
    data as remindModalData,
    execute as remindModalExecute,
} from "@/commands/reminder/remind-modal";
import {
    data as pingData,
    execute as pingExecute,
} from "@/commands/utility/ping";
import type {
    ContextMenuCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
} from "discord.js";

import type { CommandResponse } from "@/lib/command-handler";
import type {
    ApiCommandInteraction,
    ApiMessageContextInteraction,
    ForgetBotContext,
} from "@/lib/types";

type Command = {
    data: SlashCommandOptionsOnlyBuilder | ContextMenuCommandBuilder;
    execute: (
        interaction: ApiCommandInteraction | ApiMessageContextInteraction,
        context: ForgetBotContext
    ) => Promise<CommandResponse>;
};

function createCommand<
    T extends ApiCommandInteraction | ApiMessageContextInteraction,
>(command: {
    data: SlashCommandOptionsOnlyBuilder | ContextMenuCommandBuilder;
    execute: (
        interaction: T,
        context: ForgetBotContext
    ) => Promise<CommandResponse>;
}): Command {
    return command as Command;
}

export const commands = new Map<string, Command>([
    [pingData.name, createCommand({ data: pingData, execute: pingExecute })],
    [
        remindData.name,
        createCommand({ data: remindData, execute: remindExecute }),
    ],
    [
        remindModalData.name,
        createCommand({ data: remindModalData, execute: remindModalExecute }),
    ],
    [
        listRemindersData.name,
        createCommand({
            data: listRemindersData,
            execute: listRemindersExecute,
        }),
    ],
    [
        remindMessageData.name,
        createCommand({
            data: remindMessageData,
            execute: remindMessageExecute,
        }),
    ],
]);
