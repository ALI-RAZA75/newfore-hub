/** Weekly task figures. Dates are yyyy-MM-dd; a week runs Monday (`mon`) to Sunday (`sun`). */
type T = { status: string; due_date: string | null; completed_at: string | null };

/**
 * The day a task was finished. Tasks inserted as already done (like the seeded prep work) have no
 * completed_at because the trigger only runs on updates, so their due date stands in.
 */
export const completedOn = (t: T) => (t.completed_at ? t.completed_at.slice(0, 10) : t.status === "done" ? t.due_date : null);

export const dueIn = (t: T, mon: string, sun: string) => !!t.due_date && t.due_date >= mon && t.due_date <= sun;

export const doneIn = (t: T, mon: string, sun: string) => { const d = completedOn(t); return !!d && d >= mon && d <= sun; };

/** Not finished by `asOf` although due before it. */
export const overdueAt = (t: T, asOf: string) => {
  if (!t.due_date || t.due_date >= asOf) return false;
  const d = completedOn(t);
  return !d || d >= asOf;
};
