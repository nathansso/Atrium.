/**
 * Mock FalkorDB adapter: an in-memory property graph with the same node and
 * edge shape as the live Cypher implementation.
 *
 * findSharedBarriers() walks the same two-hop path the real query does
 * (Student -> Misconception -> Concept) so grouping behaviour is identical
 * offline and online. Everything is deterministic — no clock-dependent
 * ordering, no map-iteration surprises — so the demo replays the same way
 * every time.
 */
import type { ConceptId, MisconceptionId, Room, SupportId } from "@/contracts";
import type {
  AdapterInfo,
  FalkorGraphAdapter,
  GraphNeighborhood,
  CurriculumEvidence,
  MasteryRecord,
  MisconceptionEdge,
  SharedBarrierGroup,
} from "./types";

type FalkorState = {
  /** `${student_id}::${concept_id}` -> ordered history, newest last. */
  mastery: Map<string, MasteryRecord[]>;
  misconceptions: MisconceptionEdge[];
  supports: Map<string, SupportId[]>;
  /** `${run_id}` -> rooms as formed. */
  rooms: Map<string, Room[]>;
  curriculumEvidence: Map<string, GraphNeighborhood>;
  schemaReady: boolean;
};

const GLOBAL_KEY = "__atrium_falkor_mock__";

function getState(): FalkorState {
  const store = globalThis as Record<string, unknown>;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = {
      mastery: new Map(),
      misconceptions: [],
      supports: new Map(),
      rooms: new Map(),
      curriculumEvidence: new Map(),
      schemaReady: false,
    } satisfies FalkorState;
  }
  return store[GLOBAL_KEY] as FalkorState;
}

function masteryKey(studentId: string, conceptId: ConceptId): string {
  return `${studentId}::${conceptId}`;
}

