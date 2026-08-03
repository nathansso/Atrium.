/**
 * Sponsor adapter interfaces — the seam every lane codes against.
 *
 * Atrium integrates exactly four mandated technologies, each with one
 * non-overlapping, load-bearing job:
 *
 *   FalkorDB   memory  the classroom knowledge graph; multi-hop Cypher
 *                      *performs* room formation, it is not a passive store
 *   LaserData  live    Apache Iggy topic per run; submissions stream in,
 *                      agent events stream out, UI replays by real offset
 *   RocketRide motion  .pipe pipelines that extract concepts, generate
 *                      variants, and synthesise lesson plans
 *   Guild.ai   agents  the eight specialist agents, their handoffs, and
 *                      human-in-the-loop approval gates
 *
 * Note: the Laser SDK also ships a graph, a KV store and an agent runtime.
 * We deliberately use only its streaming layer, so FalkorDB and Guild.ai
 * keep real work rather than becoming decorative imports.
 *
 * Agent code depends on these types only — never on a concrete
 * implementation — so mock and live swap without touching business logic.
 */
import type { z } from "zod";
import type {
  AgentEvent,
  AgentName,
  AgentResultStatus,
  ConceptId,
  MasteryEstimate,
  MisconceptionId,
  ResearchClaim,
  ResearchSource,
  Room,
  SupportId,
} from "@/contracts";
import type { AdapterName, SponsorMode } from "@/server/config";
import type { EventInput, EventListener } from "@/server/events";

export type AdapterInfo = {
  name: AdapterName;
  mode: SponsorMode;
  provider: string;
};

// ---------------------------------------------------------------------------
// FalkorDB — the memory layer (knowledge graph)
// ---------------------------------------------------------------------------

/**
 * Graph shape:
 *
 *   (Student)-[:HAS_MASTERY {level, updated_at}]->(Concept)
 *   (Student)-[:EXHIBITED {run_id, at}]->(Misconception)
 *   (Misconception)-[:BLOCKS]->(Concept)
 *   (Student)-[:NEEDS]->(Support)
 *   (Student)-[:MEMBER_OF {run_id}]->(Room)
 *   (Room)-[:FOCUSES_ON]->(Concept)
 *
 * The two-hop path Student -> Misconception -> Concept is what makes room
 * formation relationship-aware: a flat vector search cannot see that two
 * students fail the same concept for *different* reasons.
 */

export type MasteryRecord = {
  student_id: string;
  concept_id: ConceptId;
  mastery: MasteryEstimate;
  updated_at: string;
};

export type MisconceptionEdge = {
  student_id: string;
  misconception_id: MisconceptionId;
  concept_id: ConceptId;
  run_id: string;
  evidence_refs: string[];
  at: string;
};

/** A student who shares a barrier with others, plus why the graph says so. */
export type SharedBarrierGroup = {
  misconception_id: MisconceptionId;
  concept_id: ConceptId;
  student_ids: string[];
  /** Human-readable Cypher path, surfaced in the UI graph panel. */
  path_explanation: string;
};

/** Node + edge slice for rendering the graph panel. */
export type GraphNeighborhood = {
  nodes: Array<{ id: string; label: string; kind: string; props: Record<string, unknown> }>;
  edges: Array<{ from: string; to: string; kind: string; props: Record<string, unknown> }>;
};

export interface FalkorGraphAdapter {
  info(): AdapterInfo;
  /** Create indices/constraints. Idempotent; safe to call on every boot. */
  ensureSchema(): Promise<void>;
  /** Seed or refresh mastery edges. Returns count written. */
  upsertMastery(records: MasteryRecord[]): Promise<number>;
  getMastery(studentId: string, conceptId?: ConceptId): Promise<MasteryRecord[]>;
  /** Record that a student exhibited a misconception blocking a concept. */
  recordMisconception(edge: Omit<MisconceptionEdge, "at">): Promise<MisconceptionEdge>;
  /**
   * THE load-bearing query. Multi-hop traversal grouping students by the
   * *barrier* they share, not merely the concept they failed.
   */
  findSharedBarriers(concepts: ConceptId[], options?: { runId?: string; minGroupSize?: number }): Promise<SharedBarrierGroup[]>;
  /** Persist a room formation so membership changes are queryable over time. */
  saveRoomFormation(runId: string, rooms: Room[]): Promise<number>;
  /** Mastery over time for one student — the "memory compounds" story. */
  masteryTrajectory(studentId: string, conceptId: ConceptId): Promise<MasteryRecord[]>;
  /** Accessibility supports attached to a student. */
  getSupports(studentId: string): Promise<SupportId[]>;
  /** Node/edge slice for the UI graph panel. */
  neighborhood(nodeId: string, depth?: number): Promise<GraphNeighborhood>;
  /** Escape hatch for one-off Cypher (demo queries, debugging). */
  query<T = unknown>(cypher: string, params?: Record<string, unknown>): Promise<T[]>;
}

