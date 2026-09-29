// Servicing automations: the rules a seller can switch on, and the activity
// feed they produce. Events are derived from each loan's computed state, so
// the feed always agrees with the ledger.
import { addDays, daysBetween, money, fmtDate } from './util.js';

export const RULES = [
  { id: 'autopay', name: 'Autopay collection', icon: 'repeat', desc: 'Drafts each installment from the buyer’s bank on the due date and deposits it to yours within 2 business days.', timing: 'On the due date', channel: 'ACH' },
  { id: 'reminder', name: 'Payment reminders', icon: 'bell', desc: 'Friendly heads-up before every due date, or a draft notice for autopay buyers.', timing: '5 days before due', channel: 'Email + SMS' },
  { id: 'statement', name: 'Monthly statements', icon: 'file', desc: 'Statement with the amount due, balance and year-to-date interest.', timing: '15 days before due', channel: 'Email + portal' },
  { id: 'receipt', name: 'Payment receipts', icon: 'receipt', desc: 'Instant receipt showing how the payment was applied to interest, principal and escrow.', timing: 'When funds post', channel: 'Email' },
  { id: 'late_notice', name: 'Late notices', icon: 'alert', desc: 'Sent the day after the grace period ends, with the late charge from the note.', timing: 'Grace period + 1 day', channel: 'Email + SMS' },
  { id: 'delinquency', name: '30-day delinquency letter', icon: 'mail', desc: 'Formal written notice at 30 days past due. You’re alerted to decide next steps.', timing: '30 days past due', channel: 'Letter + email' },
  { id: 'insurance', name: 'Insurance monitoring', icon: 'shield', desc: 'Requests proof of renewal before the policy expires and alerts you if coverage lapses.', timing: '45 days before expiry', channel: 'Email' },
  { id: 'balloon', name: 'Balloon countdown', icon: 'flag', desc: 'Reminds the buyer to line up refinancing, starting 12 months before the balloon is due.', timing: '12, 6 and 3 months out', channel: 'Email' },
  { id: 'year_end', name: 'Year-end interest statements', icon: 'landmark', desc: 'Interest statements for you and the buyer (plus 1098 e-filing on Complete).', timing: 'By January 31', channel: 'Email + portal' },
];

export const ruleOn = (settings, id) => settings?.automations?.[id] !== false;

// Build the feed across loans for a window around `asOf`.
export function automationFeed(loans, states, settings, asOf, { back = 60, ahead = 21 } = {}) {
  const from = addDays(asOf, -back), to = addDays(asOf, ahead);
  const out = [];
  const push = (ev) => {
    if (ev.date < from || ev.date > to) return;
    if (!ruleOn(settings, ev.rule)) return;
    ev.status ||= ev.date <= asOf ? 'sent' : 'scheduled';
    out.push(ev);
  };
  for (const loan of loans) {
    const st = states[loan.id];
    if (!st) continue;
    const who = loan.borrower?.name || 'Borrower';
    const base = { loanId: loan.id, loanNumber: loan.number, who };
    const ap = loan.autopay?.enabled ? loan.autopay : null;
    const insts = [...st.paid.filter((p) => !p.boarded), ...st.unpaid];
    for (const m of insts) {
      if (m.due < addDays(from, -31) || m.due > addDays(to, 31)) continue;
      const onAutopay = ap && m.due >= ap.since;
      push({ ...base, rule: 'statement', date: addDays(m.due, -15), title: 'Monthly statement delivered', detail: `${money(m.total)} due ${fmtDate(m.due)}` });
      push({ ...base, rule: 'reminder', date: addDays(m.due, -5), title: onAutopay ? 'Autopay notice sent' : 'Payment reminder sent', detail: onAutopay ? `${money(m.total)} will be drafted ${fmtDate(m.due)}` : `${money(m.total)} due ${fmtDate(m.due)}` });
      if (onAutopay) {
        const paidByDraft = m.paidDate && m.paidDate === m.due;
        push({ ...base, rule: 'autopay', date: m.due, title: 'Autopay draft initiated', detail: `${money(m.total)} from ${ap.account || 'bank on file'}` });
        if (paidByDraft) push({ ...base, rule: 'autopay', date: addDays(m.due, 2), title: 'Autopay deposited to your account', detail: `${money(m.total)} settled`, tone: 'good' });
      }
      if (m.paidDate) {
        push({ ...base, rule: 'receipt', date: m.paidDate, title: 'Receipt sent', detail: `${money(m.interest)} interest · ${money(m.principal)} principal${m.escrow ? ` · ${money(m.escrow)} escrow` : ''}` });
      }
      const late = m.paidDate ? m.late : m.lateMarked;
      if (late) {
        push({ ...base, rule: 'late_notice', date: addDays(m.due, st.grace + 1), title: 'Late notice sent', detail: `${fmtDate(m.due)} payment · ${money(st.lateFee)} late charge`, tone: 'serious' });
      }
      const d30 = addDays(m.due, 30);
      if ((m.paidDate && m.paidDate > d30) || (!m.paidDate && d30 <= asOf)) {
        push({ ...base, rule: 'delinquency', date: d30, title: '30-day delinquency letter mailed', detail: `${fmtDate(m.due)} installment still unpaid`, tone: 'critical' });
      }
    }
    if (loan.insurance?.expires && !st.paidOffDate) {
      const exp = loan.insurance.expires;
      push({ ...base, rule: 'insurance', date: addDays(exp, -45), title: 'Insurance renewal requested', detail: `${loan.insurance.carrier || 'Policy'} expires ${fmtDate(exp)}` });
      const left = daysBetween(asOf, exp);
      if (left <= 30 && left >= 0 && !loan.insurance.renewalReceived) {
        out.push({ ...base, rule: 'insurance', date: asOf, status: 'alert', title: `Insurance expires in ${left} days`, detail: 'No renewal on file yet. We’ve nudged the buyer twice.', tone: 'warning' });
      } else if (left < 0 && !loan.insurance.renewalReceived) {
        out.push({ ...base, rule: 'insurance', date: asOf, status: 'alert', title: 'Insurance may have lapsed', detail: `Policy expired ${fmtDate(exp)} with no renewal on file.`, tone: 'critical' });
      }
    }
    if (st.balloon && !st.paidOffDate) {
      for (const months of [12, 6, 3]) {
        const d = addDays(st.balloon.due, -Math.round(months * 30.4));
        push({ ...base, rule: 'balloon', date: d, title: `Balloon reminder (${months} months)`, detail: `${money(st.balloon.total)} due ${fmtDate(st.balloon.due)}` });
      }
    }
    const y = +asOf.slice(0, 4);
    for (const yy of [y, y + 1]) {
      push({ ...base, rule: 'year_end', date: `${yy}-01-20`, title: `${yy - 1} interest statements delivered`, detail: 'To you and the buyer' });
    }
  }
  const rank = { alert: 0, scheduled: 1, sent: 2 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || (a.status === 'scheduled' ? (a.date < b.date ? -1 : 1) : a.date < b.date ? 1 : -1));
}

// Rough time saved: minutes a DIY seller would spend per event.
export const MINUTES_SAVED = { autopay: 12, reminder: 4, statement: 15, receipt: 5, late_notice: 15, delinquency: 30, insurance: 10, balloon: 10, year_end: 45 };
