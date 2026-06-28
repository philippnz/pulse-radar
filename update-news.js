const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCES_PATH = path.join(ROOT, "data", "sources.json");
const NEWS_PATH = path.join(ROOT, "data", "news.json");

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Espa\u00f1ol" },
  { code: "fr", label: "Fran\u00e7ais" },
];

const TOPIC_KEYWORDS = [
  ["Security", ["war", "strike", "missile", "ceasefire", "military", "attack", "hostage", "conflict", "defense", "defence"]],
  ["Politics", ["election", "primary", "primaries", "democrat", "president", "minister", "parliament", "government", "summit", "diplomatic", "policy", "sanction"]],
  ["Markets", ["market", "stocks", "shares", "central bank", "inflation", "rates", "currency", "oil", "bond", "trade"]],
  ["Technology", ["chip", "ai", "technology", "cyber", "semiconductor", "software", "data"]],
  ["Climate", ["climate", "storm", "flood", "heat", "wildfire", "earthquake", "weather", "emissions"]],
  ["Health", ["health", "virus", "disease", "hospital", "vaccine", "outbreak"]],
  ["Sports", ["world cup", "football", "soccer", "tennis", "olympic"]],
  ["Society", ["migration", "protest", "rights", "education", "court", "police", "trial"]],
];

const REGION_KEYWORDS = [
  ["Europe", ["europe", "eu ", "ukraine", "russia", "germany", "france", "britain", "uk ", "poland", "spain", "italy", "switzerland"]],
  ["Middle East", ["middle east", "mideast", "israel", "gaza", "iran", "iranian", "syria", "lebanon", "saudi", "yemen", "qatar"]],
  ["Africa", ["africa", "sudan", "sudanese", "ethiopia", "kenya", "nigeria", "congo", "south africa"]],
  ["Asia-Pacific", ["china", "japan", "korea", "taiwan", "india", "pakistan", "australia", "asia", "philippines", "indonesia", "myanmar"]],
  ["Americas", ["america", "us", "u.s.", "united states", "canada", "canadian", "montreal", "new york", "mexico", "brazil", "argentina", "washington"]],
];

const URGENT_KEYWORDS = [
  "breaking",
  "attack",
  "strike",
  "explosion",
  "dead",
  "killed",
  "war",
  "ceasefire",
  "emergency",
  "evacuate",
  "crisis",
];