// ---------------------------------------------------------------------------
// LaserData — the live data layer (streaming only)
// ---------------------------------------------------------------------------

/** An event plus its durable offset in the run's Iggy topic. */
export type StreamedEvent = {
  event: AgentEvent;
  offset: bigint;
};

export type StreamSubscriptionOptions = {
  /** Inclusive durable offset. Omit to receive only newly published events. */
  fromOffset?: bigint;
  onError?: (error: unknown) => void;
};

/** Live student activity arriving mid-run — the "motion" input signal. */
export type ActivityRecord = {
  run_id: string;
  student_id: string;
  kind: "submission" | "attempt" | "hint_request" | "idle";
  payload: Record<string, unknown>;
  observed_at: string;
};

export interface LaserStreamAdapter {
  info(): AdapterInfo;
  /** Ensure the run's topic exists with the given partition count. */
  ensureTopic(runId: string, partitions?: number): Promise<void>;
  /** Publish an already-built event envelope onto the run topic. */
  publish(event: AgentEvent): Promise<void>;
  /** Build (id + timestamp) and publish an event. Returns the envelope. */
  emit(input: EventInput): Promise<AgentEvent>;
  /** Produce a live student-activity record onto the run topic. */
  ingestActivity(activity: ActivityRecord): Promise<void>;
  /**
   * Subscribe to a run topic. Delivery is at-least-once, so the listener
   * must be idempotent. Returns an unsubscribe function.
   */
  subscribe(
    runId: string,
    onEvent: EventListener,
    options?: StreamSubscriptionOptions,
  ): () => void;
  /** Durable replay from an offset — this is what the UI scrubber reads. */
  replay(runId: string, fromOffset?: bigint): Promise<StreamedEvent[]>;
  /** Highest durable record offset for the run topic. */
  latestOffset(runId: string): Promise<bigint>;
  /** Run topics this connection has seen. */
  listTopics(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// RocketRide — the motion layer (pipeline execution)
// ---------------------------------------------------------------------------

/** Each task maps to one .pipe pipeline on the RocketRide server. */
export type PipelineTask =
  | "concept_extraction"
  | "variant_generation"
  | "misconception_explanation"
  | "lesson_plan_synthesis";

export type PipelineRequest = {
  task: PipelineTask;
  prompt: string;
  context?: Record<string, unknown>;
  /** Raw upload (assignment PDF/image) routed through OCR/NER nodes. */
  attachment?: { data: Uint8Array | string; mimeType: string; name: string };
};

export type PipelineResult<T = unknown> = {
  task: PipelineTask;
  provider: string;
  deterministic: boolean;
  /** RocketRide task token, kept for status polling and the audit trail. */
  token: string | null;
  output: T;
};

export interface RocketRidePipelineAdapter {
  info(): AdapterInfo;
  /**
   * Run a pipeline to completion. When a Zod schema is passed the output is
   * validated before it is returned.
   */
  run<T = unknown>(request: PipelineRequest, schema?: z.ZodType<T>): Promise<PipelineResult<T>>;
  /** Pipelines currently registered on the server. */
  listPipelines(): Promise<string[]>;
  /**
   * Override the deterministic response for a task. Mock mode only — this
   * is how the demo stays reproducible without the network.
   */
  setMockResponse(task: PipelineTask, output: unknown): void;
}

// ---------------------------------------------------------------------------
// Guild.ai — the multi-agent layer
// ---------------------------------------------------------------------------

export type GuildAgentRecord = {
  agent: AgentName;
  registered_at: string;
  permissions: string[];
};

export type GuildRunRecord = {
  run_id: string;
  agent: AgentName;
  status: AgentResultStatus;
  confidence: number;
  evidence_refs: string[];
  human_review_required: boolean;
  recorded_at: string;
};

/** An explicit handoff between two specialist agents. */
export type AgentHandoff = {
  handoff_id: string;
  run_id: string;
  from_agent: AgentName;
  to_agent: AgentName;
  reason: string;
  payload_refs: string[];
  at: string;
};

export type ApprovalGateType =
  | "low_confidence_grade"
  | "final_plan"
  | "curriculum_draft";

export type ApprovalGate = {
  gate_id: string;
  run_id: string;
  gate_type: ApprovalGateType;
  subject_id: string;
  reason: string;
  evidence_refs: string[];
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  resolved_at: string | null;
};

/** A durable Guild trace. Guild is the system of record for workflow history. */
export type GuildTrace = {
  trace_id: string;
  run_id: string;
  actor: AgentName | "system" | "professor";
  action: string;
  evidence_refs: string[];
  review_gate: boolean;
  timestamp: string;
  details?: Record<string, unknown>;
};

export type GuildTraceInput = Omit<GuildTrace, "trace_id" | "timestamp" | "evidence_refs" | "review_gate"> & {
  evidence_refs?: string[];
  review_gate?: boolean;
};

export interface GuildAgentAdapter {
  info(): AdapterInfo;
  /** Register one agent. Idempotent per agent name. */
  registerAgent(agent: AgentName, permissions?: string[]): Promise<GuildAgentRecord>;
  /** Register all eight contract agents with default permissions. */
  registerDefaultAgents(): Promise<GuildAgentRecord[]>;
  listAgents(): Promise<GuildAgentRecord[]>;
  /** Store an agent run; opens an approval gate when review is required. */
  recordAgentRun(record: Omit<GuildRunRecord, "recorded_at">): Promise<GuildRunRecord>;
  getAgentRuns(runId: string): Promise<GuildRunRecord[]>;
  /** Hand work from one specialist agent to the next. */
  handoff(input: Omit<AgentHandoff, "handoff_id" | "at">): Promise<AgentHandoff>;
  listHandoffs(runId: string): Promise<AgentHandoff[]>;
  /** Human-in-the-loop: pause and route a decision to a person. */
  requestApproval(input: {
    run_id: string;
    gate_type: ApprovalGateType;
    subject_id: string;
    reason: string;
    evidence_refs?: string[];
  }): Promise<ApprovalGate>;
  listApprovals(runId: string): Promise<ApprovalGate[]>;
  resolveApproval(gateId: string, decision: "approved" | "rejected"): Promise<ApprovalGate | null>;
  /** Append a workflow trace. Replaces Atrium's former local audit log. */
  recordTrace(input: GuildTraceInput): Promise<GuildTrace>;
  /** Return the authoritative, run-scoped execution history. */
  listTraces(runId: string): Promise<GuildTrace[]>;
}

// ---------------------------------------------------------------------------
// Firecrawl — the research layer (source-grounded web search)
// ---------------------------------------------------------------------------
//
// Firecrawl is an upstream research provider: a topic goes in, a bounded set of
// citable sources and source-backed claims comes out. It performs retrieval and
// grounding only — the pedagogy (concepts, prerequisites, chunks, checks) is the
// Curriculum Research agent's job, built on top of what this returns. Unlike the
// four mandated sponsors it has no persistence or event-spine role, so it is a
// plain adapter its agent calls directly.

export type FirecrawlSearchQuery = {
  topic: string;
  audience: string;
  /** Hard upper bound on returned sources. */
  maxResults: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  /** ISO date; the provider is asked to prefer sources newer than this. */
  fromDate?: string | null;
  teachingIntent?: string;
};

export type FirecrawlResearchResult = {
  provider: string;
  /** True when the result came from the deterministic offline fixture. */
  deterministic: boolean;
  sources: ResearchSource[];
  claims: ResearchClaim[];
};

export interface FirecrawlResearchAdapter {
  info(): AdapterInfo;
  /**
   * Run a bounded, source-grounded search. Sources and claims are validated
   * against the contract schemas at the boundary, so unstructured narrative
   * output can never reach the curriculum layer.
   */
  research(query: FirecrawlSearchQuery): Promise<FirecrawlResearchResult>;
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export type SponsorAdapters = {
  falkordb: FalkorGraphAdapter;
  laser: LaserStreamAdapter;
  rocketride: RocketRidePipelineAdapter;
  guild: GuildAgentAdapter;
  firecrawl: FirecrawlResearchAdapter;
};
