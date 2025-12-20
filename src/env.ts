import { createEnv } from "@t3-oss/env-nextjs";
import { config } from "dotenv";
import { z } from "zod";

if (!process.env.VERCEL) {
    config();
}

export const env = createEnv({
    server: {
        NODE_ENV: z.enum(["development", "production"]).default("development"),

        DISCORD_TOKEN: z.string().min(1),
        DISCORD_APPLICATION_ID: z.string().min(1),
        DISCORD_PUBLIC_KEY: z.string().min(1),

        DISCORD_TOKEN_DEV: z.string().min(1),
        DISCORD_APPLICATION_ID_DEV: z.string().min(1),
        DISCORD_PUBLIC_KEY_DEV: z.string().min(1),
    },
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        DISCORD_TOKEN: process.env.DISCORD_TOKEN,
        DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
        DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
        DISCORD_TOKEN_DEV: process.env.DISCORD_TOKEN_DEV,
        DISCORD_APPLICATION_ID_DEV: process.env.DISCORD_APPLICATION_ID_DEV,
        DISCORD_PUBLIC_KEY_DEV: process.env.DISCORD_PUBLIC_KEY_DEV,
    },
});
