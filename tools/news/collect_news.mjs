import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputDirectory = path.resolve(
  root,
  process.env.NEWS_OUTPUT_DIR ?? 'cdx_time_map/catalog',
);
const sourcePath = path.resolve(root, 'tools/news/news_sources.json');
const catalogPath = path.join(outputDirectory, 'news_events.json');
const manifestPath = path.join(outputDirectory, 'news_events_manifest.json');
const catalogUrl =
  'https://orion8.github.io/cdx_time_map/catalog/news_events.json';
const maximumArticleAgeDays = Number(process.env.NEWS_MAX_AGE_DAYS ?? 21);
const retentionDays = Number(process.env.NEWS_RETENTION_DAYS ?? 30);
const maximumArticlesPerPublisher = Number(
  process.env.NEWS_MAX_ARTICLES_PER_PUBLISHER ?? 3,
);
const dryRun = process.env.NEWS_DRY_RUN === '1';

const allowedTopicIds = new Set([
  'computerHistory', 'mathHistory', 'semiconductor', 'internetWeb',
  'spaceDevelopment', 'medicineHealth', 'physicsChemistry', 'lifeScience',
  'climateEnvironment', 'artsFilm', 'sportsHistory', 'koreaEastAsia',
  'economyFinance', 'politicsHumanRights', 'aiHistory', 'civilizations',
  'mesopotamia', 'islamicGoldenAge', 'ancientEgypt', 'yellowRiver',
  'grecoRoman', 'indusCivilization', 'persianCivilization',
  'mayaCivilization', 'andeanCivilizations', 'extinctLife',
  'easternPhilosophy', 'westernPhilosophy', 'religions', 'agriculture',
  'urbanDevelopment', 'weapons',
]);
const allowedCategories = new Set([
  'politicsSociety', 'economyBusiness', 'scienceTechnology', 'globalHealth',
  'climateDisaster', 'cultureEntertainment', 'urbanDevelopment', 'sports',
  'space',
]);

async function main() {
  const sources = await readJson(sourcePath);
  const existingCatalog = await readJsonOr(
    catalogPath,
    emptyCatalog(),
  );
  validateCatalog(existingCatalog);
  const existingEvents = existingCatalog.events;
  const alreadyPublishedUrls = new Set(
    existingEvents.flatMap((event) => event.news?.sourceUrls ?? [event.sourceUrl]),
  );

  const articles = await collectArticles(sources.sources ?? []);
  const candidates = articles.filter((article) => !alreadyPublishedUrls.has(article.url));
  if (candidates.length === 0) {
    console.log('No new RSS articles to evaluate.');
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is missing. Add it as a GitHub Actions repository secret before publishing news.',
    );
  }

  const triage = await triageWithOpenAI(candidates);
  const selectedCandidates = [...new Set(triage.articleIndexes)]
    .map((index) => candidates[index])
    .filter(Boolean);
  if (selectedCandidates.length === 0) {
    console.log('Nano triage found no timeline-worthy news events.');
    return;
  }
  console.log(
    `Nano triage selected ${selectedCandidates.length}/${candidates.length} article(s) for editing.`,
  );

  const draft = await organizeWithOpenAI({
    candidates: selectedCandidates,
    existingEvents,
  });
  const nextEvents = mergeEvents({
    existingEvents,
    candidates: selectedCandidates,
    draftEvents: draft.events,
  });
  const now = new Date();
  const prunedEvents = nextEvents.filter((event) =>
    Date.parse(event.startAt) >= now.getTime() - retentionDays * 86400000,
  );
  const nextCatalog = {
    catalogVersion: existingCatalog.catalogVersion,
    updatedAt: existingCatalog.updatedAt,
    sourceType: 'editorial',
    events: prunedEvents.sort((left, right) =>
      Date.parse(right.startAt) - Date.parse(left.startAt),
    ),
  };
  const changed = JSON.stringify(nextCatalog.events) !== JSON.stringify(existingEvents);
  if (!changed) {
    console.log('AI produced no publishable news changes.');
    return;
  }

  nextCatalog.catalogVersion = nextPatch(existingCatalog.catalogVersion);
  nextCatalog.updatedAt = now.toISOString();
  validateCatalog(nextCatalog);
  const manifest = {
    revision: nextCatalog.catalogVersion,
    publishedAt: nextCatalog.updatedAt,
    catalogUrl,
  };
  if (dryRun) {
    console.log(`Dry run: would publish ${nextCatalog.events.length} news events.`);
    return;
  }
  await mkdir(outputDirectory, {recursive: true});
  await writeJson(catalogPath, nextCatalog);
  await writeJson(manifestPath, manifest);
  console.log(
    `Published news catalog ${nextCatalog.catalogVersion} with ${nextCatalog.events.length} events.`,
  );
}

