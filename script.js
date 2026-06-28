const FEED_URL = "data/news.json";
const REFRESH_MS = 5 * 60 * 1000;

const state = {
  feed: null,
  language: "en",
  region: "All",
  query: "",
};

const elements = {
  feedStatus: document.querySelector("#feed-status"),
  leadPhoto: document.querySelector("#lead-photo"),
  leadImage: document.querySelector("#lead-image"),
  leadTitle: document.querySelector("#lead-title"),
  leadSummary: document.querySelector("#lead-summary"),
  leadMeta: document.querySelector("#lead-meta"),
  leadSource: document.querySelector("#lead-source"),
  tickerTrack: document.querySelector("#ticker-track"),
  languageControls: document.querySelector("#language-controls"),
  regionControls: document.querySelector("#region-controls"),
  storySearch: document.querySelector("#story-search"),
  updatedAt: document.querySelector("#updated-at"),
  storyCount: document.querySelector("#story-count"),
  sourceCount: document.querySelector("#source-count"),
  topImpact: document.querySelector("#top-impact"),
  latestList: document.querySelector("#latest-list"),
  regionBoard: document.querySelector("#region-board"),
  topicBoard: document.querySelector("#topic-board"),
  storyGrid: document.querySelector("#story-grid"),
  sourceCloud: document.querySelector("#source-cloud"),
};

function formatTime(value) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function storySummary(story) {
  return story.translations?.[state.language] || story.translations?.en || "";
}

function sourceName(story) {
  return story.sources?.[0]?.name || "Original source";
}

function sourceUrl(story) {
  return story.sources?.[0]?.url || "#";
}

function storyImage(story) {
  const candidates = [
    story.image,
    story.image_url,
    story.media?.image,
    story.sources?.[0]?.image,
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate : candidate?.url;
    if (/^https?:\/\//i.test(value || "")) return value;
  }

  return "";
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function allStories() {
  return state.feed?.stories || [];
}

function visibleStories() {
  const query = state.query.trim().toLowerCase();

  return allStories().filter((story) => {
    const regionMatch = state.region === "All" || story.region === state.region;
    const queryText = [
      story.headline,
      story.region,
      story.topic,
      story.urgency,
      sourceName(story),
      storySummary(story),
    ]
      .join(" ")
      .toLowerCase();

    return regionMatch && (!query || queryText.includes(query));
  });
}

function byPublishedDesc(left, right) {
  return Date.parse(right.published_at || 0) - Date.parse(left.published_at || 0);
}

function groupedStats(stories, key) {
  const groups = new Map();

  stories.forEach((story) => {
    const label = story[key] || "World";
    const existing = groups.get(label) || {
      label,
      count: 0,
      topImpact: 0,
      latest: null,
    };

    existing.count += 1;
    existing.topImpact = Math.max(existing.topImpact, Number(story.impact || 0));
    if (!existing.latest || Date.parse(story.published_at || 0) > Date.parse(existing.latest.published_at || 0)) {
      existing.latest = story;
    }

    groups.set(label, existing);
  });

  return [...groups.values()].sort((left, right) => {
    const impactDelta = right.topImpact - left.topImpact;
    return impactDelta || right.count - left.count || left.label.localeCompare(right.label);
  });
}

function renderSegmented(container, values, selected, onSelect) {
  container.innerHTML = "";

  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = value.label || value;
    button.setAttribute("aria-pressed", String((value.code || value) === selected));
    button.addEventListener("click", () => onSelect(value.code || value));
    container.append(button);
  });
}

function renderControls() {
  const languages = state.feed?.languages?.length
    ? state.feed.languages
    : [{ code: "en", label: "English" }];

  renderSegmented(elements.languageControls, languages, state.language, (code) => {
    state.language = code;
    render();
  });

  const regions = ["All", ...uniqueValues(allStories().map((story) => story.region))];
  renderSegmented(elements.regionControls, regions, state.region, (region) => {
    state.region = region;
    render();
  });
}

