const fs = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NEWS_PATH = path.join(ROOT, "data", "news.json");
const STATE_PATH = path.join(ROOT, "data", "telegram-state.json");

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function storyAgeHours(story) {
  const published = Date.parse(story.published_at);
  if (Number.isNaN(published)) return Infinity;
  return (Date.now() - published) / 36e5;
}

function selectStories(feed, state, options) {
  const posted = new Set(state.posted_ids || []);
  const maxAgeHours = Number(options.hours);
  const minImpact = Number(options.minImpact);

  return (feed.stories || [])
    .filter((story) => story && story.id && !posted.has(story.id))
    .filter((story) => Number(story.impact || 0) >= minImpact)
    .filter((story) => storyAgeHours(story) <= maxAgeHours)
    .sort((left, right) => {
      const impactDelta = Number(right.impact || 0) - Number(left.impact || 0);
      if (impactDelta) return impactDelta;
      return Date.parse(right.published_at || 0) - Date.parse(left.published_at || 0);
    })
    .slice(0, Number(options.max));
}

function buildMessage(story) {
  const source = story.sources && story.sources[0] ? story.sources[0] : {};
  const sourceName = source.name || "Original source";
  const sourceUrl = source.url || "";
  const summary = story.translations?.en || "Open the original source for the full report and context.";

  const lines = [
    "<b>PULSE Update</b>",
    "",
    `<b>${escapeHtml(story.headline)}</b>`,
    "",
    `${escapeHtml(story.region || "World")} | ${escapeHtml(story.topic || "News")} | ${escapeHtml(story.urgency || "Update")}`,
    `Impact: ${escapeHtml(story.impact || "?")}/100`,
    "",
    escapeHtml(summary),
    "",
    sourceUrl
      ? `Source: <a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceName)}</a>`
      : `Source: ${escapeHtml(sourceName)}`,
  ];

  return lines.join("\n").slice(0, 3900);
}

async function sendTelegramMessage(token, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API returned ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const options = {
    max: argValue("max", "1"),
    minImpact: argValue("min-impact", "60"),
    hours: argValue("hours", "48"),
  };
  const dryRun = hasFlag("dry-run");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || "@pulseupdate";

  const feed = await readJson(NEWS_PATH, { stories: [] });
  const state = await readJson(STATE_PATH, { posted_ids: [] });
  const selected = selectStories(feed, state, options);

  if (!selected.length) {
    console.log("No new Telegram-worthy stories found.");
    return;
  }

  if (!dryRun && !token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable.");
  }

  const postedIds = [];
  for (const story of selected) {
    const message = buildMessage(story);

    if (dryRun) {
      console.log(message);
      console.log("\n---");
    } else {
      await sendTelegramMessage(token, chatId, message);
      console.log(`Posted to Telegram: ${story.headline}`);
    }

    postedIds.push(story.id);
  }

  if (!dryRun) {
    const nextState = {
      posted_ids: [...postedIds, ...(state.posted_ids || [])].slice(0, 250),
      last_posted_at: new Date().toISOString(),
      last_posted_headline: selected[0].headline,
    };

    await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
    await fs.writeFile(STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