const TOPIC_LABELS = {
  Security: { en: "security", de: "Sicherheits", es: "seguridad", fr: "securite" },
  Politics: { en: "politics", de: "Politik", es: "politica", fr: "politique" },
  Markets: { en: "markets", de: "Markt", es: "mercados", fr: "marches" },
  Technology: { en: "technology", de: "Technologie", es: "tecnologia", fr: "technologie" },
  Climate: { en: "climate", de: "Klima", es: "clima", fr: "climat" },
  Health: { en: "health", de: "Gesundheits", es: "salud", fr: "sante" },
  Sports: { en: "sports", de: "Sport", es: "deportes", fr: "sport" },
  Society: { en: "society", de: "Gesellschafts", es: "sociedad", fr: "societe" },
  World: { en: "world", de: "Welt", es: "mundo", fr: "monde" },
};

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(value = "") {
  return decodeEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getTagRaw(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(match[1]).trim() : "";
}

function getTag(block, tag) {
  return stripHtml(getTagRaw(block, tag));
}

function getLink(block) {
  const atomLink = block.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (atomLink) return decodeEntities(atomLink[1]).trim();

  return getTag(block, "link");
}

function tagAttributes(tag) {
  const attrs = {};
  tag.replace(/([\w:-]+)\s*=\s*["']([^"']*)["']/g, (_, key, value) => {
    attrs[key.toLowerCase()] = decodeEntities(value).trim();
    return "";
  });
  return attrs;
}

function normalizeImageUrl(value = "") {
  const url = decodeEntities(value).trim();
  const absolute = url.startsWith("//") ? `https:${url}` : url;
  if (/^https?:\/\//i.test(absolute)) return upgradeKnownImageUrl(absolute);
  return "";
}

function isLikelyImageUrl(url) {
  return /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(url);
}

function upgradeKnownImageUrl(url) {
  if (/ichef\.bbci\.co\.uk/i.test(url)) {
    return url.replace(/\/standard\/\d+\//i, "/standard/976/");
  }

  return url;
}

function imageCandidateScore(attrs, url) {
  const width = Number(attrs.width || attrs["media:width"] || 0);
  const height = Number(attrs.height || attrs["media:height"] || 0);
  const area = width && height ? width * height : width;
  const urlBoost = /large|super|jumbo|976|1024|1200|2048/i.test(url) ? 100000 : 0;
  return area + urlBoost;
}

function imageFromMediaTags(block) {
  const mediaTags = block.match(/<(media:content|media:thumbnail|enclosure)\b[^>]*>/gi) || [];
  const candidates = [];

  for (const tag of mediaTags) {
    const attrs = tagAttributes(tag);
    const url = normalizeImageUrl(attrs.url || attrs["rdf:resource"] || attrs.href);
    const type = `${attrs.type || ""} ${attrs.medium || ""}`;

    if (url && (/image/i.test(type) || !/enclosure/i.test(tag) || isLikelyImageUrl(url))) {
      candidates.push({ url, score: imageCandidateScore(attrs, url) });
    }
  }

  return candidates.sort((left, right) => right.score - left.score)[0]?.url || "";
}

function imageFromHtml(block) {
  const html = [
    getTagRaw(block, "content:encoded"),
    getTagRaw(block, "description"),
    getTagRaw(block, "summary"),
  ].join(" ");
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  return match ? normalizeImageUrl(match[1]) : "";
}

function getImage(block) {
  return imageFromMediaTags(block) || imageFromHtml(block);
}

function parseDate(value) {
  if (!value) return new Date().toISOString();
  const time = Date.parse(value);
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
}

function parseFeedItems(xml, source) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  return blocks
    .map((block) => {
      const title = getTag(block, "title");
      const link = getLink(block);
      const published = getTag(block, "pubDate") || getTag(block, "published") || getTag(block, "updated") || getTag(block, "dc:date");

      return {
        source,
        title,
        link,
        image: getImage(block),
        published_at: parseDate(published),
      };
    })
    .filter((item) => item.title && item.title.length >= 12 && item.link);
}

function normalizeText(value) {
  return stripHtml(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value) {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 70);
}

function hasKeyword(normalizedText, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;
  return normalizedText.includes(` ${normalizedKeyword} `);
}

function classifyTopic(title, fallback) {
  const normalized = ` ${normalizeText(title)} `;
  const match = TOPIC_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => hasKeyword(normalized, keyword)));
  return match ? match[0] : fallback || "World";
}

function classifyRegion(title, fallback) {
  const normalized = ` ${normalizeText(title)} `;
  const match = REGION_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => hasKeyword(normalized, keyword)));
  return match ? match[0] : fallback || "World";
}

function classifyUrgency(title, publishedAt) {
  const normalized = ` ${normalizeText(title)} `;
  const isUrgent = URGENT_KEYWORDS.some((keyword) => hasKeyword(normalized, keyword));
  if (isUrgent) return "Breaking";

  const ageHours = (Date.now() - new Date(publishedAt).getTime()) / 36e5;
  if (ageHours <= 3) return "Live";
  if (ageHours <= 18) return "Update";
  return "Developing";
}

function scoreItem(item, topic, urgency) {
  const ageHours = Math.max(0, (Date.now() - new Date(item.published_at).getTime()) / 36e5);
  const freshness = Math.max(0, 20 - ageHours);
  const urgencyBoost = urgency === "Breaking" ? 14 : urgency === "Live" ? 9 : urgency === "Update" ? 4 : 0;
  const topicBoost = ["Security", "Politics", "Markets"].includes(topic) ? 5 : 0;
  const topicPenalty = topic === "Sports" ? -12 : 0;
  return Math.min(99, Math.max(1, Math.round((item.source.weight * 0.58) + freshness + urgencyBoost + topicBoost + topicPenalty)));
}

