import { env } from "@/env";
import {
    Client,
    Events,
    GatewayIntentBits,
    MessageFlags,
    type Interaction,
} from "discord.js";

import { handleCommand } from "@/lib/command-handler";
import { tryCatch } from "@/lib/try-catch";

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

        const { data, error } = await tryCatch(
            handleCommand(interaction, {
                environment: "development",
            })
        );

        if (error) {
            const errorMessage =
                "There was an error while executing this command!";

            console.error(`❌ Error executing command:`, error);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    flags: MessageFlags.Ephemeral,
                });
            }

            return;
        }

        await interaction.reply({
            content: data.content,
            flags: data.ephemeral ? MessageFlags.Ephemeral : undefined,
        });

        console.error(`❌ Error executing command:`, error);
    })();
});

const token = env.DISCORD_TOKEN;
if (!token) {
    console.error("❌ DISCORD_TOKEN is not set in environment variables");
    process.exit(1);
}

void client.login(token);
