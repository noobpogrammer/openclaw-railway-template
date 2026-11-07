# OpenClaw Railway Template

## Security Notice

> **This template exposes your OpenClaw gateway to the public internet.** **Please read the [OpenClaw security documentation](https://docs.openclaw.ai/gateway/security) before deploying** to understand the risks and recommended configuration. If you only use chat channels (Telegram, Discord, Slack) and don't need the gateway dashboard, you can remove the public endpoint from Railway after setup.

<img width="1860" height="2624" alt="CleanShot 2026-02-23 at 21 59 06@2x" src="https://github.com/user-attachments/assets/2605d44c-4319-4e92-838c-3caa726b9595" />

## What you get

- **OpenClaw Gateway + Control UI** (served at `/` and `/openclaw`)
- A friendly **Setup Wizard** at `/setup` (protected by a password)
- Persistent state via **Railway Volume** (so config/credentials/memory survive redeploys)

## How it works (high level)

- The container runs a wrapper web server.
- The wrapper protects `/setup` with `SETUP_PASSWORD`.
- During setup, the wrapper runs `openclaw onboard ...` inside the container, writes state to the volume, and then starts the gateway. API-key providers use non-interactive setup. Interactive device-code logins (ChatGPT/Codex, xAI/Grok) can't run from the web wizard — complete those by running `openclaw wizard` in the Railway console.
- After setup, **`/` is OpenClaw**. The wrapper reverse-proxies all traffic (including WebSockets) to the local gateway process.

## Getting chat tokens (so you don't have to scramble)

### ChatGPT / OpenAI Codex and Grok / xAI subscription login

These providers use an interactive device-code login that the web `/setup` wizard can't drive. Complete them from the Railway console instead:

1. Open your service in Railway and launch the **console** (a shell inside the running container).
2. Run `openclaw wizard` and follow the prompts. Choose the ChatGPT/Codex or xAI/Grok device login, open the URL it prints in your browser, and enter the short code.
3. Once the wizard finishes saving the OAuth profile, return to `/setup` — the instance will be configured and the gateway will start.

This lets you use a ChatGPT/Codex account or an eligible SuperGrok / X Premium subscription without pasting an API key.

### Telegram bot token

1. Open Telegram and message **@BotFather**
2. Run `/newbot` and follow the prompts
3. BotFather will give you a token that looks like: `123456789:AA...`
4. Paste that token into `/setup`

### Discord bot token

1. Go to the Discord Developer Portal: https://discord.com/developers/applications
2. **New Application** → pick a name
3. Open the **Bot** tab → **Add Bot**
4. Copy the **Bot Token** and paste it into `/setup`
5. Invite the bot to your server (OAuth2 URL Generator → scopes: `bot`, `applications.commands`; then choose permissions)

## Local testing

```bash
docker build -t openclaw-railway-template .

docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e SETUP_PASSWORD=test \
  -e OPENCLAW_STATE_DIR=/data/.openclaw \
  -e OPENCLAW_WORKSPACE_DIR=/data/workspace \
  -v $(pwd)/.tmpdata:/data \
  openclaw-railway-template

# Setup wizard: http://localhost:8080/setup (password: test)
```

## FAQ

**Q: How do I access the setup page?**

A: Go to `/setup` on your deployed instance. When prompted for credentials, use the generated `SETUP_PASSWORD` from your Railway Variables as the password. The username field is ignored—you can leave it empty or enter anything.

**Q: I see "gateway disconnected" or authentication errors in the Control UI. What should I do?**

A: Go back to `/setup` and click the "Open OpenClaw UI" button from there. The setup page passes the required auth token to the UI. Accessing the UI directly without the token will cause connection errors.

**Q: How do I approve pairing for Telegram or Discord?**

A: Go to `/setup` and use the "Approve Pairing" dialog to approve pending pairing requests from your chat channels.

**Q: I see "pairing required" when opening the Control UI. How do I fix it?**

A: New browsers/devices need a one-time approval from the gateway. Go to `/setup`, click "Manage Devices" in the Devices section, and click "Approve Latest Request". Refresh the Control UI and it should connect. Local connections (127.0.0.1) are auto-approved; remote connections (LAN, public URL) require explicit approval.

**Q: How do I change the AI model after setup?**

A: Use the OpenClaw CLI to switch models. Railway provides an integrated in-browser shell directly in your dashboard — no external SSH client needed. Open the Railway dashboard, click your service, go to the **Console** tab, and use the connected shell to run:

```bash
openclaw models set provider/model-id
```

For example: `openclaw models set anthropic/claude-sonnet-4-20250514` or `openclaw models set openai/gpt-4-turbo`. Use `openclaw models list --all` to see available models.

**Q: How do I access configuration after the initial setup?**

A: Visit `/setup` on your deployed instance at any time — it works both before and after setup. Once configured, the setup page shows your current status along with management tools: device approval, health checks (Run Doctor), data export, and a reset option. You'll need your `SETUP_PASSWORD` to access it.

**Q: My config seems broken or I'm getting strange errors. How do I fix it?**

A: Go to `/setup` and click the "Run Doctor" button. This runs `openclaw doctor --fix` which performs health checks on your gateway and channels, creates a backup of your config, and removes any unrecognized or corrupted configuration keys.

## Screenshots

## Setup

<img width="2110" height="2032" alt="CleanShot 2026-02-23 at 21 57 59@2x" src="https://github.com/user-attachments/assets/28640eec-fa35-42f2-ba56-cb1fbb9525de" />

## Device approval

<img width="1712" height="1376" alt="CleanShot 2026-02-23 at 21 59 21@2x" src="https://github.com/user-attachments/assets/f30ab683-dbc2-4980-ace7-152265e00c79" />

## Support

Need help? [Request support on Railway Station](https://station.railway.com/all-templates/d0880c01-2cc5-462c-8b76-d84c1a203348)

### Procurement runtime compatibility

Startup pins OpenAI model runtime policy to `openclaw`, preserving the selected model and OAuth profiles. The procurement plugin uses `before_prompt_build.toolsAllow` to restrict tools per turn; the Codex app-server runtime rejects this policy. The built-in runtime supports it and routes existing OpenAI OAuth through its Codex-auth transport. Do not remove the tool policy to work around runtime errors. See https://docs.openclaw.ai/concepts/agent-runtimes.
