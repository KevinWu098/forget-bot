# Forget Bot

A serverless Discord bot built with Next.js and Discord.js, deployable to
Vercel.

## Features

- ⚡ Serverless architecture using Discord Interactions Webhook
- 🚀 Deployable to Vercel with zero configuration
- 👤 User-installable (commands follow you, not servers)
- 🔧 Easy to extend with new commands

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Create a `.env` file:

```bash
DISCORD_TOKEN=your_bot_token_here
DISCORD_APPLICATION_ID=your_application_id_here
DISCORD_PUBLIC_KEY=your_public_key_here
```

### 3. Deploy to Vercel

```bash
vercel
```

### 4. Configure Discord

1. Go to your
   [Discord Developer Portal](https://discord.com/developers/applications)
2. Set **Interactions Endpoint URL** to:
   `https://your-app.vercel.app/api/discord`
3. Enable **User Install** in the Installation tab
4. Run `pnpm deploy-commands` to register slash commands

### 5. Install to Your Account

Visit: `https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID`

## Available Commands

- `/ping` - Replies with "Hello World"

## Development

### Local Gateway Bot (for testing)

```bash
pnpm bot:dev
```

### Local Serverless API

```bash
pnpm dev
```

Use [ngrok](https://ngrok.com/) to expose your local server for testing
webhooks.

## Adding New Commands

1. Create a new file in `src/commands/utility/your-command.ts`
2. Export `data` (SlashCommandBuilder) and `execute` function
3. Import and register in `src/app/api/discord/route.ts`
4. Run `pnpm deploy-commands` to register
5. Deploy with `vercel --prod`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Tech Stack

- [Next.js](https://nextjs.org) - React framework
- [Discord.js](https://discord.js.org) - Discord API library
- [Vercel](https://vercel.com) - Serverless hosting
- TypeScript - Type safety