async function collectArticles(sources) {
  const cutoff = Date.now() - maximumArticleAgeDays * 86400000;
  const seenUrls = new Set();
  const results = [];
  for (const source of sources) {
    try {
      validateSource(source);
      const response = await fetch(source.feedUrl, {
        headers: {Accept: 'application/rss+xml, application/xml, text/xml'},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      const parsed = parseRss(xml, source)
        .filter((article) => Date.parse(article.publishedAt) >= cutoff)
        .slice(0, source.maxItems ?? 10);
      for (const article of parsed) {
        if (seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);
        results.push(article);
      }
      console.log(`${source.name}: ${parsed.length} recent article(s).`);
    } catch (error) {
      console.warn(`${source?.name ?? 'Unknown source'} skipped: ${error.message}`);
    }
  }
  const newestFirst = results.sort((left, right) =>
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
  );
  const diversified = limitArticlesPerPublisher(newestFirst);
  console.log(
    `Candidate pool: ${newestFirst.length} RSS article(s); ${diversified.length} after the ${maximumArticlesPerPublisher}-per-publisher limit.`,
  );
  return diversified;
}

function parseRss(xml, source) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item) => {
    const title = textTag(item, 'title');
    const url = textTag(item, 'link');
    const publishedAt = parseDate(textTag(item, 'pubDate') ?? textTag(item, 'dc:date'));
    const excerpt = textTag(item, 'description') ?? textTag(item, 'content:encoded') ?? '';
    if (!title || !url || !publishedAt || !isHttpsUrl(url)) return null;
    return {
      sourceId: source.id,
      sourceName: source.name,
      publisherId: source.publisherId ?? source.id,
      url,
      title: truncate(title, 260),
      excerpt: truncate(excerpt, 900),
      publishedAt,
      topicIds: source.topicIds,
      defaultCategory: source.defaultCategory,
    };
  }).filter(Boolean);
}

function limitArticlesPerPublisher(articles) {
  if (!Number.isInteger(maximumArticlesPerPublisher) || maximumArticlesPerPublisher < 1) {
    throw new Error('NEWS_MAX_ARTICLES_PER_PUBLISHER must be a positive integer.');
  }
  const counts = new Map();
  const limited = [];
  for (const article of articles) {
    const count = counts.get(article.publisherId) ?? 0;
    if (count >= maximumArticlesPerPublisher) continue;
    counts.set(article.publisherId, count + 1);
    limited.push(article);
  }
  return limited;
}

function textTag(xml, tag) {
  const match = xml.match(new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'i'));
  return match ? cleanText(match[1]) : null;
}

