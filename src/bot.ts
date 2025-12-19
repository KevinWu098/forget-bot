import { env } from "@/env";
import {
    Client,
    Events,
    GatewayIntentBits,
    type Interaction,
} from "discord.js";

import { handleCommand } from "@/lib/command-handler";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
});

client.once(Events.ClientReady, (readyClient) => {
    console.info(`✅ Bot is online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, (interaction: Interaction) => {
    void (async () => {
        if (!interaction.isChatInputCommand()) {
            return;
        }

        try {
            const response = await handleCommand(interaction, {
                environment: "development",
            });

            await interaction.reply({
                content: response.content,
                ephemeral: response.ephemeral,
            });
        } catch (error) {
            console.error(`❌ Error executing command:`, error);

            const errorMessage =
                "There was an error while executing this command!";

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true,
                });
            }
        }
    })();
});

const token = env.DISCORD_TOKEN;
if (!token) {
    console.error("❌ DISCORD_TOKEN is not set in environment variables");
    process.exit(1);
}

void client.login(token);
