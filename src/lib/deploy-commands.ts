import { commands } from "@/commands";
import { env } from "@/env";
import {
    REST,
    Routes,
    type RESTPutAPIApplicationCommandsJSONBody,
} from "discord.js";

import { tryCatch } from "@/lib/try-catch";

const token =
    env.NODE_ENV === "production" ? env.DISCORD_TOKEN : env.DISCORD_TOKEN_DEV;
const applicationId =
    env.NODE_ENV === "production"
        ? env.DISCORD_APPLICATION_ID
        : env.DISCORD_APPLICATION_ID_DEV;

console.info(`Deploying to ${env.NODE_ENV.toLocaleUpperCase()}`);

const rest = new REST().setToken(token);

const commandsData = Array.from(commands.values()).map((command) =>
    command.data.toJSON()
) satisfies RESTPutAPIApplicationCommandsJSONBody;

console.info(
    `Started refreshing ${commandsData.length} application (/) commands.`
);

void (async () => {
    const { data, error } = await tryCatch(
        rest.put(Routes.applicationCommands(applicationId), {
            body: commandsData,
        })
    );

    if (error) {
        console.error(`❌ Error refreshing commands:`, error);
        return;
    }

    if (!Array.isArray(data)) {
        console.error(
            `❌ Expected response of type array, got type ${typeof data}`,
            data
        );
        return;
    }

    console.info(
        `Successfully reloaded ${data.length} application (/) commands.`
    );
})();
