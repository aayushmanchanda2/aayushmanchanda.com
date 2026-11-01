/**
 * /tokens: what my coding agents used, from `data/tokens.json`.
 *
 * That file is the only thing the weekly job on my Mac publishes. This module
 * turns it into strings and touches no DOM, so the page renders the first view
 * at build, `TokenGraph.astro` re-renders in the browser with the same code,
 * and `tokens.test.mjs` loads it under node.
 *
 * Empty days are one `<path>` and a used day is one `<rect>`, so split view
 * stays a few hundred nodes however long the calendar gets.
 */

/** Tokens (input, output and both caches), output alone, cost at list price. */
export type Row = [tokens: number, output: number, cost: number];

export interface TokenData {
  generated: string;
  days: Record<string, Record<string, Row>>;
  /** Keyed by Monday, then app, then model. */
  weeks: Record<string, Record<string, Record<string, Row>>>;
}

export const METRICS = ["tokens", "output", "cost"] as const;
export type Metric = (typeof METRICS)[number];

export interface View {
  metric: Metric;
  split: boolean;
  hidden: Set<string>;
}

/**
 * The graphs start at the first Monday of March 2026, where Claude Code's oldest
 * surviving log starts: earlier squares would say I wasn't using it. The totals
 * stay all-time.
 */
export const GRAPH_START = "2026-03-02";

const COLUMN: Record<Metric, 0 | 1 | 2> = { tokens: 0, output: 1, cost: 2 };
const CELL = 10;
const STEP = 12;
const SHADES = [0.42, 0.58, 0.74, 0.88, 1];
const MODELS_SHOWN = 9;
const BAR_HEIGHT = 96;

const DAY_MS = 86_400_000;
const day = (time: number) => new Date(time).toISOString().slice(0, 10);
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const label = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(time(date));

/**
 * Everything here ends up in `set:html` or `innerHTML`, and app and model names
 * come from a file a job pushes. The exporter refuses odd names; this is the
 * second lock, so a bad name renders as text instead of as markup.
 */
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const classPart = (name: string) => name.replace(/[^a-z0-9-]/gi, "-");

