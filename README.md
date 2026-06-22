# PULSE Radar

A static prototype for a public global news radar: important world news
filtered, translated, sourced, and updated live.

The website loads its feed from `data/news.json`. Update that file to change
the public stories, source links, translations, impact scores, and timestamps.
A production version should connect permitted feeds, source APIs, an editorial
review layer, and a Telegram bot. Every public item should link back to the
original source.

## Automatic updates

`data/sources.json` contains the first public RSS feeds. Run:

```powershell
node scripts/update-news.js
```

The script fetches recent RSS items, writes short PULSE summaries, keeps source
links, and updates `data/news.json`. The GitHub Actions workflow in
`.github/workflows/update-news.yml` can run it every 30 minutes after the files
are pushed to GitHub.

## Telegram updates

Create a Telegram bot with BotFather, add it as an admin of `@pulseupdate`, and
add the bot token to GitHub as a repository secret named
`TELEGRAM_BOT_TOKEN`.

When that secret exists, the same GitHub Actions workflow posts one high-impact
story to Telegram after each feed update. Posted story IDs are stored in
`data/telegram-state.json` so the channel does not repeat the same item.
