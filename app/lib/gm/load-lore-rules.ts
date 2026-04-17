/**
 * Load lore rules from small Markdown files (server / Node only).
 * Each file: YAML-style frontmatter + Markdown body. See lib/gm/lore/rules/*.md
 */

import fs from 'fs';
import path from 'path';

import type { LoreRule } from './lorebook';

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/;

function parseFrontmatterLines(fm: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return meta;
}

export function parseLoreRuleMarkdown(raw: string, filename: string): LoreRule {
  const text = raw.replace(/^\uFEFF/, '');
  const m = text.match(FRONTMATTER_RE);
  if (!m) {
    throw new Error(`Lore file ${filename}: expected frontmatter opening with --- and closing --- before body`);
  }
  const meta = parseFrontmatterLines(m[1]);
  const body = m[2].trim();
  const id = meta.id;
  if (!id) throw new Error(`Lore file ${filename}: frontmatter must include id:`);
  const priority = Number(meta.priority);
  if (!Number.isFinite(priority)) throw new Error(`Lore file ${filename}: priority must be a number`);
  const kwRaw = meta.keywords ?? '';
  const keywords = kwRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (keywords.length === 0) {
    throw new Error(`Lore file ${filename}: keywords must list at least one comma-separated keyword`);
  }
  const refs = meta.refs?.trim() || undefined;
  if (!body) throw new Error(`Lore file ${filename}: markdown body is empty`);
  return { id, priority, keywords, content: body, refs };
}

export function getLoreRulesDir(): string {
  return path.join(process.cwd(), 'lib', 'gm', 'lore', 'rules');
}

export function loadLoreRulesFromDir(dir: string): LoreRule[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Lore rules directory missing: ${dir}`);
  }
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  if (names.length === 0) {
    throw new Error(`No .md lore rules in ${dir}`);
  }
  const rules: LoreRule[] = [];
  for (const name of names.sort()) {
    const full = path.join(dir, name);
    const raw = fs.readFileSync(full, 'utf8');
    rules.push(parseLoreRuleMarkdown(raw, name));
  }
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) throw new Error(`Duplicate lore rule id: ${r.id}`);
    seen.add(r.id);
  }
  return rules;
}

let cachedRules: LoreRule[] | null = null;

/** Cached disk load; call `__resetLoreRulesCacheForTests` when files change in tests. */
export function loadDefaultLoreRules(): LoreRule[] {
  if (cachedRules) return cachedRules;
  cachedRules = loadLoreRulesFromDir(getLoreRulesDir());
  return cachedRules;
}

export function __resetLoreRulesCacheForTests(): void {
  cachedRules = null;
}
