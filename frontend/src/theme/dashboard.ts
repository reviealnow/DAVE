import type { CSSProperties } from "react";

/**
 * Spacing scale mirrored from the Luna design-system "Spacing – Dashboards"
 * reference: a 16px workhorse unit (spacing-100) with an 8px half-step
 * (spacing-50). Use these instead of ad-hoc 6/10/12 values so the dashboard
 * keeps a consistent rhythm — 16px gutters between cards and inside card
 * padding, 8px for tight label/title pairs.
 */
export const SP = {
  /** spacing-50 — tight pairs (title↔subtitle, icon↔heading). */
  xs: 8,
  /** spacing-100 — the dominant unit: gutters, card padding, section gaps. */
  md: 16,
  /** spacing-200 — generous separation when a block needs to breathe. */
  lg: 24,
} as const;

/**
 * Shared card surface for dashboard sections: white background, hairline
 * border, soft shadow, 8px radius and a 16px (spacing-100) inner pad. Vertical
 * rhythm between cards is owned by the page-level flex `gap`, so cards
 * deliberately carry no bottom margin.
 */
export const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  padding: SP.md,
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
};

/** Section heading inside a card: bold title aligned to the card's top edge. */
export const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  color: "#1f2937",
};

/** Muted subtitle shown 8px under a card title (Luna title/subtitle pattern). */
export const cardSubtitleStyle: CSSProperties = {
  margin: `${SP.xs}px 0 0`,
  fontSize: 12,
  color: "#6b7280",
};
