export type SupabaseQueryOutput = { rows?: Array<Record<string, unknown>> };

/**
 * Extracts complete top-level JSON objects from CLI stdout. Brace counting is
 * string-aware so braces inside string values cannot end a candidate early.
 */
export function extractJsonObjects(output: string): unknown[] {
  const objects: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < output.length; index += 1) {
    const character = output[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          objects.push(JSON.parse(output.slice(start, index + 1)));
        } catch {
          // Not a complete JSON object; ignore this candidate.
        }
        start = -1;
      }
    }
  }

  return objects;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Newer Supabase CLI versions emit structured JSON log lines before the query
 * result, so the first `{` is not necessarily the payload. Statements that
 * return no result set emit no JSON at all, which is not an error.
 */
export function parseSupabaseQueryOutput(output: string): SupabaseQueryOutput {
  const candidates = extractJsonObjects(output);
  if (candidates.length === 0) return {};

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = asRecord(candidates[index]);
    if (candidate && Array.isArray(candidate["rows"])) {
      return candidate as SupabaseQueryOutput;
    }
  }

  const last = asRecord(candidates[candidates.length - 1]);
  const message = last?.["message"];
  throw new Error(
    typeof message === "string" && message.trim().length > 0
      ? `Supabase CLI query returned no result rows: ${message}`
      : "Supabase CLI query returned no parsable result payload."
  );
}
