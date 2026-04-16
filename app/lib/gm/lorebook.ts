/**
 * Keyword-triggered rule injection with priority and token budget (Requirements 4.1–4.3).
 */

import defaultRules from './lore/default-rules.json';

export interface LoreRule {
  id: string;
  keywords: string[];
  priority: number;
  content: string;
}

/** Rough token estimate (~4 chars per token for Latin text). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extract alphanumeric tokens from user text for keyword matching.
 */
export function tokenizeForKeywords(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(normalizeWord)
    .filter((w) => w.length >= 2);
}

/**
 * Returns rules that match at least one keyword in `playerInput`, deduped by id.
 */
export function matchRules(playerInput: string, rules: readonly LoreRule[]): LoreRule[] {
  const tokens = new Set(tokenizeForKeywords(playerInput));
  if (tokens.size === 0) return [];

  const seen = new Set<string>();
  const out: LoreRule[] = [];

  for (const rule of rules) {
    if (seen.has(rule.id)) continue;
    const hit = rule.keywords.some((kw) => {
      const k = normalizeWord(kw);
      return k.length > 0 && tokens.has(k);
    });
    if (hit) {
      seen.add(rule.id);
      out.push(rule);
    }
  }

  return out;
}

/** Higher priority first; stable tie-breaker by id. */
export function sortByPriority(rules: LoreRule[]): LoreRule[] {
  return [...rules].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}

export interface LoreBudgetOptions {
  /** Max estimated tokens for injected lore text. */
  maxTokens: number;
}

/**
 * Takes sorted rules (use `sortByPriority(matchRules(...))`) and concatenates content until the budget is exhausted.
 */
export function enforceTokenBudget(rules: readonly LoreRule[], opts: LoreBudgetOptions): string {
  let used = 0;
  const parts: string[] = [];

  for (const rule of rules) {
    const block = `[${rule.id}] ${rule.content}`;
    const cost = estimateTokens(block);
    if (used + cost <= opts.maxTokens) {
      parts.push(block);
      used += cost;
    } else {
      const remaining = opts.maxTokens - used;
      if (remaining <= 0) break;
      const truncated = truncateToTokenBudget(rule.content, remaining - estimateTokens(`[${rule.id}] `));
      if (truncated.trim()) {
        parts.push(`[${rule.id}] ${truncated}`);
      }
      break;
    }
  }

  return parts.join('\n\n');
}

function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  const maxChars = Math.max(0, maxTokens * 4 - 3);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

export function loadDefaultLoreRules(): LoreRule[] {
  return defaultRules as LoreRule[];
}

export function buildLoreInjection(playerInput: string, maxTokens: number, rules?: readonly LoreRule[]): string {
  const all = rules ?? loadDefaultLoreRules();
  const matched = sortByPriority(matchRules(playerInput, all));
  return enforceTokenBudget(matched, { maxTokens });
}

/**
 * Tokenize a lookup query (same spirit as keyword matching; keeps short tokens like SP/BTM).
 */
function tokenizeForLookupQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 2);
}

/**
 * Used by the `lookup_rules` tool: match whole phrase and per-word hits in id, keywords, content.
 * The old implementation used `content.includes(fullQuery)` only — long natural-language queries never matched, so the tool always returned "".
 */
export function lookupRulesText(query: string, rules: readonly LoreRule[], maxResults = 5): string {
  const q = query.trim().toLowerCase();
  if (!q) return '';

  const words = tokenizeForLookupQuery(q);
  const wordSet = new Set(words);

  const scored = rules
    .map((r) => {
      let score = 0;
      const idLower = r.id.toLowerCase();
      const contentLower = r.content.toLowerCase();

      if (q.length >= 4 && (contentLower.includes(q) || idLower.includes(q))) {
        score += 12;
      }

      for (const w of wordSet) {
        if (w.length < 2) continue;
        if (idLower.includes(w)) score += 4;
        if (contentLower.includes(w)) score += 3;
        for (const kw of r.keywords) {
          const kl = kw.toLowerCase();
          if (kl === w || kl.includes(w) || w.includes(kl)) score += 3;
        }
      }

      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.r.priority - a.r.priority);

  const picks = scored.length > 0 ? scored.slice(0, maxResults) : sortByPriority([...rules]).slice(0, maxResults).map((r) => ({ r, score: 0 }));

  const header =
    scored.length === 0
      ? '[lookup_rules: no word overlap with query; showing highest-priority entries as fallback]\n\n'
      : '';

  return (
    header +
    picks.map(({ r }) => `[${r.id}] (p${r.priority}) ${r.content}`).join('\n\n')
  );
}
