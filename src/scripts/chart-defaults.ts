/**
 * Centralized Chart.js defaults for Global Wealth Portfolio.
 * Apply once at the top of any script that renders charts.
 *
 * Sets a professional, readable font stack aligned with the design system
 * (Inter / Geist family) and improves contrast, weight, and sizing
 * for axis ticks, tooltips, and legends.
 */
import { Chart, type ChartOptions } from "chart.js";

export const CHART_FONT_FAMILY =
  '"Inter", "Geist", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

let applied = false;

export function applyChartDefaults(): void {
  if (applied) return;
  applied = true;

  // Global font defaults — applies to every chart created afterwards.
  Chart.defaults.font.family = CHART_FONT_FAMILY;
  Chart.defaults.font.size = 12;
  Chart.defaults.font.weight = 500;
  Chart.defaults.color = "rgba(60, 70, 85, 0.85)";

  // Tooltip styling + explicitly enable hover/tooltips on every chart
  Chart.defaults.plugins.tooltip.enabled = true;
  Chart.defaults.plugins.tooltip.external = undefined;
  Chart.defaults.plugins.tooltip.titleFont = {
    family: CHART_FONT_FAMILY,
    size: 12,
    weight: 600,
  };
  Chart.defaults.plugins.tooltip.bodyFont = {
    family: CHART_FONT_FAMILY,
    size: 12,
    weight: 500,
  };
  Chart.defaults.plugins.tooltip.footerFont = {
    family: CHART_FONT_FAMILY,
    size: 11,
    weight: 500,
  };
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
  Chart.defaults.plugins.tooltip.cornerRadius = 6;
  Chart.defaults.plugins.tooltip.boxWidth = 8;
  Chart.defaults.plugins.tooltip.boxHeight = 8;
  Chart.defaults.plugins.tooltip.usePointStyle = true;

  // Hover & interaction defaults — applied to every chart so the tooltip
  // appears as soon as the cursor moves over the plot area, even between data
  // points. `index` mode highlights the whole dataset column/segment.
  Chart.defaults.interaction.mode = "index";
  Chart.defaults.interaction.intersect = false;
  Chart.defaults.interaction.axis = "x";
  Chart.defaults.hover.mode = "index";
  Chart.defaults.hover.intersect = false;
  Chart.defaults.hover.animationDuration = 200;

  // Per-element hover behavior so points/bars visibly react to the cursor.
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.point.hoverBorderWidth = 2;
  if (Chart.defaults.elements.bar) Chart.defaults.elements.bar.hoverBorderWidth = 0;
  Chart.defaults.elements.arc.hoverOffset = 8;

  // Legend defaults
  Chart.defaults.plugins.legend.labels.font = {
    family: CHART_FONT_FAMILY,
    size: 12,
    weight: 500,
  };
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.padding = 12;

  // Layout breathing room
  Chart.defaults.layout.padding = 4;

  // Animation polish
  Chart.defaults.animation.duration = 350;
  Chart.defaults.animation.easing = "easeOutQuart";
}

/** Read a CSS variable from :root with a sensible fallback. */
export function cssVar(name: string, fallback = "#171717"): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

/** Standardized axis styling. Pass theme-aware colors from the page. */
export function axisOptions(opts: {
  tickColor: string;
  gridColor: string;
  beginAtZero?: boolean;
}): NonNullable<ChartOptions<"line">["scales"]> {
  return {
    x: {
      grid: { display: false },
      ticks: {
        color: opts.tickColor,
        font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 },
      },
    },
    y: {
      beginAtZero: opts.beginAtZero ?? false,
      grid: { color: opts.gridColor },
      ticks: {
        color: opts.tickColor,
        font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 },
      },
    },
  };
}
