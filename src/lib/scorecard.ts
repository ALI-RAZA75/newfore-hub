/** EOS weekly scorecard: one row per measurable. Values are worked out in the Performance page. */
export type Measurable = { key: string; label: string; lowerIsBetter?: boolean; decimals?: number; manual?: boolean };

export const SCORECARD: Measurable[] = [
  { key: "leads", label: "Leads (all sources)" },
  { key: "organic_sessions", label: "Organic sessions (GA4 Organic Search)" },
  { key: "gsc_clicks", label: "Google Search clicks" },
  { key: "gsc_position", label: "Average search position", lowerIsBetter: true, decimals: 1 },
  { key: "ai_sessions", label: "Visits from AI assistants" },
  { key: "gbp_actions", label: "Google profile calls + website clicks + directions" },
  { key: "new_reviews", label: "New Google reviews (all locations)" },
  { key: "new_reviews_28d", label: "New Google reviews (28 days)" },
  { key: "gbp_posts", label: "Google profile posts published", manual: true },
  { key: "negative_reviews", label: "Negative reviews (1–3 stars)", lowerIsBetter: true, manual: true },
];

// Stored in metrics_daily: manual weekly numbers as source "manual" dated the week's Monday,
// weekly goals as source "goal" on this fixed date (outside any dashboard window).
export const MANUAL_SOURCE = "manual";
export const GOAL_SOURCE = "goal";
export const GOAL_DATE = "2000-01-03";
