/**
 * A tool's verdict history (VET-54): the verdicts it had before the current
 * one, stored as `verdict_history` in tools.json, oldest first. Stored rather
 * than read from `git log` at build, because Vercel builds a shallow clone and
 * the history would vanish there without a word. Seeded once from git; when a
 * verdict changes, the old verdict and its `status_date` move into the list.
 */
import type { Fail } from "./parse.ts";
import { readers } from "./parse.ts";

export interface VerdictStep<V extends string = string> {
  verdict: V;
  date: string;
}

const READ = readers("tools.json");
/** Annotated, or TypeScript stops treating a call as the end of control flow. */
const fail: Fail = READ.fail;
const { readDate, isRecord } = READ;

/** The stored list, checked: known verdicts, dates ascending, none after `status_date`. */
export function readHistory<V extends string>(value: unknown, where: string, verdicts: readonly V[], current: string): VerdictStep<V>[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length === 0) fail(where, `needs "verdict_history" to be a non-empty array, or no key`);
  let last = "";
  return value.map((step: unknown, index) => {
    const at = `${where} verdict_history[${index}]`;
    if (!isRecord(step) || !verdicts.includes(step["verdict"] as V)) fail(at, `needs "verdict" to be one of ${verdicts.join(", ")}`);
    const date = readDate(step, "date", at);
    if (date <= last || date > current) fail(at, `needs dates oldest first and none after "status_date"`);
    last = date;
    return { verdict: step["verdict"] as V, date };
  });
}

/** Every verdict, newest first, the current one on top. The page shows it only from two. */
export function verdictHistory<V extends string>(tool: { verdict: V; status_date: string; verdict_history: VerdictStep<V>[] }): VerdictStep<V>[] {
  return [{ verdict: tool.verdict, date: tool.status_date }, ...[...tool.verdict_history].reverse()];
}
