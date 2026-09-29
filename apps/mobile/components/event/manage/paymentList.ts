/**
 * Payment list (UX-MEVT-16): who owes the entrance fee, who has paid it, and the Total card's
 * collected-against-expected. Pure, so the arithmetic is unit-tested; the screen only renders it.
 *
 *   Rows      every CONFIRMED participant, stand-by and guests included — they hold a spot, so
 *             they owe the fee. Waiting, interested and invited rows owe nothing yet.
 *   Paid      the server's `has_paid`, which 0122 keeps equal to `paid_amount >= fee` through
 *             mark_paid, mark_all_paid and every fee change (decision 9).
 *   Owed      a Pending row with credit (`paid_amount > 0`, the fee was raised after they paid)
 *             owes only the difference; with no credit, the whole fee.
 *   Expected  fee × confirmed rows.
 *   Collected each row's credit capped at the fee: after a fee cut a player keeps the higher
 *             amount credited, and counting it in full would push "collected" past "expected".
 */

export type PaymentFilter = 'all' | 'paid' | 'pending';

export type PaymentParticipant = {
  id: string;
  user_id: string | null;
  status: string;
  has_paid: boolean;
  /** numeric(10,2) — PostgREST sends a number; older rows / types may leave it out. */
  paid_amount?: number | string | null;
  guest_name: string | null;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export type PaymentEvent = {
  entrance_fee_enabled: boolean | null;
  entrance_fee_amount: number | null;
};

export type PaymentRow = {
  participantId: string;
  userId: string | null;
  name: string | null;
  avatarPath: string | null;
  guest: boolean;
  paid: boolean;
  /** What is credited towards the fee (0 when nothing). */
  credit: number;
  /** What is still owed: 0 when paid. */
  owed: number;
  /** Pending with some credit — the fee went up after they paid. */
  partial: boolean;
};

export type PaymentSummary = {
  fee: number;
  rows: PaymentRow[];
  collected: number;
  expected: number;
  counts: Record<PaymentFilter, number>;
};

/** The fee each confirmed player owes; 0 when the event has none (the screen is then hidden). */
export function feeOf(event: PaymentEvent): number {
  if (!event.entrance_fee_enabled) return 0;
  const n = Number(event.entrance_fee_amount ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function paymentList(event: PaymentEvent, participants: readonly PaymentParticipant[]): PaymentSummary {
  const fee = feeOf(event);
  const rows: PaymentRow[] = participants
    .filter((p) => p.status === 'confirmed')
    .map((p) => {
      const raw = Number(p.paid_amount ?? 0);
      const credit = Number.isFinite(raw) && raw > 0 ? raw : 0;
      const paid = p.has_paid;
      const owed = paid ? 0 : cents(Math.max(fee - credit, 0));
      return {
        participantId: p.id,
        userId: p.user_id,
        name: p.profiles?.full_name ?? p.guest_name ?? null,
        avatarPath: p.profiles?.avatar_url ?? null,
        guest: p.user_id == null,
        paid,
        credit,
        owed,
        partial: !paid && credit > 0 && owed > 0,
      };
    });
  const paidCount = rows.filter((r) => r.paid).length;
  return {
    fee,
    rows,
    collected: cents(rows.reduce((sum, r) => sum + (r.paid ? fee : Math.min(r.credit, fee)), 0)),
    expected: cents(fee * rows.length),
    counts: { all: rows.length, paid: paidCount, pending: rows.length - paidCount },
  };
}

export function filterRows(rows: readonly PaymentRow[], filter: PaymentFilter): PaymentRow[] {
  if (filter === 'paid') return rows.filter((r) => r.paid);
  if (filter === 'pending') return rows.filter((r) => !r.paid);
  return [...rows];
}

/**
 * "5 €" / "2,50 €" in Portuguese, "€5" / "€2.50" in English. Whole euros drop the cents. Written
 * out rather than Intl.NumberFormat so the output does not depend on the engine's ICU data.
 */
export function formatMoney(amount: number, language: string): string {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  const digits = whole ? String(Math.round(amount)) : amount.toFixed(2);
  if (language.startsWith('pt')) return `${digits.replace('.', ',')} €`;
  return `€${digits}`;
}
