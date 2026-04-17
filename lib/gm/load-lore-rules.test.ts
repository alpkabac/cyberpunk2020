import { describe, expect, it } from 'vitest';

import { loadDefaultLoreRules, loadLoreRulesFromDir, parseLoreRuleMarkdown, getLoreRulesDir } from './load-lore-rules';
import { matchRules } from './lorebook';

describe('parseLoreRuleMarkdown', () => {
  it('parses frontmatter and markdown body', () => {
    const raw = `---
id: test-rule
priority: 9
keywords: alpha, beta
refs: CP2020Gameplay.md — example
---

Hello **world**.
`;
    const r = parseLoreRuleMarkdown(raw, 'x.md');
    expect(r.id).toBe('test-rule');
    expect(r.priority).toBe(9);
    expect(r.keywords).toEqual(['alpha', 'beta']);
    expect(r.refs).toContain('CP2020Gameplay');
    expect(r.content).toContain('**world**');
  });
});

describe('loadLoreRulesFromDir', () => {
  it('loads all rule files with unique ids', () => {
    const rules = loadLoreRulesFromDir(getLoreRulesDir());
    expect(rules.length).toBeGreaterThanOrEqual(16);
    const ids = new Set(rules.map((r) => r.id));
    expect(ids.size).toBe(rules.length);
  });

  it('default loader returns same corpus', () => {
    const a = loadDefaultLoreRules();
    const b = loadLoreRulesFromDir(getLoreRulesDir());
    expect(a.map((r) => r.id).sort()).toEqual(b.map((r) => r.id).sort());
  });
});

describe('Book refs in retrieval', () => {
  it('matches gameplay filename token in refs for lookup/injection keywords', () => {
    const rules = loadDefaultLoreRules();
    const m = matchRules('Read CP2020Gameplay about FNFF damage', rules);
    expect(m.some((r) => r.id === 'damage-pipeline')).toBe(true);
  });
});
