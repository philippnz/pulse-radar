let languages = [];
let stories = [];
let regions = ["All"];
let activeRegion = "All";
let activeLanguage = "en";
let leadIndex = 0;
let updateCount = 0;

const storyGrid = document.querySelector("#story-grid");
const signalList = document.querySelector("#signal-list");
const signalCount = document.querySelector("#signal-count");
const regionTabs = document.querySelector("#region-tabs");
const languageTabs = document.querySelector("#language-tabs");
const tickerTrack = document.querySelector("#ticker-track");
const header = document.querySelector(".site-header");

const leadHeadline = document.querySelector("#lead-headline");
const leadSummary = document.querySelector("#lead-summary");
const leadSource = document.querySelector("#lead-source");
const leadRegion = document.querySelector("#lead-region");
const leadAge = document.querySelector("#lead-age");
const leadLinks = document.querySelector("#lead-links");
const heroClock = document.querySelector("#hero-clock");
const lastUpdated = document.querySelector("#last-updated");
const telegramLabel = document.querySelector("#telegram-label");
const telegramHeadline = document.querySelector("#telegram-headline");
const telegramBody = document.querySelector("#telegram-body");
const telegramSource = document.querySelector("#telegram-source");
const telegramTime = document.querySelector("#telegram-time");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function getSourceNames(story) {
  return story.sources.map((source) => source.name).join(" / ");
}

function getSummary(story) {
  return story.translations[activeLanguage] || story.translations.en || "";
}

function formatClock() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
    timeZoneName: "short",
  }).format(new Date());
}

function formatAge(publishedAt) {
  if (!publishedAt) return "Updated";

  const publishedTime = new Date(publishedAt).getTime();
  const diffMinutes = Math.max(0, Math.round((Date.now() - publishedTime) / 60000));

  if (diffMinutes < 1) return "Now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function renderRegions() {
  regionTabs.innerHTML = regions
    .map(
      (region) => `
        <button class="region-tab${region === activeRegion ? " is-active" : ""}" type="button" data-region="${escapeAttribute(region)}">
          ${escapeHtml(region)}
        </button>
      `,
    )
    .join("");
}

function renderLanguages() {
  languageTabs.innerHTML = languages
    .map(
      (language) => `
        <button class="language-tab${language.code === activeLanguage ? " is-active" : ""}" type="button" data-language="${escapeAttribute(language.code)}">
          ${escapeHtml(language.label)}
        </button>
      `,
    )
    .join("");
}

function getFilteredStories() {
  return activeRegion === "All"
    ? stories
    : stories.filter((story) => story.region === activeRegion);
}

function sourceLinks(story) {
  return story.sources
    .map(
      (source) => `
        <a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a>
      `,
    )
    .join("");
}

function renderSignals() {
  const filtered = getFilteredStories();
  signalCount.textContent = String(filtered.length).padStart(2, "0");

  if (!filtered.length) {
    signalList.innerHTML = `<p class="empty-state">No matching stories in this feed yet.</p>`;
    return;
  }

  signalList.innerHTML = filtered
    .map(
      (story) => `
        <article class="signal-item">
          <div>
            <span>${escapeHtml(story.region)}</span>
            <strong>${escapeHtml(story.urgency)}</strong>
          </div>
          <h3>${escapeHtml(story.headline)}</h3>
          <p>${escapeHtml(getSummary(story))}</p>
          <div class="mini-links">${sourceLinks(story)}</div>
        </article>
      `,
    )
    .join("");
}

