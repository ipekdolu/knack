import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { words, type levelEnum } from "../src/db/schema.ts";

config({ path: ".env.local", quiet: true });

const REPO = "ilkermeliksitki/goethe-institute-wordlist";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
type Level = "A1" | "A2" | "B1";
const LEVELS: Level[] = ["A1", "A2", "B1"];

type Gender = "der" | "die" | "das" | null;
type ParsedEntry = { lemma: string; gender: Gender };

const POS_VALUES = [
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "numeral",
  "interjection",
  "particle",
  "noun",
] as const;
type Pos = (typeof POS_VALUES)[number];

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

async function fetchLevelLines(level: Level): Promise<string[]> {
  const lower = level.toLowerCase();
  if (level === "A1") {
    const text = await fetchText(`${RAW_BASE}/a1/a1.tsv`);
    return text ? text.split("\n") : [];
  }
  const lines: string[] = [];
  for (const letter of ALPHABET) {
    const text = await fetchText(`${RAW_BASE}/${lower}/${letter}.tsv`);
    if (!text) continue;
    lines.push(...text.split("\n"));
  }
  return lines;
}

function parseEntry(rawWord: string): ParsedEntry {
  const stripped = rawWord.replace(/\(\d+\)\s*$/, "").trim();

  // Meta-entry for the article itself, not a real vocabulary word.
  if (stripped.toLowerCase() === "der, die, das") {
    return { lemma: "", gender: null };
  }

  const articleMatch = stripped.match(/^(der|die|das)\s+(.+)$/);
  if (articleMatch) {
    const gender = articleMatch[1] as Gender;
    const lemma = articleMatch[2].split(",")[0].trim();
    return { lemma, gender };
  }

  let s = stripped;
  s = s.replace(/^\(sich\)\s*/i, "sich "); // "(sich) freuen" -> "sich freuen"
  s = s.replace(/\s*\(pl\.\)\s*$/i, ""); // "Eltern (pl.)" -> "Eltern"

  // Dual-gender adjectival nouns: "der/die Bekannte" -> "Bekannte" (gender left
  // unset rather than picking one; Claude classifies it as a noun without it).
  const dualArticleMatch = s.match(/^(der|die)\/(der|die)\s+(.+)$/i);
  if (dualArticleMatch) {
    s = dualArticleMatch[3].trim();
  } else {
    s = s.split("/")[0].trim(); // "zum Beispiel/z. B." -> "zum Beispiel"
  }

  s = s.split(",")[0].trim(); // "dort, -her, -hin" -> "dort"
  s = s.replace(/-$/, "").trim();

  return { lemma: s, gender: null };
}

async function collectLevel(
  level: Level,
  seenLemmas: Set<string>,
): Promise<ParsedEntry[]> {
  const lines = await fetchLevelLines(level);
  const seenThisLevel = new Set<string>();
  const entries: ParsedEntry[] = [];

  for (const line of lines) {
    const fields = line.split("\t");
    if (fields.length < 2) continue;
    const [rawWord] = fields;
    if (rawWord.trim().toLowerCase() === "german word") continue; // header row

    const { lemma, gender } = parseEntry(rawWord);
    if (!lemma) continue;
    const key = lemma.toLowerCase();

    if (seenThisLevel.has(key) || seenLemmas.has(key)) continue;
    seenThisLevel.add(key);
    entries.push({ lemma, gender });
  }

  for (const key of seenThisLevel) seenLemmas.add(key);
  return entries;
}

async function classifyPos(
  client: Anthropic,
  lemmas: string[],
): Promise<Map<string, Pos>> {
  const result = new Map<string, Pos>();
  const batchSize = 75;

  for (let i = 0; i < lemmas.length; i += batchSize) {
    const batch = lemmas.slice(i, i + batchSize);
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system:
        "You classify German dictionary headwords (lemmas) from Goethe-Institut A1-B1 wordlists by part of speech.",
      messages: [
        {
          role: "user",
          content: `Classify each German word below by part of speech. Return your answer by calling the classify_words tool exactly once, with one entry per input word, preserving the exact lemma spelling given.\n\nWords:\n${batch.join("\n")}`,
        },
      ],
      tools: [
        {
          name: "classify_words",
          description: "Record part-of-speech classifications for a list of German words.",
          input_schema: {
            type: "object",
            properties: {
              classifications: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    lemma: { type: "string" },
                    pos: { type: "string", enum: POS_VALUES as unknown as string[] },
                  },
                  required: ["lemma", "pos"],
                },
              },
            },
            required: ["classifications"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "classify_words" },
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      console.warn(`Batch ${i}-${i + batch.length}: no tool_use in response, skipping`);
      continue;
    }
    const input = toolUse.input as { classifications: { lemma: string; pos: string }[] };
    for (const { lemma, pos } of input.classifications) {
      if ((POS_VALUES as readonly string[]).includes(pos)) {
        result.set(lemma.toLowerCase(), pos as Pos);
      }
    }
    console.log(`Classified batch ${i}-${i + batch.length} (${lemmas.length} total)`);
  }

  return result;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require" });
  const db = drizzle(sql);
  const anthropic = new Anthropic();

  const seenLemmas = new Set<string>();
  const byLevel: Record<Level, ParsedEntry[]> = { A1: [], A2: [], B1: [] };

  for (const level of LEVELS) {
    const entries = await collectLevel(level, seenLemmas);
    byLevel[level] = entries;
    console.log(`${level}: ${entries.length} unique lemmas after dedup`);
  }

  const needsPos = LEVELS.flatMap((level) =>
    byLevel[level].filter((e) => e.gender === null).map((e) => e.lemma),
  );
  console.log(`${needsPos.length} lemmas need POS classification via Claude`);

  const posMap = dryRun
    ? new Map<string, Pos>()
    : await classifyPos(anthropic, needsPos);

  type Row = {
    lemma: string;
    level: Level;
    pos: string;
    gender: Gender;
    source: "seed";
  };
  const rows: Row[] = [];
  for (const level of LEVELS) {
    for (const entry of byLevel[level]) {
      const pos = entry.gender
        ? "noun"
        : posMap.get(entry.lemma.toLowerCase()) ?? "other";
      rows.push({
        lemma: entry.lemma,
        level,
        pos,
        gender: entry.gender,
        source: "seed",
      });
    }
  }

  console.log(`\nTotal parsed rows: ${rows.length}`);
  console.log("Sample:", rows.slice(0, 5));

  if (dryRun) {
    console.log("\n--dry-run: skipping DB insert");
    await sql.end();
    return;
  }

  const existing = await db
    .select({ lemma: words.lemma, level: words.level })
    .from(words)
    .where(eq(words.source, "seed"));
  const existingKeys = new Set(
    existing.map((r) => `${r.level}|${r.lemma.toLowerCase()}`),
  );

  const newRows = rows.filter(
    (r) => !existingKeys.has(`${r.level}|${r.lemma.toLowerCase()}`),
  );
  console.log(`${newRows.length} new rows to insert (${rows.length - newRows.length} already seeded)`);

  const chunkSize = 500;
  for (let i = 0; i < newRows.length; i += chunkSize) {
    const chunk = newRows.slice(i, i + chunkSize);
    await db.insert(words).values(
      chunk.map((r) => ({
        lemma: r.lemma,
        level: r.level as (typeof levelEnum.enumValues)[number],
        pos: r.pos,
        gender: r.gender ?? undefined,
        source: "seed" as const,
      })),
    );
    console.log(`Inserted ${Math.min(i + chunkSize, newRows.length)}/${newRows.length}`);
  }

  await sql.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
