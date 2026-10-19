import { describe, expect, it } from 'vitest';
import type { LocationNode } from '@/types';
import { ancestorAtLevel, buildTree, descendants, importLocations, pathLabel } from '.';

const n = (id: string, levelId: string, parentId: string | null): LocationNode => ({ id, orgId: 'o', levelId, parentId, name: id.toUpperCase(), code: id });
const nodes = [n('uw', 'region', null), n('wa', 'district', 'uw'), n('c1', 'community', 'wa'), n('c2', 'community', 'wa')];

describe('locations engine', () => {
  it('builds trees and paths', () => {
    expect(buildTree(nodes)[0].children[0].children).toHaveLength(2);
    expect(pathLabel(nodes, 'c1')).toBe('UW › WA › C1');
    expect(descendants(nodes, 'uw').map((x) => x.id)).toEqual(['wa', 'c1', 'c2']);
    expect(ancestorAtLevel(nodes, 'c2', 'district')?.id).toBe('wa');
  });
});

describe('location import', () => {
  it('creates missing nodes, reuses existing ones and reports bad rows', () => {
    const levels = [{ id: 'region', label: { en: 'Region' } }, { id: 'district', label: { en: 'District' } }, { id: 'community', label: { en: 'Community' } }];
    const existing = [{ id: 'r1', orgId: 'o', levelId: 'region', parentId: null, name: 'Upper West', code: 'UW' }];
    let n = 0;
    const res = importLocations(existing, levels, [['Upper West', 'Wa', 'Busa'], ['upper west', 'Wa', 'Kperisi'], ['Upper West', '', 'X']], 'o', () => `n${++n}`);
    expect(res.created).toBe(3);
    expect(res.errors).toEqual([{ row: 3, key: 'missingLevel' }]);
    expect(res.nodes.filter((x) => x.levelId === 'district')).toHaveLength(1);
    expect(res.nodes.find((x) => x.name === 'Busa')?.code).toBe('BUS');
  });
});