function cleanText(value) {
  return decodeEntities(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function triageWithOpenAI(candidates) {
  const draft = await requestStructuredOutput({
    model: process.env.OPENAI_TRIAGE_MODEL ?? 'gpt-5-nano',
    name: 'time_map_news_triage',
    developerInstructions: [
      'You are the low-cost first-pass editor for a timeline app.',
      'Select only supplied RSS articles that may represent a durable, broadly meaningful event.',
      'Reject routine product announcements, opinion posts, recaps, and duplicate updates.',
      'Evaluate every supplied field fairly; do not favor AI or technology over society, economy, science, culture, health, climate, or space.',
      'When uncertain, include an article so a stronger editor can decide; never invent facts.',
    ].join(' '),
    userPayload: {
      candidateArticles: candidates.map((article, index) => ({index, ...article})),
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['articleIndexes'],
      properties: {
        articleIndexes: {
          type: 'array',
          maxItems: 16,
          items: {type: 'integer'},
        },
      },
    },
  });
  if (!Array.isArray(draft.articleIndexes) ||
      draft.articleIndexes.some((index) => !Number.isInteger(index) || !candidates[index])) {
    throw new Error('Nano triage returned invalid article indexes.');
  }
  return draft;
}

async function organizeWithOpenAI({candidates, existingEvents}) {
  const draft = await requestStructuredOutput({
    model: process.env.OPENAI_EDITOR_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-5-mini',
    name: 'time_map_news_events',
    developerInstructions: [
      'You are a careful news editor for a timeline app.',
      'Use only the supplied RSS articles as factual evidence.',
      'Return only events of broad, durable importance; omit product marketing and routine posts.',
      'Retain meaningful events across society, economy, science, culture, health, climate, space, and AI rather than concentrating on one field.',
      'Cluster duplicate coverage into one event. Use Korean title and description while preserving proper names.',
      'Use a supplied source index for every event. Do not invent URLs, dates, sources, facts, or tags.',
      'Choose an existingEventId only when a candidate is a genuine update to that existing event.',
    ].join(' '),
    userPayload: {
      candidateArticles: candidates.map((article, index) => ({index, ...article})),
      existingEvents: existingEvents.map((event) => ({
        id: event.id,
        title: event.title,
        startAt: event.startAt,
        description: event.description,
        topicIds: event.topicIds,
      })),
    },
    schema: eventSchema,
  });
  if (!draft || !Array.isArray(draft.events)) {
    throw new Error('OpenAI response does not match the event schema.');
  }
  return draft;
}

const eventSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title', 'description', 'startAt', 'category', 'importance',
          'topicIds', 'sourceIndexes', 'existingEventId', 'newsStatus',
        ],
        properties: {
          title: {type: 'string'},
          description: {type: 'string'},
          startAt: {type: 'string'},
          category: {type: 'string', enum: [...allowedCategories]},
          importance: {type: 'integer', enum: [1, 2, 3]},
          topicIds: {
            type: 'array',
            items: {type: 'string', enum: [...allowedTopicIds]},
          },
          sourceIndexes: {type: 'array', minItems: 1, items: {type: 'integer'}},
          existingEventId: {type: 'string'},
          newsStatus: {type: 'string', enum: ['breaking', 'developing', 'resolved']},
        },
      },
    },
  },
};

async function requestStructuredOutput({
  model,
  name,
  developerInstructions,
  userPayload,
  schema,
}) {
  const requestBody = {
    model,
    input: [
      {
        role: 'developer',
        content: developerInstructions,
      },
      {
        role: 'user',
        content: JSON.stringify(userPayload),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name,
        strict: true,
        schema,
      },
    },
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`OpenAI request failed: ${payload.error?.message ?? response.status}`);
  const outputText = responseOutputText(payload);
  if (outputText == null) {
    throw new Error(
      `OpenAI response did not include structured output text (status: ${payload.status ?? 'unknown'}).`,
    );
  }
  return JSON.parse(outputText);
}

function responseOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }
  return null;
}

function mergeEvents({existingEvents, candidates, draftEvents}) {
  const eventsById = new Map(existingEvents.map((event) => [event.id, event]));
  for (const draft of draftEvents) {
    validateDraft(draft, candidates, eventsById);
    const sources = [...new Set(draft.sourceIndexes)].map((index) => candidates[index]);
    const sourceUrls = sources.map((source) => source.url);
    const previous = draft.existingEventId ? eventsById.get(draft.existingEventId) : null;
    const combinedUrls = [...new Set([...(previous?.news?.sourceUrls ?? []), ...sourceUrls])];
    const event = {
      ...(previous ?? {}),
      id: previous?.id ?? stableId(combinedUrls),
      title: truncate(draft.title.trim(), 120),
      startAt: new Date(draft.startAt).toISOString(),
      lane: 'world',
      category: draft.category,
      importance: draft.importance,
      description: truncate(draft.description.trim(), 420),
      sourceName: sources[0].sourceName,
      sourceUrl: sources[0].url,
      topicIds: [...new Set([...(previous?.topicIds ?? []), ...draft.topicIds])],
      news: {
        status: draft.newsStatus,
        sourceUrls: combinedUrls,
        firstPublishedAt: previous?.news?.firstPublishedAt ?? sources[0].publishedAt,
        lastObservedAt: new Date().toISOString(),
      },
    };
    eventsById.set(event.id, event);
  }
  return [...eventsById.values()];
}

