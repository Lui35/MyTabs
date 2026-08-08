import Fuse, { type IFuseOptions } from "fuse.js";

import type { Collection, SavedTab, SearchDocument, Settings } from "@/lib/types";
import { getDomain } from "@/lib/url";

export interface SearchHit {
  doc: SearchDocument;
  score: number;
  /** Which field produced the strongest match, for result subtitles. */
  reason:
    | "title-exact"
    | "title-prefix"
    | "title"
    | "domain"
    | "url"
    | "collection"
    | "tag"
    | "description"
    | "fuzzy";
}

/**
 * Ranking tiers, best first. Fuse gives us a fuzzy distance; we bucket by
 * which field matched so an exact title always outranks a loose description
 * hit, no matter how good the fuzzy score is.
 */
const TIER: Record<SearchHit["reason"], number> = {
  "title-exact": 0,
  "title-prefix": 1,
  title: 2,
  domain: 3,
  url: 4,
  collection: 5,
  tag: 6,
  description: 7,
  // A hit no field can explain literally — real, but the weakest evidence
  // there is, so it must never outrank a collection or tag match.
  fuzzy: 8,
};

export function buildDocuments(
  collections: Record<string, Collection>,
  tabs: Record<string, SavedTab>,
): SearchDocument[] {
  const docs: SearchDocument[] = [];
  for (const tab of Object.values(tabs)) {
    docs.push({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      domain: getDomain(tab.url),
      collectionId: tab.collectionId,
      collectionName: collections[tab.collectionId]?.name ?? "",
      description: tab.description,
      tags: tab.tags,
      favicon: tab.favicon ?? tab.faviconUrl,
    });
  }
  return docs;
}

function fuseOptions(settings: Settings): IFuseOptions<SearchDocument> {
  const keys: { name: string; weight: number }[] = [
    { name: "title", weight: 0.45 },
    { name: "domain", weight: 0.2 },
    { name: "url", weight: 0.12 },
    { name: "collectionName", weight: 0.11 },
  ];
  if (settings.searchTags) keys.push({ name: "tags", weight: 0.07 });
  if (settings.searchDescriptions) {
    keys.push({ name: "description", weight: 0.05 });
  }

  return {
    keys,
    includeScore: true,
    includeMatches: true,
    // Loose enough that "eld map" finds "Elden Ring Map", tight enough that
    // it doesn't return the whole workspace.
    threshold: settings.fuzzySearch ? 0.4 : 0.0,
    ignoreLocation: true,
    minMatchCharLength: 1,
    useExtendedSearch: false,
    shouldSort: true,
  };
}

/**
 * Incremental search index.
 *
 * Fuse is rebuilt lazily and mutated in place for single-document changes, so
 * adding one tab to a 10k-item workspace doesn't re-tokenize everything.
 */
export class SearchIndex {
  private fuse: Fuse<SearchDocument>;
  private docs = new Map<string, SearchDocument>();
  private settings: Settings;

  constructor(documents: SearchDocument[], settings: Settings) {
    this.settings = settings;
    for (const doc of documents) this.docs.set(doc.id, doc);
    this.fuse = new Fuse(documents, fuseOptions(settings));
  }

  rebuild(documents: SearchDocument[], settings: Settings) {
    this.settings = settings;
    this.docs = new Map(documents.map((d) => [d.id, d]));
    this.fuse = new Fuse(documents, fuseOptions(settings));
  }

  upsert(doc: SearchDocument) {
    if (this.docs.has(doc.id)) this.fuse.remove((d) => d.id === doc.id);
    this.docs.set(doc.id, doc);
    this.fuse.add(doc);
  }

  remove(id: string) {
    if (!this.docs.has(id)) return;
    this.docs.delete(id);
    this.fuse.remove((d) => d.id === id);
  }

  get size() {
    return this.docs.size;
  }

  private phraseSearch(query: string, limit: number) {
    const out = new Map<string, { doc: SearchDocument; score: number }>();
    for (const r of this.fuse.search(query, { limit })) {
      if (!out.has(r.item.id)) {
        out.set(r.item.id, { doc: r.item, score: r.score ?? 1 });
      }
    }
    return out;
  }

  /**
   * Classic fuzzy-finder subsequence match: every character of the token
   * appears in order, not necessarily adjacently.
   *
   * Fuse's bitap can't bridge "yt" -> "YouTube" (one edit out of two
   * characters already exceeds any sane threshold), but a subsequence scan
   * handles initialisms and dropped vowels naturally. Returns a 0..1 score,
   * lower being better, so it is directly comparable to a Fuse score.
   */
  private static subsequenceScore(token: string, value: string): number | null {
    if (!token) return null;
    const text = value.toLowerCase();
    if (text.length === 0) return null;

    let first = -1;
    let last = -1;
    let at = 0;
    let wordStarts = 0;

    for (let i = 0; i < token.length; i++) {
      const found = text.indexOf(token[i], at);
      if (found === -1) return null;
      if (first === -1) first = found;
      last = found;
      at = found + 1;
      if (found === 0 || /[\s\-_/.·|:]/.test(text[found - 1])) wordStarts += 1;
    }

    // Tight, early, word-aligned matches score best.
    const span = last - first + 1;
    const spread = (span - token.length) / Math.max(text.length, 1);
    const offset = first / Math.max(text.length, 1);
    const acronymBonus = wordStarts / token.length;

    const score = 0.32 + spread * 0.4 + offset * 0.2 - acronymBonus * 0.22;
    return Math.min(0.95, Math.max(0.02, score));
  }

