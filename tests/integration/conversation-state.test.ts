/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import type { IntentResult } from "@/lib/ai/intent";

type Config = { url: string; anonKey: string; serviceRoleKey: string };

function loadConfig(): Config | null {
  const url = process.env["SUPABASE_TEST_URL"];
  const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
  const serviceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
  return url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
}

const config = loadConfig();
const integrationDescribe = config ? describe : describe.skip;

const session = vi.hoisted(() => ({
  organizationId: "",
  client: null as unknown,
}));

const detect = vi.hoisted(() =>
  vi.fn(
    async (input: { messageText: string }): Promise<IntentResult> => ({
      intent: input.messageText.toLowerCase().includes("cancel")
        ? "cancel_appointment"
        : "book_appointment",
      requiresClarification: false,
      reason: "classified",
    })
  )
);

vi.mock("server-only", () => ({}));
// The model is never called in integration; only the database path is exercised.
vi.mock("@/lib/ai/intent-classifier", () => ({ detectIntent: detect }));
vi.mock("@/lib/domain/context", () => ({
  requireDomainOrganization: vi.fn(async () => ({
    status: "ready",
    currentOrganization: { id: session.organizationId },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => session.client),
}));

const { buildConversationState } = await import("@/lib/ai/conversation-state");

function client(key: string): SupabaseClient<Database> {
  return createClient<Database>(config!.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

integrationDescribe("Phase 6.2 conversation state", () => {
  let admin: SupabaseClient<Database>;
  let userAClient: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  let conversationAId: string;
  let conversationBId: string;
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  async function createMember(label: string, runId: string, organizationId: string): Promise<string> {
    const email = `state-${label}-${runId}@example.com`;
    const password = `State-${randomUUID()}-A9!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("user");
    userIds.push(created.data.user.id);
    const membership = await admin
      .from("organization_members")
      .insert({ organization_id: organizationId, user_id: created.data.user.id, role: "owner" });
    if (membership.error) throw membership.error;
    const authed = client(config!.anonKey);
    const signIn = await authed.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    userAClient = authed;
    return created.data.user.id;
  }

  async function seedMessage(
    organizationId: string,
    conversationId: string,
    direction: "inbound" | "outbound",
    content: string,
    createdAt: string
  ): Promise<string> {
    const inserted = await admin
      .from("messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        direction,
        content,
        created_at: createdAt,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    return inserted.data.id;
  }

  beforeAll(async () => {
    admin = client(config!.serviceRoleKey);
    const runId = randomUUID();

    const organizations = await admin
      .from("organizations")
      .insert([
        { name: `State A ${runId}`, slug: `state-a-${runId}` },
        { name: `State B ${runId}`, slug: `state-b-${runId}` },
      ])
      .select("id, slug");
    if (organizations.error) throw organizations.error;
    organizationAId = organizations.data.find((row) => row.slug.startsWith("state-a"))!.id;
    organizationBId = organizations.data.find((row) => row.slug.startsWith("state-b"))!.id;
    organizationIds.push(organizationAId, organizationBId);

    // Identical contact details in both tenants prove isolation is not name-based.
    const contacts = await admin
      .from("contacts")
      .insert([
        { organization_id: organizationAId, phone: "+14155550300", name: "Alex Shared" },
        { organization_id: organizationBId, phone: "+14155550300", name: "Alex Shared" },
      ])
      .select("id, organization_id");
    if (contacts.error) throw contacts.error;

    const conversations = await admin
      .from("conversations")
      .insert([
        {
          organization_id: organizationAId,
          contact_id: contacts.data.find((row) => row.organization_id === organizationAId)!.id,
          status: "open",
        },
        {
          organization_id: organizationBId,
          contact_id: contacts.data.find((row) => row.organization_id === organizationBId)!.id,
          status: "open",
        },
      ])
      .select("id, organization_id");
    if (conversations.error) throw conversations.error;
    conversationAId = conversations.data.find((row) => row.organization_id === organizationAId)!.id;
    conversationBId = conversations.data.find((row) => row.organization_id === organizationBId)!.id;

    await createMember("a", runId, organizationAId);

    await seedMessage(organizationAId, conversationAId, "inbound", "hello there", "2026-01-01T10:00:00Z");
    await seedMessage(organizationAId, conversationAId, "outbound", "How can we help?", "2026-01-01T10:01:00Z");
    await seedMessage(organizationAId, conversationAId, "inbound", "please cancel it", "2026-01-01T10:02:00Z");
    await seedMessage(organizationAId, conversationAId, "outbound", "One moment", "2026-01-01T10:03:00Z");

    await seedMessage(organizationBId, conversationBId, "inbound", "TENANT-B-SECRET", "2026-01-01T10:00:00Z");

    session.organizationId = organizationAId;
    session.client = userAClient;
  });

  afterAll(async () => {
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  });

  it("loads real history for a conversation the member owns", async () => {
    const state = await buildConversationState({ conversationId: conversationAId });
    expect(state.organizationId).toBe(organizationAId);
    expect(state.conversationId).toBe(conversationAId);
    expect(state.isConversationOpen).toBe(true);
    expect(state.recentMessages).toHaveLength(4);
  });

  it("returns history in chronological order from the database", async () => {
    const state = await buildConversationState({ conversationId: conversationAId });
    expect(state.recentMessages.map((entry) => entry.content)).toEqual([
      "hello there",
      "How can we help?",
      "please cancel it",
      "One moment",
    ]);
  });

  it("selects the newest inbound message when the newest message is outbound", async () => {
    const state = await buildConversationState({ conversationId: conversationAId });
    expect(state.latestInboundMessageText).toBe("please cancel it");
    expect(state.hasRecentInboundMessage).toBe(true);
    expect(state.detectedIntent).toBe("cancel_appointment");
  });

  it("bounds the history window to the newest messages", async () => {
    const runId = randomUUID();
    const contact = await admin
      .from("contacts")
      .insert({ organization_id: organizationAId, phone: `+1415555${runId.slice(0, 4)}`, name: "Bulk" })
      .select("id")
      .single();
    if (contact.error) throw contact.error;
    const conversation = await admin
      .from("conversations")
      .insert({ organization_id: organizationAId, contact_id: contact.data.id, status: "open" })
      .select("id")
      .single();
    if (conversation.error) throw conversation.error;

    for (let index = 0; index < 25; index += 1) {
      await seedMessage(
        organizationAId,
        conversation.data.id,
        "inbound",
        `message ${index}`,
        new Date(Date.UTC(2026, 0, 2, 10, index)).toISOString()
      );
    }

    const state = await buildConversationState({ conversationId: conversation.data.id });
    expect(state.recentMessages).toHaveLength(20);
    expect(state.recentMessages[0]?.content).toBe("message 5");
    expect(state.recentMessages.at(-1)?.content).toBe("message 24");
    expect(state.latestInboundMessageText).toBe("message 24");
  });

  it("cannot load a conversation belonging to another organization", async () => {
    await expect(
      buildConversationState({ conversationId: conversationBId })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("never exposes another tenant's message content", async () => {
    const state = await buildConversationState({ conversationId: conversationAId });
    expect(JSON.stringify(state)).not.toContain("TENANT-B-SECRET");
    expect(state.recentMessages.every((entry) => entry.content !== "TENANT-B-SECRET")).toBe(true);
  });

  it("rejects a conversation id that does not exist", async () => {
    await expect(buildConversationState({ conversationId: randomUUID() })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("does not write anything while deriving state", async () => {
    const before = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationAId);
    await buildConversationState({ conversationId: conversationAId });
    const after = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationAId);
    expect(after.count).toBe(before.count);

    const conversation = await admin
      .from("conversations")
      .select("status")
      .eq("id", conversationAId)
      .single();
    expect(conversation.data?.status).toBe("open");
  });
});