export function createMockFalkorAdapter(): FalkorGraphAdapter {
  const adapter: FalkorGraphAdapter = {
    info(): AdapterInfo {
      return { name: "falkordb", mode: "mock", provider: "in-memory-graph" };
    },

    async ensureSchema(): Promise<void> {
      getState().schemaReady = true;
    },

    async upsertMastery(records: MasteryRecord[]): Promise<number> {
      const state = getState();
      for (const record of records) {
        const key = masteryKey(record.student_id, record.concept_id);
        const history = state.mastery.get(key) ?? [];
        history.push(record);
        state.mastery.set(key, history);
      }
      return records.length;
    },

    async getMastery(studentId: string, conceptId?: ConceptId): Promise<MasteryRecord[]> {
      const state = getState();
      const latest: MasteryRecord[] = [];
      for (const [key, history] of state.mastery) {
        const [student, concept] = key.split("::");
        if (student !== studentId) continue;
        if (conceptId && concept !== conceptId) continue;
        const newest = history.at(-1);
        if (newest) latest.push(newest);
      }
      return latest.sort((a, b) => a.concept_id.localeCompare(b.concept_id));
    },

    async recordMisconception(edge): Promise<MisconceptionEdge> {
      const stored: MisconceptionEdge = { ...edge, at: new Date().toISOString() };
      getState().misconceptions.push(stored);
      return stored;
    },

    /**
     * The load-bearing traversal. Groups students by the *barrier* they share,
     * not the concept they failed — two students can fail the same concept for
     * entirely different reasons and belong in different rooms.
     */
    async findSharedBarriers(
      concepts: ConceptId[],
      options?: { runId?: string; minGroupSize?: number },
    ): Promise<SharedBarrierGroup[]> {
      const state = getState();
      const minGroupSize = options?.minGroupSize ?? 2;
      const wanted = new Set<string>(concepts);

      // Group by (misconception, concept) — the middle node of the two-hop path.
      const buckets = new Map<string, { misconception: MisconceptionId; concept: ConceptId; students: Set<string> }>();

      for (const edge of state.misconceptions) {
        if (!wanted.has(edge.concept_id)) continue;
        if (options?.runId && edge.run_id !== options.runId) continue;
        const key = `${edge.misconception_id}::${edge.concept_id}`;
        const bucket = buckets.get(key) ?? {
          misconception: edge.misconception_id,
          concept: edge.concept_id,
          students: new Set<string>(),
        };
        bucket.students.add(edge.student_id);
        buckets.set(key, bucket);
      }

      return [...buckets.values()]
        .filter((bucket) => bucket.students.size >= minGroupSize)
        .map((bucket) => ({
          misconception_id: bucket.misconception,
          concept_id: bucket.concept,
          student_ids: [...bucket.students].sort(),
          path_explanation: `(Student)-[:EXHIBITED]->(:Misconception {id:'${bucket.misconception}'})-[:BLOCKS]->(:Concept {id:'${bucket.concept}'})`,
        }))
        .sort((a, b) =>
          a.concept_id === b.concept_id
            ? a.misconception_id.localeCompare(b.misconception_id)
            : a.concept_id.localeCompare(b.concept_id),
        );
    },

    async saveRoomFormation(runId: string, rooms: Room[]): Promise<number> {
      getState().rooms.set(runId, rooms);
      return rooms.length;
    },

    async masteryTrajectory(studentId: string, conceptId: ConceptId): Promise<MasteryRecord[]> {
      return [...(getState().mastery.get(masteryKey(studentId, conceptId)) ?? [])];
    },

    async getSupports(studentId: string): Promise<SupportId[]> {
      return [...(getState().supports.get(studentId) ?? [])];
    },

    async neighborhood(nodeId: string, depth = 2): Promise<GraphNeighborhood> {
      const state = getState();
      const nodes: GraphNeighborhood["nodes"] = [];
      const edges: GraphNeighborhood["edges"] = [];
      const seen = new Set<string>();

      const addNode = (id: string, label: string, kind: string, props: Record<string, unknown> = {}) => {
        if (seen.has(id)) return;
        seen.add(id);
        nodes.push({ id, label, kind, props });
      };

      addNode(nodeId, nodeId, "Student");

      for (const edge of state.misconceptions) {
        if (edge.student_id !== nodeId) continue;
        addNode(edge.misconception_id, edge.misconception_id, "Misconception");
        edges.push({
          from: edge.student_id,
          to: edge.misconception_id,
          kind: "EXHIBITED",
          props: { run_id: edge.run_id, at: edge.at },
        });
        if (depth >= 2) {
          addNode(edge.concept_id, edge.concept_id, "Concept");
          edges.push({ from: edge.misconception_id, to: edge.concept_id, kind: "BLOCKS", props: {} });
        }
      }

      for (const [key, history] of state.mastery) {
        const [student, concept] = key.split("::");
        if (student !== nodeId) continue;
        const newest = history.at(-1);
        addNode(concept, concept, "Concept");
        edges.push({
          from: student,
          to: concept,
          kind: "HAS_MASTERY",
          props: { level: newest?.mastery ?? null, updated_at: newest?.updated_at ?? null },
        });
      }

      return { nodes, edges };
    },

    async saveCurriculumEvidence(evidence: CurriculumEvidence): Promise<number> {
      const nodes: GraphNeighborhood["nodes"] = [];
      const edges: GraphNeighborhood["edges"] = [];
      const sourceNodeId = (sourceId: string) => `source:${evidence.run_id}:${sourceId}`;
      const lessonNodeId = (chunkId: string) => `lesson:${evidence.run_id}:${chunkId}`;
      const assignmentNodeId = `assignment:${evidence.run_id}:${evidence.assignment_id}`;
      nodes.push({
        id: assignmentNodeId,
        label: `${evidence.topic} learning plan`,
        kind: "Assignment",
        props: { run_id: evidence.run_id, draft_id: evidence.draft_id },
      });
      for (const source of evidence.sources) {
        nodes.push({
          id: sourceNodeId(source.source_id),
          label: source.title,
          kind: "Source",
          props: {
            url: source.url,
            publisher: source.publisher,
            provenance: source.provenance,
            retrieved_at: source.retrieved_at,
          },
        });
      }
      for (const chunk of evidence.chunks) {
        const lessonId = lessonNodeId(chunk.chunk_id);
        nodes.push({ id: lessonId, label: chunk.title, kind: "Lesson", props: { chunk_id: chunk.chunk_id } });
        edges.push({ from: assignmentNodeId, to: lessonId, kind: "CONTAINS", props: {} });
        for (const sourceId of chunk.citations) {
          edges.push({ from: lessonId, to: sourceNodeId(sourceId), kind: "CITES", props: {} });
        }
        for (const conceptId of chunk.concept_ids) {
          const conceptNodeId = `concept:${evidence.run_id}:${conceptId}`;
          if (!nodes.some((node) => node.id === conceptNodeId)) {
            nodes.push({ id: conceptNodeId, label: conceptId.replace(/[:_-]/g, " "), kind: "Concept", props: { concept_id: conceptId } });
          }
          edges.push({ from: lessonId, to: conceptNodeId, kind: "TEACHES", props: {} });
        }
      }
      getState().curriculumEvidence.set(evidence.run_id, { nodes, edges });
      return edges.length;
    },

    async curriculumEvidence(runId: string): Promise<GraphNeighborhood> {
      const graph = getState().curriculumEvidence.get(runId);
      return graph ? { nodes: [...graph.nodes], edges: [...graph.edges] } : { nodes: [], edges: [] };
    },

    /**
     * Mock mode has no Cypher engine. Rather than pretend, this returns an
     * empty result — callers must use the typed methods above, which is what
     * the agents actually do.
     */
    async query<T = unknown>(): Promise<T[]> {
      return [];
    },
  };

  return adapter;
}

/** Test/demo-reset helper. */
export function resetMockFalkor(): void {
  const store = globalThis as Record<string, unknown>;
  delete store[GLOBAL_KEY];
}
