# PULSE Radar

PULSE Radar is a static global-news dashboard backed by an automated GitHub
Actions feed updater.

The website reads stories from `data/news.json`, links every story back to the
original source, shows source-provided RSS photos when available, and refreshes
the feed in the browser every five minutes.

## Public Automation

- `scripts/update-news.js` fetches public RSS feeds, extracts story image URLs,
  and writes `data/news.json`.
- `scripts/post-telegram.js` posts one high-impact item to `@pulseupdate`.
- `.github/workflows/update-news.yml` runs the updater every 30 minutes.

Set the GitHub Actions secret `TELEGRAM_BOT_TOKEN` to enable Telegram posting.