function pulseSummary(story, language) {
  const sourceName = story.sources[0]?.name || "the original source";
  const topic = TOPIC_LABELS[story.topic]?.[language] || TOPIC_LABELS.World[language] || "world";
  const region = story.region || "World";
  const urgency = String(story.urgency || "update").toLowerCase();
  const impact = story.impact || "?";

  const templates = {
    en: `${region} ${topic} signal from ${sourceName}. PULSE marks it as ${urgency}, rates it ${impact}/100, and keeps the original report one click away.`,
    de: `${region}-${topic}-Signal von ${sourceName}. PULSE markiert es als ${urgency}, bewertet es mit ${impact}/100 und verlinkt zur Originalquelle.`,
    es: `Senal de ${topic} en ${region} desde ${sourceName}. PULSE la marca como ${urgency}, la valora en ${impact}/100 y enlaza la fuente original.`,
    fr: `Signal ${topic} pour ${region} par ${sourceName}. PULSE le classe ${urgency}, le note ${impact}/100 et renvoie vers la source originale.`,
  };

  return templates[language] || templates.en;
}

function storyFromItem(item) {
  const topic = classifyTopic(item.title, item.source.default_topic);
  const region = classifyRegion(item.title, item.source.default_region);
  const urgency = classifyUrgency(item.title, item.published_at);
  const hash = crypto.createHash("sha1").update(item.link || item.title).digest("hex").slice(0, 8);
  const headline = stripHtml(item.title).replace(/\s+-\s+[^-]+$/g, "").trim();

  const story = {
    id: `${slug(headline)}-${hash}`,
    region,
    topic,
    urgency,
    headline,
    published_at: item.published_at,
    image: item.image || "",
    image_alt: headline,
    translations: {},
    sources: [
      {
        name: item.source.name,
        url: item.link || item.source.homepage,
      },
    ],
    impact: 0,
  };

  story.impact = scoreItem(item, topic, urgency);
  for (const language of LANGUAGES) {
    story.translations[language.code] = pulseSummary(story, language.code);
  }

  return story;
}

function mergeDuplicates(stories) {
  const byKey = new Map();

  for (const story of stories) {
    const key = normalizeText(story.headline).split(" ").slice(0, 9).join(" ");
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, story);
      continue;
    }

    existing.impact = Math.min(99, Math.max(existing.impact, story.impact) + 3);
    existing.sources.push(...story.sources.filter((source) => !existing.sources.some((item) => item.url === source.url)));
    if (!existing.image && story.image) {
      existing.image = story.image;
      existing.image_alt = story.image_alt;
    }
    if (new Date(story.published_at) > new Date(existing.published_at)) {
      existing.published_at = story.published_at;
    }
  }

  return [...byKey.values()];
}

async function fetchSource(source, maxPerSource) {
  if (!source.enabled && source.enabled !== undefined) return [];

  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "PULSE-Radar/0.1 (+https://frolicking-boba-113bb5.netlify.app/)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`${source.name} returned ${response.status}`);
  }

  const xml = await response.text();
  return parseFeedItems(xml, source).slice(0, maxPerSource);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const maxPerSource = Number(argValue("max-per-source", "8"));
  const limit = Number(argValue("limit", "24"));
  const sourceConfig = JSON.parse(await fs.readFile(SOURCES_PATH, "utf8"));
  const feeds = sourceConfig.enabled_feeds || [];
  const fetched = [];

  for (const source of feeds) {
    try {
      const items = await fetchSource(source, maxPerSource);
      fetched.push(...items);
      console.log(`Fetched ${items.length} from ${source.name}`);
    } catch (error) {
      console.warn(`Skipped ${source.name}: ${error.message}`);
    }
  }

  const stories = mergeDuplicates(fetched.map(storyFromItem))
    .sort((a, b) => (b.impact - a.impact) || (new Date(b.published_at) - new Date(a.published_at)))
    .slice(0, limit);

  const feed = {
    updated_at: new Date().toISOString(),
    languages: LANGUAGES,
    stories,
  };

  if (dryRun) {
    console.log(JSON.stringify(feed, null, 2));
    return;
  }

  await fs.writeFile(NEWS_PATH, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  console.log(`Wrote ${stories.length} stories to ${path.relative(ROOT, NEWS_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
