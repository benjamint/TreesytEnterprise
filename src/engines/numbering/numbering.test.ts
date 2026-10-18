import { describe, expect, it } from 'vitest';
import type { NumberingPattern } from '@/types';
import { formatNumber, initialsOf, nextNumber, unknownTokens } from '.';

const date = new Date(2026, 9, 18);

describe('numbering engine', () => {
  it('formats Vitara purchase requests per month', () => {
    const p: NumberingPattern = { docType: 'purchaseRequest', prefix: 'CS', pattern: '{prefix}-{yymm}-{seq:4}', scope: 'month' };
    const a = nextNumber(p, {}, { date });
    expect(a.number).toBe('CS-2610-0001');
    const b = nextNumber(p, a.sequences, { date });
    expect(b.number).toBe('CS-2610-0002');
    const nov = nextNumber(p, b.sequences, { date: new Date(2026, 10, 1) });
    expect(nov.number).toBe('CS-2611-0001');
  });

  it('formats Kakao Ivoire DA-{yy}-{seq:6} per year', () => {
    const p: NumberingPattern = { docType: 'purchaseRequest', prefix: 'DA', pattern: 'DA-{yy}-{seq:6}', scope: 'year' };
    expect(nextNumber(p, { 'purchaseRequest:2026': 41 }, { date }).number).toBe('DA-26-000042');
  });

  it('builds farmer IDs per community with initials', () => {
    const p: NumberingPattern = { docType: 'farmerId', prefix: '', pattern: '{community}-{initials}-{seq}', scope: 'community' };
    const r = nextNumber(p, { 'farmerId:community:WA-014': 22 }, { community: 'WA-014', initials: initialsOf('Abena Issah') });
    expect(r.number).toBe('WA-014-AI-0023');
    const other = nextNumber(p, r.sequences, { community: 'WA-002', initials: 'KM' });
    expect(other.number).toBe('WA-002-KM-0001');
  });

  it('keeps per-client and per-agent sequences separate', () => {
    const p: NumberingPattern = { docType: 'saleNumber', prefix: 'SN', pattern: '{prefix}-{clientCode}-{seq:3}', scope: 'client' };
    const a = nextNumber(p, {}, { clientCode: 'NSB' });
    const b = nextNumber(p, a.sequences, { clientCode: 'AFP' });
    expect(a.number).toBe('SN-NSB-001');
    expect(b.number).toBe('SN-AFP-001');
    const agent: NumberingPattern = { docType: 'receipt', prefix: 'R', pattern: '{prefix}{seq:2}', scope: 'agent' };
    expect(nextNumber(agent, { 'receipt:agent:a1': 5 }, { agentId: 'a1' }).number).toBe('R06');
  });

  it('leaves unknown tokens visible and reports them', () => {
    expect(formatNumber({ prefix: 'X', pattern: '{prefix}-{foo}' }, 1)).toBe('X-{foo}');
    expect(unknownTokens('{prefix}-{foo}-{seq:3}')).toEqual(['foo']);
  });
});