function validateDraft(draft, candidates, existingEvents) {
  if (!draft || typeof draft !== 'object') {
    throw new Error('AI produced a non-object news event draft.');
  }
  const invalidFields = [];
  if (typeof draft.title !== 'string' || !draft.title.trim()) invalidFields.push('title');
  if (typeof draft.description !== 'string' || !draft.description.trim()) invalidFields.push('description');
  if (!Number.isFinite(Date.parse(draft.startAt))) invalidFields.push('startAt');
  if (!allowedCategories.has(draft.category)) invalidFields.push('category');
  if (!Number.isInteger(draft.importance) || draft.importance < 1 || draft.importance > 3) {
    invalidFields.push('importance');
  }
  if (!Array.isArray(draft.topicIds) || draft.topicIds.length === 0 ||
      draft.topicIds.some((topic) => !allowedTopicIds.has(topic))) {
    invalidFields.push('topicIds');
  }
  if (!Array.isArray(draft.sourceIndexes) || draft.sourceIndexes.length === 0 ||
      draft.sourceIndexes.some((index) => !Number.isInteger(index) || !candidates[index])) {
    invalidFields.push('sourceIndexes');
  }
  if (typeof draft.existingEventId !== 'string' ||
      (draft.existingEventId && !existingEvents.has(draft.existingEventId))) {
    invalidFields.push('existingEventId');
  }
  if (!['breaking', 'developing', 'resolved'].includes(draft.newsStatus)) {
    invalidFields.push('newsStatus');
  }
  if (invalidFields.length > 0) {
    throw new Error(`AI produced an invalid news event draft: ${invalidFields.join(', ')}.`);
  }
}

function validateCatalog(catalog) {
  if (!catalog || !/^\d+\.\d+\.\d+$/.test(catalog.catalogVersion) ||
      !Number.isFinite(Date.parse(catalog.updatedAt)) ||
      catalog.sourceType !== 'editorial' || !Array.isArray(catalog.events)) {
    throw new Error('News catalog metadata is invalid.');
  }
  const ids = new Set();
  for (const event of catalog.events) {
    if (!event || !/^news-[a-f0-9]{24}$/.test(event.id) || ids.has(event.id) ||
        typeof event.title !== 'string' || !event.title ||
        !Number.isFinite(Date.parse(event.startAt)) || event.lane !== 'world' ||
        !allowedCategories.has(event.category) || !Number.isInteger(event.importance) ||
        event.importance < 1 || event.importance > 3 ||
        typeof event.sourceName !== 'string' || !event.sourceName ||
        !isHttpsUrl(event.sourceUrl) || !Array.isArray(event.topicIds) ||
        event.topicIds.length === 0 || event.topicIds.some((topic) => !allowedTopicIds.has(topic)) ||
        !event.news || !Array.isArray(event.news.sourceUrls) ||
        event.news.sourceUrls.length === 0 || event.news.sourceUrls.some((url) => !isHttpsUrl(url))) {
      throw new Error(`News catalog event is invalid: ${event?.id ?? '<unknown>'}`);
    }
    ids.add(event.id);
  }
}

function validateSource(source) {
  if (!source || typeof source.id !== 'string' || typeof source.name !== 'string' ||
      !isHttpsUrl(source.feedUrl) || !Array.isArray(source.topicIds) ||
      source.topicIds.length === 0 || source.topicIds.some((topic) => !allowedTopicIds.has(topic)) ||
      !allowedCategories.has(source.defaultCategory) ||
      (source.publisherId != null && (typeof source.publisherId !== 'string' || !source.publisherId)) ||
      (source.maxItems != null && (!Number.isInteger(source.maxItems) || source.maxItems < 1))) {
    throw new Error('Source configuration is invalid.');
  }
}

function emptyCatalog() {
  return {
    catalogVersion: '0.0.0',
    updatedAt: '1970-01-01T00:00:00.000Z',
    sourceType: 'editorial',
    events: [],
  };
}

function nextPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function stableId(urls) {
  return `news-${createHash('sha256').update([...urls].sort().join('\n')).digest('hex').slice(0, 24)}`;
}

function parseDate(value) {
  const milliseconds = Date.parse(value ?? '');
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function truncate(value, length) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function escapeRegExp(value) {
  return value.split('').map((character) =>
    '\\.^$*+?()[]{}|/'.includes(character) ? `\\${character}` : character,
  ).join('');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readJsonOr(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
