/**
 * Frontmatter (+ markdown body) parser/serializer for the Studio.
 *
 * Backed by the `yaml` library (YAML 1.2 core schema) so it round-trips every
 * shape the content collections use — multiline strings, strings that look
 * like numbers ("07430"), nested lists of objects — without data loss. The
 * previous hand-rolled parser truncated multiline values and coerced numeric
 * strings; this one is a real YAML engine with a stable, predictable output.
 *
 * The `---` fence handling is kept deliberately simple: a document is a YAML
 * block between two `---` lines followed by the markdown body.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface Doc { data: Record<string, any>; body: string }

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;

/* --------------------------------------------------------------- parsing */
export function parse(raw: string): Doc {
  const m = raw.match(FENCE);
  if (!m) return { data: {}, body: raw };
  let data: unknown;
  try {
    data = parseYaml(m[1]);
  } catch (e: any) {
    throw new Error(`This file's frontmatter isn't valid YAML: ${e?.message || e}`);
  }
  if (data == null) data = {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('This file\'s frontmatter must be a YAML mapping (key: value lines).');
  }
  return { data: normalize(data as Record<string, any>), body: m[2] ?? '' };
}

/** Dates are kept as strings (core schema never yields Date objects), but be
 * defensive in case a value arrives as a Date from elsewhere. */
function normalize(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
  return out;
}

/* ------------------------------------------------------------ serializing */
export function stringify(doc: Doc): string {
  const data = stripEmpty(doc.data);
  const yaml = Object.keys(data).length ? stringifyYaml(data, { lineWidth: 0 }) : '';
  const body = (doc.body ?? '').replace(/^\r?\n/, '');
  return `---\n${yaml}---\n${body}`;
}

/** Drop keys whose value is undefined/null so we never write `key: null`. Empty
 * strings are preserved for callers that rely on them; use cleanForSchema()
 * before validation to strip those too. */
function stripEmpty(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Prepare form data for validation + saving: remove blank optional values
 * ("" / null / undefined) and blank list items so optional schema fields
 * (e.g. `externalLink: z.string().url().optional()`) don't fail on an empty
 * input the author never touched. Booleans and numbers (including 0/false)
 * are always kept.
 */
export function cleanForSchema(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v)) {
      const items = v.filter((it) => !(it === undefined || it === null || (typeof it === 'string' && it.trim() === '')));
      out[k] = items;
      continue;
    }
    out[k] = v;
  }
  return out;
}
