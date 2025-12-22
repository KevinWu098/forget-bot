export type ForgetBotContext = {
    environment: "development" | "production";
};

/**
 * Minimal shape of a command interaction we rely on inside the API handler.
 * We keep this lean so we can adapt raw webhook payloads without needing a
 * connected Discord client.
 */
export type ApiCommandInteraction = {
    id: string;
    commandName: string;
    user: {
        id: string;
        username?: string;
    };
    channelId: string | null;
    createdTimestamp: number;
    isChatInputCommand: () => boolean;
    options: {
        getString: (name: string) => string | null;
        getBoolean: (name: string) => boolean | null;
    };
};

/**
 * Minimal shape of a message context menu interaction.
 */
export type ApiMessageContextInteraction = {
    id: string;
    commandName: string;
    user: {
        id: string;
        username?: string;
    };
    targetMessage: {
        id: string;
        content: string;
        channelId: string;
        guildId?: string;
        url: string;
    };
    createdTimestamp: number;
    isMessageContextMenuCommand: () => boolean;
};
