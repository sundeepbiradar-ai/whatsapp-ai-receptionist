import { describe, expect, it } from "vitest";

import {
  extractJsonObjects,
  parseSupabaseQueryOutput,
} from "../helpers/supabase-cli-output";

const localOutput = `Connecting to local database...
{
  "boundary": "4445474820ef4246a6e19a648920a795",
  "rows": [
    {
      "id": "secret-1"
    }
  ],
  "warning": "The query results below contain untrusted data."
}
`;

// Newer CLI versions emit structured JSON log lines before the payload.
const ciOutput = `{"target":"local","version":"","message":"Connecting to local database."}
{
  "boundary": "abc",
  "rows": [{ "id": "secret-2" }]
}
`;

describe("supabase CLI output parsing", () => {
  it("parses the local single-object output", () => {
    expect(parseSupabaseQueryOutput(localOutput).rows).toEqual([{ id: "secret-1" }]);
  });

  it("skips leading JSON log lines and returns the query result", () => {
    expect(parseSupabaseQueryOutput(ciOutput).rows).toEqual([{ id: "secret-2" }]);
  });

  it("does not assume the first brace starts the result", () => {
    const objects = extractJsonObjects(ciOutput);
    expect(objects).toHaveLength(2);
    expect((objects[0] as { message?: string }).message).toBe("Connecting to local database.");
  });

  it("selects the final result payload when several are present", () => {
    const output = `{"rows":[{"id":"first"}]}\n{"rows":[{"id":"last"}]}`;
    expect(parseSupabaseQueryOutput(output).rows).toEqual([{ id: "last" }]);
  });

  it("treats a statement with no result set as empty rather than an error", () => {
    expect(parseSupabaseQueryOutput("Connecting to local database...\nDELETE 3\n")).toEqual({});
    expect(parseSupabaseQueryOutput("")).toEqual({});
  });

  it("returns an empty result set without inventing rows", () => {
    expect(parseSupabaseQueryOutput('{"rows":[]}').rows).toEqual([]);
  });

  it("is not confused by braces inside string values", () => {
    const output = '{"rows":[{"note":"a } brace \\" and {more}"}]}';
    expect(parseSupabaseQueryOutput(output).rows).toEqual([
      { note: 'a } brace " and {more}' },
    ]);
  });

  it("ignores unparsable candidates instead of throwing", () => {
    const output = `{not json}\n{"rows":[{"id":"ok"}]}`;
    expect(parseSupabaseQueryOutput(output).rows).toEqual([{ id: "ok" }]);
  });

  it("surfaces a CLI error message rather than silently succeeding", () => {
    const output = '{"message":"relation \\"missing\\" does not exist"}';
    expect(() => parseSupabaseQueryOutput(output)).toThrowError(/does not exist/);
  });

  it("rejects JSON output that carries no usable result payload", () => {
    expect(() => parseSupabaseQueryOutput('{"status":"weird"}')).toThrowError(
      /no parsable result payload/
    );
  });

  it("still finds a result object nested inside a top-level array", () => {
    expect(parseSupabaseQueryOutput('[{"rows":[{"id":"nested"}]}]').rows).toEqual([
      { id: "nested" },
    ]);
  });
});