function renderLead(stories) {
  const lead = stories[0] || allStories()[0];

  if (!lead) {
    elements.feedStatus.textContent = "Feed unavailable";
    elements.leadPhoto.hidden = true;
    elements.leadImage.removeAttribute("src");
    elements.leadTitle.textContent = "No stories are available yet.";
    elements.leadSummary.textContent = "";
    elements.leadMeta.textContent = "";
    elements.leadSource.style.display = "none";
    return;
  }

  elements.feedStatus.textContent = `${lead.urgency || "Live"} | ${formatTime(lead.published_at)}`;
  const image = storyImage(lead);

  if (image) {
    elements.leadImage.src = image;
    elements.leadImage.alt = lead.headline;
    elements.leadImage.onerror = () => {
      elements.leadPhoto.hidden = true;
      elements.leadImage.removeAttribute("src");
    };
    elements.leadPhoto.hidden = false;
  } else {
    elements.leadPhoto.hidden = true;
    elements.leadImage.removeAttribute("src");
  }

  elements.leadTitle.textContent = lead.headline;
  elements.leadSummary.textContent = storySummary(lead);
  elements.leadMeta.textContent = `${sourceName(lead)} | Published ${formatTime(lead.published_at)} | ${lead.region || "World"} | Impact ${lead.impact || "?"}/100`;
  elements.leadSource.href = sourceUrl(lead);
  elements.leadSource.textContent = `Open ${sourceName(lead)}`;
  elements.leadSource.style.display = "";
}

function renderTicker() {
  const headlines = allStories().slice(0, 10).map((story) => story.headline);
  const doubled = [...headlines, ...headlines];
  elements.tickerTrack.innerHTML = "";

  (doubled.length ? doubled : ["Waiting for live headlines"]).forEach((headline) => {
    const item = document.createElement("span");
    item.textContent = headline;
    elements.tickerTrack.append(item);
  });
}

function renderStats(stories) {
  const sources = uniqueValues(allStories().flatMap((story) => story.sources?.map((source) => source.name) || []));
  const topImpact = Math.max(0, ...allStories().map((story) => Number(story.impact || 0)));

  elements.updatedAt.textContent = state.feed?.updated_at
    ? `Updated ${formatTime(state.feed.updated_at)}`
    : "Awaiting update";
  elements.storyCount.textContent = stories.length;
  elements.sourceCount.textContent = sources.length;
  elements.topImpact.textContent = topImpact;
}

function renderLatestList() {
  const latest = [...allStories()].sort(byPublishedDesc).slice(0, 10);
  elements.latestList.innerHTML = "";

  if (!latest.length) {
    const empty = document.createElement("div");
    empty.className = "latest-item";
    empty.textContent = "Waiting for live stories.";
    elements.latestList.append(empty);
    return;
  }

  latest.forEach((story) => {
    const item = document.createElement("article");
    item.className = "latest-item";

    const copy = document.createElement("div");
    const link = document.createElement("a");
    link.href = sourceUrl(story);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = story.headline;

    const meta = document.createElement("div");
    meta.className = "latest-meta";
    meta.textContent = `${formatTime(story.published_at)} | ${story.region || "World"} | ${sourceName(story)}`;

    const impact = document.createElement("span");
    impact.className = "impact-badge";
    impact.textContent = story.impact || "?";

    copy.append(link, meta);
    item.append(copy, impact);
    elements.latestList.append(item);
  });
}

function renderBoard(container, groups) {
  container.innerHTML = "";
  const maxCount = Math.max(1, ...groups.map((group) => group.count));

  groups.slice(0, 7).forEach((group) => {
    const item = document.createElement("article");
    item.className = "board-item";

    const title = document.createElement("strong");
    title.textContent = group.label;

    const meta = document.createElement("div");
    meta.className = "board-meta";
    meta.textContent = `${group.count} stories | top impact ${group.topImpact}`;

    const bar = document.createElement("div");
    bar.className = "board-bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(8, Math.round((group.count / maxCount) * 100))}%`;
    bar.append(fill);

    item.append(title, meta, bar);
    container.append(item);
  });
}

