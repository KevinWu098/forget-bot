import { commands } from "@/commands";
import { env } from "@/env";
import { REST, Routes } from "discord.js";

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(env.DISCORD_TOKEN);

// Deploy commands
(async () => {
    try {
        console.log(
            `🔄 Started refreshing ${commands.size} application (/) commands.`
        );

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = (await rest.put(
            Routes.applicationCommands(env.DISCORD_APPLICATION_ID),
            { body: commands }
        )) as any[];

        console.log(
            `✅ Successfully reloaded ${data.length} application (/) commands.`
        );
    } catch (error) {
        console.error(error);
    }
})();
