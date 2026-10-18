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
