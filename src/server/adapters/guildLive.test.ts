import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuditLog } from "@/server/audit";
import { createLiveGuildAdapter, resetLiveGuild } from "./guildLive";

const RUN = "run_guild_live";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("Guild.ai — live adapter", () => {
  beforeEach(() => {
    vi.stubEnv("GUILD_API_KEY", "assessment_id:assessment_secret");
    vi.stubEnv("GUILD_LESSON_PLANNER_API_KEY", "lesson_id:lesson_secret");
    vi.stubEnv("GUILD_WORKSPACE", "mem-in-motion/atrium");
    resetLiveGuild();
    resetAuditLog();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts a session on assessment-agent with Basic Auth from GUILD_API_KEY", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: "session_1" }));
    const guild = createLiveGuildAdapter();

    const gate = await guild.requestApproval({
      run_id: RUN,
      gate_type: "low_confidence_grade",
      subject_id: "sub_7",
      reason: "Confidence 0.41 on integer_operations item 3.",
      evidence_refs: ["sub_7"],
    });

    expect(gate.gate_id).toBe("session_1");
    expect(gate.status).toBe("pending");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://app.guild.ai/api/workspaces/mem-in-motion/atrium/sessions");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("assessment_id:assessment_secret").toString("base64")}`,
    );
    const body = JSON.parse(init?.body as string);
    expect(body.session_type).toBe("api_trigger");
    expect(body.agent_input.text).toContain("sub_7");
  });

  it("uses the lesson-planner credential for the final_plan gate", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: "session_2" }));
    const guild = createLiveGuildAdapter();

    await guild.requestApproval({
      run_id: RUN,
      gate_type: "final_plan",
      subject_id: "lesson_planner",
      reason: "Educator sign-off required.",
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("lesson_id:lesson_secret").toString("base64")}`);
  });

  it("routes curriculum review through the lesson-planner gate with curriculum copy", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: "session_curriculum" }));
    const guild = createLiveGuildAdapter();

    await guild.requestApproval({
      run_id: "draft_0001",
      gate_type: "curriculum_draft",
      subject_id: "draft_0001",
      reason: "Educator review required before publication.",
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("lesson_id:lesson_secret").toString("base64")}`,
    );
    const body = JSON.parse(init?.body as string);
    expect(body.agent_input.text).toContain("cited curriculum draft");
    expect(body.agent_input.text).toContain("Do not launch a classroom run");
  });

  it("resolves a gate locally and forwards the decision into the Guild session", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "session_3" }))
      .mockResolvedValueOnce(jsonResponse({}));
    const guild = createLiveGuildAdapter();

    const gate = await guild.requestApproval({
      run_id: RUN,
      gate_type: "low_confidence_grade",
      subject_id: "sub_9",
      reason: "Ambiguous work.",
    });

    const resolved = await guild.resolveApproval(gate.gate_id, "approved");
    expect(resolved?.status).toBe("approved");
    expect(resolved?.resolved_at).not.toBeNull();

    const [url, init] = fetchSpy.mock.calls[1];
    expect(url).toBe("https://app.guild.ai/api/sessions/session_3/events");
    expect(JSON.parse(init?.body as string)).toMatchObject({ mode: "text" });

    expect(await guild.resolveApproval("gate_missing", "approved")).toBeNull();
  });

  it("keeps agent registry and handoffs as local bookkeeping, without any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const guild = createLiveGuildAdapter();

    const registered = await guild.registerDefaultAgents();
    expect(registered).toHaveLength(9);

    const handoff = await guild.handoff({
      run_id: RUN,
      from_agent: "grouping_agent",
      to_agent: "accessibility_agent",
      reason: "Rooms formed; delivery supports needed.",
      payload_refs: ["ember"],
    });
    expect(handoff.handoff_id).toMatch(/^handoff_\d{3}$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
