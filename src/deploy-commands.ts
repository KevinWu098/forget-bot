import { commands } from "@/commands";
import { env } from "@/env";
import { REST, Routes } from "discord.js";

const isProd = env.NODE_ENV === "production" || process.argv.includes("--prod");
const token = isProd ? env.DISCORD_TOKEN : env.DISCORD_TOKEN_DEV;
const applicationId = isProd
    ? env.DISCORD_APPLICATION_ID
    : env.DISCORD_APPLICATION_ID_DEV;

console.info(`🎯 Deploying to ${isProd ? "PRODUCTION" : "DEVELOPMENT"} app`);

const rest = new REST().setToken(token);

const commandsData = Array.from(commands.values()).map((command) =>
    command.data.toJSON()
);

void (async () => {
    try {
        console.info(
            `🔄 Started refreshing ${commandsData.length} application (/) commands.`
        );

        const data = (await rest.put(
            Routes.applicationCommands(applicationId),
            {
                body: commandsData,
            }
        )) as unknown[];

        console.info(
            `✅ Successfully reloaded ${data.length} application (/) commands.`
        );
    } catch (error) {
        console.error(error);
    }
})();