function renderStories() {
  const filtered = getFilteredStories();

  if (!filtered.length) {
    storyGrid.innerHTML = `<p class="empty-state">No matching stories in this feed yet.</p>`;
    return;
  }

  storyGrid.innerHTML = filtered
    .map(
      (story) => `
        <article class="story-card${story.urgency === "Breaking" ? " is-breaking" : ""}">
          <div class="story-meta">
            <span class="story-topic">${escapeHtml(story.topic)}</span>
            <span class="story-urgency">${escapeHtml(story.urgency)}</span>
          </div>
          <div>
            <h3>${escapeHtml(story.headline)}</h3>
            <p>${escapeHtml(getSummary(story))}</p>
          </div>
          <div>
            <div class="story-footer">
              <span>${escapeHtml(getSourceNames(story))}</span>
              <span class="impact-score">${escapeHtml(story.impact)}</span>
            </div>
            <div class="source-links" aria-label="Original source links">
              ${sourceLinks(story)}
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderTicker() {
  if (!stories.length) {
    tickerTrack.innerHTML = "";
    return;
  }

  const tickerItems = stories
    .map(
      (story) => `
        <span class="ticker-item">
          <span class="ticker-topic">${escapeHtml(story.region)}</span>
          <span>${escapeHtml(story.headline)}</span>
        </span>
      `,
    )
    .join("");

  tickerTrack.innerHTML = tickerItems + tickerItems;
}

function setLeadStory(index) {
  if (!stories.length) {
    leadHeadline.textContent = "Feed unavailable";
    leadSummary.textContent = "PULSE could not load the current news feed.";
    leadSource.textContent = "Check data/news.json";
    leadRegion.textContent = "System";
    leadAge.textContent = "Offline";
    leadLinks.innerHTML = "";
    telegramLabel.textContent = "SYSTEM | OFFLINE";
    telegramHeadline.textContent = "Feed unavailable";
    telegramBody.textContent = "PULSE could not load the current news feed.";
    telegramSource.textContent = "Source: data/news.json";
    telegramTime.textContent = `Updated: ${formatClock()}`;
    return;
  }

  const story = stories[index % stories.length];
  const summary = getSummary(story);
  const sources = getSourceNames(story);
  const age = formatAge(story.published_at);

  leadHeadline.textContent = story.headline;
  leadSummary.textContent = summary;
  leadSource.textContent = sources;
  leadRegion.textContent = story.region;
  leadAge.textContent = age;
  leadLinks.innerHTML = sourceLinks(story);

  telegramLabel.textContent = `${story.region.toUpperCase()} | ${story.urgency.toUpperCase()}`;
  telegramHeadline.textContent = story.headline;
  telegramBody.textContent = `PULSE summary: ${summary}`;
  telegramSource.textContent = `Sources: ${sources}`;
  telegramTime.textContent = `Updated: ${formatClock()}`;
}

function updateClock() {
  const clock = formatClock();
  heroClock.textContent = clock;
  lastUpdated.textContent = `Auto update ${++updateCount} | ${clock}`;
}

function refreshContent() {
  renderRegions();
  renderLanguages();
  renderSignals();
  renderStories();
  renderTicker();
  setLeadStory(leadIndex);
}

function updateHeaderState() {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

function normalizeFeed(feed) {
  const nextLanguages = Array.isArray(feed.languages) ? feed.languages : [];
  const nextStories = Array.isArray(feed.stories) ? feed.stories : [];

  languages = nextLanguages.length ? nextLanguages : [{ code: "en", label: "English" }];
  stories = nextStories
    .filter((story) => story && story.headline && Array.isArray(story.sources))
    .sort((a, b) => (Number(b.impact) || 0) - (Number(a.impact) || 0));
  regions = ["All", ...new Set(stories.map((story) => story.region).filter(Boolean))];
  activeRegion = regions.includes(activeRegion) ? activeRegion : "All";
  activeLanguage = languages.some((language) => language.code === activeLanguage)
    ? activeLanguage
    : languages[0].code;
}

async function loadNewsFeed() {
  try {
    const response = await fetch(`data/news.json?v=${Date.now()}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Feed request failed with ${response.status}`);
    }

    normalizeFeed(await response.json());
  } catch (error) {
    console.error(error);

    if (!stories.length) {
      languages = [{ code: "en", label: "English" }];
      stories = [];
      regions = ["All"];
    }
  }

  refreshContent();
}

regionTabs.addEventListener("click", (event) => {
  const button = event.target.closest(".region-tab");

  if (!button) return;

  activeRegion = button.dataset.region;
  refreshContent();
});

languageTabs.addEventListener("click", (event) => {
  const button = event.target.closest(".language-tab");

  if (!button) return;

  activeLanguage = button.dataset.language;
  refreshContent();
});

window.addEventListener("scroll", updateHeaderState);

updateClock();
updateHeaderState();
loadNewsFeed();

setInterval(() => {
  if (!stories.length) return;

  leadIndex += 1;
  setLeadStory(leadIndex);
}, 7000);

setInterval(updateClock, 15000);
setInterval(loadNewsFeed, 300000);