function renderDesk() {
  renderLatestList();
  renderBoard(elements.regionBoard, groupedStats(allStories(), "region"));
  renderBoard(elements.topicBoard, groupedStats(allStories(), "topic"));
}

function renderMediaFallback(container, story) {
  container.className = "story-media story-media-fallback";
  const label = document.createElement("span");
  label.textContent = `${story.region || "World"} / ${story.topic || "News"}`;
  container.replaceChildren(label);
}

function storyCard(story, index) {
  const article = document.createElement("article");
  article.className = `story-card${index === 0 ? " is-priority" : ""}`;

  const media = document.createElement("div");
  media.className = "story-media";
  const image = storyImage(story);

  if (image) {
    const imageElement = document.createElement("img");
    imageElement.src = image;
    imageElement.alt = story.headline;
    imageElement.loading = index < 4 ? "eager" : "lazy";
    imageElement.addEventListener("error", () => renderMediaFallback(media, story), { once: true });
    media.append(imageElement);
  } else {
    renderMediaFallback(media, story);
  }

  const body = document.createElement("div");
  body.className = "story-body";

  const kicker = document.createElement("div");
  kicker.className = "story-kicker";

  const urgency = document.createElement("span");
  urgency.className = `pill ${String(story.urgency || "").toLowerCase()}`;
  urgency.textContent = story.urgency || "Update";

  const region = document.createElement("span");
  region.textContent = story.region || "World";

  const topic = document.createElement("span");
  topic.textContent = story.topic || "News";

  const title = document.createElement("h3");
  title.textContent = story.headline;

  const summary = document.createElement("p");
  summary.textContent = storySummary(story);

  const footer = document.createElement("div");
  footer.className = "story-footer";

  const meta = document.createElement("span");
  meta.textContent = `Published ${formatTime(story.published_at)} | Impact ${story.impact || "?"}`;

  const link = document.createElement("a");
  link.href = sourceUrl(story);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = `Read at ${sourceName(story)}`;

  kicker.append(urgency, region, topic);
  footer.append(meta, link);
  body.append(kicker, title, summary, footer);
  article.append(media, body);

  return article;
}

function renderStories(stories) {
  elements.storyGrid.innerHTML = "";

  if (!stories.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No stories match this view.";
    elements.storyGrid.append(empty);
    return;
  }

  stories.slice(0, 18).forEach((story, index) => {
    elements.storyGrid.append(storyCard(story, index));
  });
}

function renderSources() {
  const sources = uniqueValues(allStories().flatMap((story) => story.sources?.map((source) => source.name) || []));
  elements.sourceCloud.innerHTML = "";
  sources.forEach((source) => {
    const item = document.createElement("span");
    item.textContent = source;
    elements.sourceCloud.append(item);
  });
}

function render() {
  const stories = visibleStories();
  renderControls();
  renderLead(stories);
  renderTicker();
  renderStats(stories);
  renderDesk();
  renderStories(stories);
  renderSources();
}

async function loadFeed() {
  try {
    const response = await fetch(`${FEED_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);

    state.feed = await response.json();
    if (!state.feed.languages?.some((language) => language.code === state.language)) {
      state.language = state.feed.languages?.[0]?.code || "en";
    }
    render();
  } catch (error) {
    console.warn(error);
    elements.feedStatus.textContent = "Feed unavailable";
    elements.leadTitle.textContent = "The live feed could not be loaded.";
    elements.leadSummary.textContent = "Check that data/news.json is deployed with the website.";
    elements.storyGrid.innerHTML = '<div class="empty-state">Waiting for the public feed.</div>';
  }
}

elements.storySearch.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

loadFeed();
window.setInterval(loadFeed, REFRESH_MS);