  private subsequenceSearch(token: string) {
    const out = new Map<string, { doc: SearchDocument; score: number }>();
    for (const doc of this.docs.values()) {
      const candidates: [string, number][] = [
        [doc.title, 1],
        [doc.domain, 1.15],
        [doc.collectionName, 1.35],
      ];
      let best: number | null = null;
      for (const [value, penalty] of candidates) {
        const score = SearchIndex.subsequenceScore(token, value);
        if (score !== null) {
          const weighted = Math.min(0.95, score * penalty);
          if (best === null || weighted < best) best = weighted;
        }
      }
      if (best !== null) out.set(doc.id, { doc, score: best });
    }
    return out;
  }

  /** Fuse results merged with subsequence results, best score per document. */
  private matchToken(token: string, limit: number) {
    const merged = this.phraseSearch(token, limit);
    if (!this.settings.fuzzySearch) return merged;

    for (const [id, hit] of this.subsequenceSearch(token)) {
      const existing = merged.get(id);
      if (!existing || hit.score < existing.score) merged.set(id, hit);
    }
    return merged;
  }

  /**
   * Multi-word queries are matched token by token and intersected, so every
   * word has to hit *something* — possibly different fields. That is what makes
   * "eld map" find "Elden Ring Map" rather than "New World Map", and lets
   * "git music" find a music bot hosted on github.com.
   */
  private tokenSearch(tokens: string[], perToken: number) {
    const tally = new Map<
      string,
      { doc: SearchDocument; total: number; matched: number }
    >();

    for (const token of tokens) {
      for (const [id, hit] of this.matchToken(token, perToken)) {
        const entry = tally.get(id) ?? { doc: hit.doc, total: 0, matched: 0 };
        entry.total += hit.score;
        entry.matched += 1;
        tally.set(id, entry);
      }
    }

    const out = new Map<string, { doc: SearchDocument; score: number }>();
    for (const [id, entry] of tally) {
      if (entry.matched === tokens.length) {
        out.set(id, { doc: entry.doc, score: entry.total / entry.matched });
      }
    }
    return out;
  }

  search(query: string, limit = 40): SearchHit[] {
    const q = query.trim();
    if (!q) return [];

    const lower = q.toLowerCase();
    const tokens = lower.split(/\s+/).filter(Boolean);

    let candidates =
      tokens.length > 1
        ? this.tokenSearch(tokens, limit * 8)
        : this.matchToken(q, limit * 3);

    // Nothing satisfied every word — fall back to the loose phrase match rather
    // than showing an empty palette.
    if (candidates.size === 0 && tokens.length > 1) {
      candidates = this.matchToken(q, limit * 3);
    }

    const hasAll = (value: string) => {
      const text = value.toLowerCase();
      return tokens.every((t) => text.includes(t));
    };

    const hits: SearchHit[] = [];
    for (const { doc, score } of candidates.values()) {
      const title = doc.title.toLowerCase();

      // Every word is a subsequence of the title: "eld map" in "Elden Ring
      // Map". This is the spec's "fuzzy title match" tier.
      const fuzzyTitle = tokens.every(
        (t) => SearchIndex.subsequenceScore(t, doc.title) !== null,
      );

      let reason: SearchHit["reason"];
      if (title === lower) reason = "title-exact";
      else if (title.startsWith(lower)) reason = "title-prefix";
      else if (hasAll(doc.title) || fuzzyTitle) reason = "title";
      else if (hasAll(doc.domain)) reason = "domain";
      else if (hasAll(doc.url)) reason = "url";
      else if (hasAll(doc.collectionName)) reason = "collection";
      else if (doc.tags.some((t) => hasAll(t))) reason = "tag";
      else if (this.settings.searchDescriptions && hasAll(doc.description))
        reason = "description";
      else reason = "fuzzy";

      hits.push({ doc, score, reason });
    }

    hits.sort((a, b) => {
      const tier = TIER[a.reason] - TIER[b.reason];
      if (tier !== 0) return tier;
      if (a.score !== b.score) return a.score - b.score;
      return a.doc.title.localeCompare(b.doc.title);
    });

    return hits.slice(0, limit);
  }
}

/** Plain substring search over collection names, for the palette. */
export function searchCollections(
  collections: Collection[],
  query: string,
  limit = 6,
): Collection[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return collections
    .filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const an = a.name.toLowerCase();
      const bn = b.name.toLowerCase();
      const aStarts = an.startsWith(q) ? 0 : 1;
      const bStarts = bn.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return an.length - bn.length;
    })
    .slice(0, limit);
}
