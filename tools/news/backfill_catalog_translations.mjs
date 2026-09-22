import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputDirectory = path.resolve(
  root,
  process.env.TRANSLATION_OUTPUT_DIR ?? 'translation_output',
);
const historyCatalogUrl = process.env.HISTORY_CATALOG_URL ??
  'https://raw.githubusercontent.com/Orion8/cdx_time_map/main/assets/data/world_events.json';
const newsCatalogPath = path.resolve(
  root,
  process.env.NEWS_CATALOG_PATH ?? 'cdx_time_map/catalog/news_events.json',
);
const model = process.env.OPENAI_TRANSLATION_MODEL ?? 'gpt-5-mini';
const batchSize = Number(process.env.TRANSLATION_BATCH_SIZE ?? 20);

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required.');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 40) {
    throw new Error('TRANSLATION_BATCH_SIZE must be an integer from 1 to 40.');
  }

  const [historyCatalog, newsCatalog] = await Promise.all([
    fetchJson(historyCatalogUrl),
    readJson(newsCatalogPath),
  ]);
  validateCatalogShape(historyCatalog, 'history');
  validateCatalogShape(newsCatalog, 'news');

  const historyChanged = await addEnglishTranslations(
    historyCatalog.events,
    'historical timeline',
  );
  const newsChanged = await addEnglishTranslations(
    newsCatalog.events,
    'current news timeline',
  );
  const now = new Date().toISOString();

  if (historyChanged) {
    historyCatalog.catalogVersion = nextMinor(historyCatalog.catalogVersion);
    historyCatalog.updatedAt = now;
  }
  if (newsChanged) {
    newsCatalog.catalogVersion = nextPatch(newsCatalog.catalogVersion);
    newsCatalog.updatedAt = now;
  }

  assertComplete(historyCatalog.events, 'history');
  assertComplete(newsCatalog.events, 'news');
  await mkdir(outputDirectory, {recursive: true});
  await Promise.all([
    writeJson(path.join(outputDirectory, 'world_events.json'), historyCatalog),
    writeJson(path.join(outputDirectory, 'world_events_manifest.json'), {
      revision: historyCatalog.catalogVersion,
      publishedAt: historyCatalog.updatedAt,
      catalogUrl: 'https://orion8.github.io/cdx_time_map/assets/assets/data/world_events.json',
    }),
    writeJson(path.join(outputDirectory, 'news_events.json'), newsCatalog),
    writeJson(path.join(outputDirectory, 'news_events_manifest.json'), {
      revision: newsCatalog.catalogVersion,
      publishedAt: newsCatalog.updatedAt,
      catalogUrl: 'https://orion8.github.io/cdx_time_map/catalog/news_events.json',
    }),
  ]);
  console.log(
    `Translation output ready: ${historyCatalog.events.length} history events and ${newsCatalog.events.length} news events.`,
  );
}

async function addEnglishTranslations(events, context) {
  const missing = events.filter((event) =>
    !localizedValue(event.titleTranslations, 'en') ||
    !localizedValue(event.descriptionTranslations, 'en'),
  );
  if (missing.length === 0) {
    console.log(`${context}: all events already include English.`);
    return false;
  }
  console.log(`${context}: translating ${missing.length} event(s).`);
  for (let offset = 0; offset < missing.length; offset += batchSize) {
    const batch = missing.slice(offset, offset + batchSize);
    const translations = await translateBatch(batch, context);
    const byId = new Map(translations.map((translation) => [translation.id, translation]));
    for (const event of batch) {
      const translation = byId.get(event.id);
      if (!translation) throw new Error(`Missing translation for ${event.id}.`);
      event.titleTranslations = {
        ...(event.titleTranslations ?? {}),
        en: translation.titleEn.trim(),
      };
      event.descriptionTranslations = {
        ...(event.descriptionTranslations ?? {}),
        en: translation.descriptionEn.trim(),
      };
    }
    console.log(`${context}: translated ${Math.min(offset + batch.length, missing.length)}/${missing.length}.`);
  }
  return true;
}

async function translateBatch(events, context) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['translations'],
    properties: {
      translations: {
        type: 'array',
        minItems: events.length,
        maxItems: events.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'titleEn', 'descriptionEn'],
          properties: {
            id: {type: 'string', enum: events.map((event) => event.id)},
            titleEn: {type: 'string'},
            descriptionEn: {type: 'string'},
          },
        },
      },
    },
  };
  const result = await requestStructuredOutput({
    name: 'time_map_catalog_translation',
    schema,
    input: {
      context,
      events: events.map((event) => ({
        id: event.id,
        titleKo: event.title,
        descriptionKo: event.description ?? '',
        sourceName: event.sourceName ?? '',
      })),
    },
  });
  const translations = result.translations;
  const ids = new Set(translations.map((translation) => translation.id));
  if (ids.size !== events.length ||
      translations.some((translation) =>
        typeof translation.titleEn !== 'string' || !translation.titleEn.trim() ||
        typeof translation.descriptionEn !== 'string' || !translation.descriptionEn.trim())) {
    throw new Error(`Invalid or duplicate translations returned for ${context}.`);
  }
  return translations;
}

async function requestStructuredOutput({name, schema, input}) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'developer',
          content: [
            'Translate the supplied Korean timeline event titles and descriptions into concise, natural English.',
            'Preserve dates, quantities, proper names, uncertainty, and factual meaning exactly.',
            'Do not add, omit, reinterpret, or update facts. Translate every supplied event exactly once.',
            'Use established English names for scientific terms, institutions, people, places, and historical events.',
          ].join(' '),
        },
        {role: 'user', content: JSON.stringify(input)},
      ],
      text: {
        format: {type: 'json_schema', name, strict: true, schema},
      },
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${payload.error?.message ?? response.status}`);
  }
  const outputText = responseOutputText(payload);
  if (!outputText) throw new Error('OpenAI response did not include output text.');
  return JSON.parse(outputText);
}

function responseOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }
  return null;
}

function assertComplete(events, label) {
  for (const event of events) {
    if (!localizedValue(event.titleTranslations, 'en') ||
        !localizedValue(event.descriptionTranslations, 'en')) {
      throw new Error(`${label} event ${event.id} is missing English content.`);
    }
  }
}

function localizedValue(value, languageCode) {
  const candidate = value?.[languageCode];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function validateCatalogShape(catalog, label) {
  if (!catalog || typeof catalog.catalogVersion !== 'string' ||
      !Array.isArray(catalog.events)) {
    throw new Error(`${label} catalog metadata is invalid.`);
  }
  const ids = new Set(catalog.events.map((event) => event?.id));
  if (ids.size !== catalog.events.length || ids.has(undefined)) {
    throw new Error(`${label} catalog contains invalid or duplicate IDs.`);
  }
}

function nextPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function nextMinor(version) {
  const [major, minor] = version.split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

async function fetchJson(url) {
  const response = await fetch(url, {headers: {Accept: 'application/json'}});
  if (!response.ok) throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
  return response.json();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
