import type { LocationLevel, LocationNode } from '@/types';

/** Location hierarchy helpers (PRD 8.13). */
export interface TreeNode extends LocationNode {
  children: TreeNode[];
}

export function buildTree(nodes: LocationNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: TreeNode[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) map.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }
  return roots;
}

export function ancestors(nodes: LocationNode[], id: string): LocationNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: LocationNode[] = [];
  let cur = byId.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

export function pathLabel(nodes: LocationNode[], id: string, sep = ' › '): string {
  return ancestors(nodes, id).map((n) => n.name).join(sep);
}

export function descendants(nodes: LocationNode[], id: string): LocationNode[] {
  const out: LocationNode[] = [];
  const walk = (pid: string) => {
    for (const n of nodes) if (n.parentId === pid) { out.push(n); walk(n.id); }
  };
  walk(id);
  return out;
}

/** Find the ancestor at a given level (e.g. the district of a community). */
export function ancestorAtLevel(nodes: LocationNode[], id: string, levelId: string): LocationNode | undefined {
  return ancestors(nodes, id).find((n) => n.levelId === levelId);
}

export function levelLabel(levels: LocationLevel[], levelId: string, lang: 'en' | 'fr'): string {
  const l = levels.find((x) => x.id === levelId);
  return l?.label[lang] ?? l?.label.en ?? levelId;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** A short code for a new node: first letters of the name, unique among its siblings. */
export function suggestCode(name: string, taken: Set<string>, length = 3): string {
  const base = (slug(name).slice(0, length) || 'LOC').padEnd(length, 'X');
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = base.slice(0, Math.max(1, length - String(i).length)) + i;
    if (!taken.has(c)) return c;
  }
  return base + taken.size;
}

export interface ImportResult {
  nodes: LocationNode[];
  created: number;
  errors: { row: number; key: string }[];
}

/**
 * Import a location tree from CSV rows: one column per level, top level first
 * ("Upper West, Wa Municipal, Busa"). Existing nodes are matched by name under the same parent.
 */
export function importLocations(existing: LocationNode[], levels: LocationLevel[], rows: string[][], orgId: string, makeId: () => string): ImportResult {
  const nodes = [...existing];
  const errors: ImportResult['errors'] = [];
  let created = 0;
  rows.forEach((raw, i) => {
    const cells = raw.map((c) => c.trim());
    if (cells.every((c) => !c)) return;
    if (cells.length < levels.length || cells.slice(0, levels.length).some((c) => !c)) {
      errors.push({ row: i + 1, key: 'missingLevel' });
      return;
    }
    let parentId: string | null = null;
    levels.forEach((level, li) => {
      const name = cells[li]!;
      let node = nodes.find((n) => n.levelId === level.id && n.parentId === parentId && n.name.toLowerCase() === name.toLowerCase());
      if (!node) {
        const taken = new Set(nodes.filter((n) => n.parentId === parentId).map((n) => n.code));
        node = { id: makeId(), orgId, levelId: level.id, parentId, name, code: suggestCode(name, taken, level.codeLength ?? 3) };
        nodes.push(node);
        created++;
      }
      parentId = node.id;
    });
  });
  return { nodes, created, errors };
}