/** "1.2B", "90M", "838K", "12". */
export function compact(value: number): string {
  for (const [size, suffix] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const) {
    if (value >= size) {
      const scaled = value / size;
      return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}${suffix}`;
    }
  }
  return String(Math.round(value));
}

const show = (value: number, metric: Metric) => (metric === "cost" ? `$${compact(value)}` : compact(value));

/** Apps with their all-time tokens, biggest first. The order every list on the page uses. */
export function appTotals(data: TokenData): { app: string; tokens: number }[] {
  const totals = new Map<string, number>();
  for (const apps of Object.values(data.days)) {
    for (const [app, row] of Object.entries(apps)) totals.set(app, (totals.get(app) ?? 0) + row[0]);
  }
  return [...totals].map(([app, tokens]) => ({ app, tokens })).sort((a, b) => b.tokens - a.tokens);
}

/** The all-time numbers at the top of the page. The streak is the run of used days ending on the newest one. */
export function summary(data: TokenData) {
  let tokens = 0;
  let cost = 0;
  for (const apps of Object.values(data.days)) {
    for (const row of Object.values(apps)) {
      tokens += row[0];
      cost += row[2];
    }
  }
  const used = Object.keys(data.days).sort();
  let streak = 0;
  for (let at = time(used.at(-1) as string); data.days[day(at)]; at -= DAY_MS) streak += 1;
  return { tokens, cost, activeDays: used.length, streak, since: used[0] as string };
}

/** Every day from `GRAPH_START` to the file's date, seven to a week. */
function calendar(data: TokenData): string[][] {
  const weeks: string[][] = [];
  for (let at = time(GRAPH_START); at <= time(data.generated); at += DAY_MS) {
    if ((at - time(GRAPH_START)) % (7 * DAY_MS) === 0) weeks.push([]);
    weeks.at(-1)?.push(day(at));
  }
  return weeks;
}

/** Quantiles, not a linear scale: one 3B day would otherwise wash out every other square. */
function shader(values: number[]): (value: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const steps = SHADES.slice(1).map((_, at) => sorted[Math.floor(((at + 1) / SHADES.length) * sorted.length)] ?? 0);
  return (value) => SHADES[steps.filter((step) => value > step).length] as number;
}

function months(weeks: string[][]): string {
  let last = "";
  return weeks
    .map((week, at) => {
      const month = label(week[0] as string, { month: "short" });
      if (month === last) return "";
      last = month;
      return `<span style="left:${((at / weeks.length) * 100).toFixed(2)}%">${month}</span>`;
    })
    .join("");
}

/** One calendar: each square takes its colour from the day's biggest app. */
export function grid(data: TokenData, apps: string[], metric: Metric, name = "All apps"): string {
  const weeks = calendar(data);
  const column = COLUMN[metric];
  const used = weeks.flat().flatMap((date) => {
    const rows = apps
      .map((app) => ({ app, value: data.days[date]?.[app]?.[column] ?? 0 }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
    return rows.length ? [{ date, rows, value: rows.reduce((sum, row) => sum + row.value, 0) }] : [];
  });
  const byDate = new Map(used.map((entry) => [entry.date, entry]));
  const shade = shader(used.map((entry) => entry.value));

  let empty = "";
  let squares = "";
  weeks.forEach((week, x) =>
    week.forEach((date, y) => {
      const entry = byDate.get(date);
      if (!entry) {
        empty += `M${x * STEP + 1} ${y * STEP + 1}h${CELL - 2}v${CELL - 2}h-${CELL - 2}z`;
        return;
      }
      const parts = entry.rows.slice(0, 2).map((row) => `${row.app} ${show(row.value, metric)}`);
      const tip = `${label(date, { month: "short", day: "numeric" })}: ${show(entry.value, metric)} (${parts.join(", ")})`;
      squares += `<rect x="${x * STEP}" y="${y * STEP}" width="${CELL}" height="${CELL}" rx="2" class="app-${classPart(entry.rows[0]?.app ?? "")}" fill-opacity="${shade(entry.value)}" data-tip="${escape(tip)}"/>`;
    }),
  );

  const total = used.reduce((sum, entry) => sum + entry.value, 0);
  const summed = `${name}: ${show(total, metric)} ${metric === "cost" ? "at list price" : metric} across ${used.length} days since March 2026`;
  return `<div class="tg-grid"><div class="tg-months" aria-hidden="true">${months(weeks)}</div><svg viewBox="0 0 ${weeks.length * STEP - 2} ${7 * STEP - 2}" role="img" aria-label="${escape(summed)}"><path class="tg-empty" d="${empty}"/>${squares}</svg></div>`;
}

/** Weekly stacked bars by model. Square-root height, so a quiet week still shows up beside a 5B one. */
export function bars(data: TokenData, apps: string[], metric: Metric): string {
  const weeks = calendar(data).map((week) => week[0] as string);
  const column = COLUMN[metric];
  const perWeek = weeks.map((week) => {
    const models = new Map<string, number>();
    for (const app of apps) {
      for (const [model, row] of Object.entries(data.weeks[week]?.[app] ?? {})) {
        models.set(model, (models.get(model) ?? 0) + row[column]);
      }
    }
    return models;
  });

  const totals = new Map<string, number>();
  for (const models of perWeek) {
    for (const [model, value] of models) totals.set(model, (totals.get(model) ?? 0) + value);
  }
  const top = [...totals].sort((a, b) => b[1] - a[1]).slice(0, MODELS_SHOWN).map(([model]) => model);
  const series = [...top, "other"];
  const biggest = Math.max(...perWeek.map((models) => [...models.values()].reduce((sum, value) => sum + value, 0)), 1);

  const columns = perWeek.map((models, x) => {
    const merged = new Map<string, number>();
    for (const [model, value] of models) {
      const name = top.includes(model) ? model : "other";
      merged.set(name, (merged.get(name) ?? 0) + value);
    }
    const weekTotal = [...merged.values()].reduce((sum, value) => sum + value, 0);
    const height = Math.sqrt(weekTotal / biggest) * BAR_HEIGHT;
    let y = BAR_HEIGHT;
    return series
      .filter((name) => merged.get(name))
      .map((name) => {
        const value = merged.get(name) as number;
        const size = (value / weekTotal) * height;
        y -= size;
        const tip = `Week of ${label(weeks[x] as string, { month: "short", day: "numeric" })}: ${name} ${show(value, metric)}`;
        return `<rect x="${x * STEP}" y="${y.toFixed(1)}" width="${CELL}" height="${size.toFixed(1)}" class="model-${series.indexOf(name) === MODELS_SHOWN ? "other" : series.indexOf(name)}" data-tip="${escape(tip)}"/>`;
      })
      .join("");
  });

  const legend = series
    .filter((name) => totals.has(name) || (name === "other" && totals.size > MODELS_SHOWN))
    .map((name, at) => `<li class="model-${name === "other" ? "other" : at}"><i></i>${escape(name)}</li>`)
    .join("");
  return `<div class="tg-bars"><h3 class="tg-label">By model, per week</h3><svg viewBox="0 0 ${weeks.length * STEP - 2} ${BAR_HEIGHT}" role="img" aria-label="Weekly ${metric} by model, biggest models: ${escape(top.slice(0, 3).join(", "))}">${columns.join("")}</svg><ul class="tg-legend">${legend}</ul></div>`;
}

/** The whole graph for one state of the controls, at build and in the browser. */
export function render(data: TokenData, view: View): string {
  const column = COLUMN[view.metric];
  const apps = appTotals(data)
    .map(({ app }) => app)
    .filter((app) => !view.hidden.has(app));
  const grids = view.split
    ? apps
        .filter((app) => Object.entries(data.days).some(([date, row]) => date >= GRAPH_START && row[app]?.[column]))
        .map((app) => `<div class="tg-one"><h3 class="tg-label">${escape(app)}</h3>${grid(data, [app], view.metric, app)}</div>`)
        .join("")
    : grid(data, apps, view.metric);
  return `<div class="${view.split ? "tg-split" : ""}">${grids}</div>${bars(data, apps, view.metric)}`;
}
