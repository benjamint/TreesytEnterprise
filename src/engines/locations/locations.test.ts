import { describe, expect, it } from 'vitest';
import type { LocationNode } from '@/types';
import { ancestorAtLevel, buildTree, descendants, pathLabel } from '.';

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
