#!/bin/sh
# Starts the website, and the word-of-the-day bot alongside it if it's configured.
#
# The web server runs in the FOREGROUND and is therefore the container's fate: if it
# dies, the container dies and Render restarts it. The bot runs in a background loop
# that restarts itself, so a crash in the bot never takes the website down with it.
#
# Without TOKEN and CHANNEL_ID the bot simply doesn't start. That is deliberate — it
# lets this image be deployed website-only first, proving the move to Docker, before
# the bot is switched on by adding two environment variables.

set -e

if [ -n "$TOKEN" ] && [ -n "$CHANNEL_ID" ]; then
    if [ -z "$DATABASE_URL" ]; then
        echo "wod-bot: DATABASE_URL is not set — the bot stores every submission there. Not starting." >&2
    else
        echo "wod-bot: starting" >&2
        (
            while true; do
                python3 /app/discord-wod-bot/src/word_bot.py || true
                # A crash loop against Discord's rate limits would get the token
                # temporarily banned, so back off rather than retrying instantly.
                echo "wod-bot: exited, restarting in 30s" >&2
                sleep 30
            done
        ) &
    fi
else
    echo "wod-bot: TOKEN/CHANNEL_ID not set — running the website only" >&2
fi

exec node /app/build/index.js
