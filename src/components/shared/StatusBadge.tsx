import { Badge } from '@/components/ui/badge';
import { useT } from '@/stores/hooks';

type Tone = 'neutral' | 'warning' | 'info' | 'success' | 'teal' | 'paid' | 'done' | 'danger' | 'warningOutline' | 'dangerOutline' | 'unknown';

/** Status colours (PRD 6.2). */
const TONES: Record<string, Tone> = {
  DRAFT: 'neutral', ARCHIVED: 'neutral', INACTIVE: 'neutral', NONE: 'neutral', NOT_PAID: 'neutral',
  PENDING: 'warning', PRICE_UPDATE: 'warning', AWAITING_CHECKER: 'warning', INVITED: 'warning', TRIAL: 'warning', FLAGGED: 'warning', PENDING_APPROVAL: 'warning', RECEIVE_REFUND: 'warning', REFUND_SUPPLIER: 'warning',
  MANAGEMENT_APPROVED: 'info', ZONE_APPROVED: 'info', OPS_APPROVED: 'info', LEVEL_1_APPROVED: 'info', LEVEL_2_APPROVED: 'info', LEVEL_3_APPROVED: 'info', PROCESSING: 'info', IN_TRANSIT: 'info',
  FINANCE_APPROVED: 'success', APPROVED: 'success', RATE_CONFIRMED: 'success', SUCCESSFUL: 'success', OK: 'success', DELIVERED: 'success', FULFILLED: 'success',
  ACTIVE: 'teal', TICKET_ACTIVATED: 'teal', FUNDS_RECEIVED: 'teal', PARTIAL_DISBURSEMENT: 'teal', PARTIALLY_DISBURSED: 'teal',
  PAID: 'paid', FULL_DISBURSEMENT: 'paid', FUNDS_DISBURSED: 'paid',
  RECONCILED: 'done', COMPLETED: 'done',
  NOT_APPROVED: 'danger', REJECTED: 'danger', SUSPENDED: 'danger', BLOCKED: 'danger',
  ON_HOLD: 'warningOutline',
  FAILED: 'dangerOutline', REVERSED: 'dangerOutline',
  PENDING_SCORING: 'warning', PENDING_REVIEW: 'warning', LINE_PENDING: 'warning', RECEIPT_PENDING: 'warning', PARTIALLY_PAID: 'warning',
  AGENT_CONFIRMATION: 'info', FINANCE_REVIEW: 'info', PENDING_DISBURSEMENT: 'info', LINE_CONFIRMED: 'info', RECORDED: 'info', MIGRATED: 'info',
  LINE_APPROVED: 'success', CONFIRMED: 'success', RECEIPT_CONFIRMED: 'success', FULLY_FULFILLED: 'success', LINE_FULFILLED: 'success', FULLY_RECOVERED: 'success', FULLY_PAID: 'success',
  ACTIVATED: 'teal', PARTIALLY_RECOVERED: 'teal', PARTIALLY_FULFILLED: 'teal', DISBURSED: 'paid', LINE_PAID: 'paid',
  SETTLED: 'done', CLOSED: 'done', RECEIPT_NA: 'neutral',
  LINE_REJECTED: 'danger', LINE_DECLINED: 'dangerOutline', OVERDUE: 'danger',
  IN_PENDING: 'warning', IN_CONFIRMED: 'success', IN_DISCREPANCY: 'danger', IN_NEEDS_RESOLUTION: 'warningOutline', IN_REFUND_SUBMITTED: 'info', IN_RESOLVED: 'done',
  D_OPEN: 'danger', D_AUTO_WRITTEN_OFF: 'neutral', D_RESOLVED: 'done',
  RP_SUBMITTED: 'warning', RP_APPROVED: 'success', RP_PARTIAL: 'warningOutline', RP_REJECTED: 'danger',
  BAG_ORIGINAL: 'success', BAG_MISSING: 'danger', BAG_REPLACED: 'warningOutline', BAG_TOP_UP: 'teal',
  TRANSFER_PENDING: 'info', TRANSFER_COMPLETE: 'done', DISPATCHED: 'paid', SCHEDULED: 'neutral', INCONSISTENT: 'danger',
  ADJ_PENDING: 'warning', ADJ_APPROVED: 'success', ADJ_REJECTED: 'dangerOutline',
  WP_PENDING: 'neutral', WP_PARTIAL: 'teal', WP_FULL: 'paid', WP_REJECTED: 'danger',
  UNKNOWN: 'unknown',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  return <Badge tone={TONES[status] ?? 'neutral'}>{t(`status.${status}`, { defaultValue: status })}</Badge>;
}
