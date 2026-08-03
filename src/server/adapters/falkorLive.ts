/**
 * Live FalkorDB adapter — the memory layer, backed by real Cypher.
 *
 * Graph shape (identical to the mock's in-memory model):
 *
 *   (Student)-[:HAS_MASTERY {score, confidence, trend, updated_at}]->(Concept)
 *   (Student)-[:MASTERY_AT  {score, confidence, trend, updated_at}]->(Concept)
 *   (Student)-[:EXHIBITED   {run_id, evidence_refs, at}]->(Misconception)
 *   (Misconception)-[:BLOCKS]->(Concept)
 *   (Student)-[:NEEDS]->(Support)
 *   (Student)-[:MEMBER_OF {run_id}]->(Room)
 *   (Room)-[:FOCUSES_ON]->(Concept)
 *
 * HAS_MASTERY is the *current* estimate (merged in place); MASTERY_AT
 * accumulates one edge per write so masteryTrajectory() can show how a
 * student's understanding moved over time. The mock keeps an array for the
 * same reason — this is that array, expressed as edges.
 *
 * Ordering is pinned with ORDER BY in every read so live and mock return
 * results in the same sequence and the demo stays reproducible.
 */
// Lazy-loaded: see laserStream.ts — vendor SDKs must not evaluate at module
// scope or Next's build-time page-data collection crashes.
import type { FalkorDB } from "falkordb";
import type { ConceptId, MasteryEstimate, MisconceptionId, Room, SupportId } from "@/contracts";
import { getEnvConfig } from "@/server/config";
import type {
  AdapterInfo,
  CurriculumEvidence,
  FalkorGraphAdapter,
  GraphNeighborhood,
  MasteryRecord,
  MisconceptionEdge,
  SharedBarrierGroup,
} from "./types";

/**
 * THE load-bearing query. Groups students by the *barrier* in the middle of
 * the path rather than the concept at the end, which is the whole reason this
 * layer is a graph and not a table.
 */
const SHARED_BARRIERS_CYPHER = `
MATCH (s:Student)-[e:EXHIBITED]->(m:Misconception)-[:BLOCKS]->(c:Concept)
WHERE c.id IN $concepts
  AND ($runId IS NULL OR e.run_id = $runId)
WITH m, c, collect(DISTINCT s.id) AS students
WHERE size(students) >= $minGroupSize
RETURN m.id AS misconception_id, c.id AS concept_id, students
ORDER BY concept_id, misconception_id`;

type GlobalWithFalkor = typeof globalThis & {
  __atrium_falkor_live__?: Promise<FalkorDB>;
};

/**
 * One connection per process, cached on globalThis so Next.js hot reloads
 * don't leak sockets. Rejections clear the cache so the next call retries.
 */
function connect(): Promise<FalkorDB> {
  const store = globalThis as GlobalWithFalkor;
  if (!store.__atrium_falkor_live__) {
    const config = getEnvConfig();
    store.__atrium_falkor_live__ = import("falkordb")
      .then((mod) =>
        mod.FalkorDB.connect({
          url: config.falkordbUrl ?? undefined,
          password: config.falkordbPassword ?? undefined,
        }),
      )
      .catch((error: unknown) => {
      delete store.__atrium_falkor_live__;
      throw error;
    });
  }
  return store.__atrium_falkor_live__;
}

async function graph() {
  const db = await connect();
  return db.selectGraph(getEnvConfig().falkordbGraph);
}

/** Rows come back keyed by RETURN alias; missing data means an empty result. */
async function run<T>(cypher: string, params?: Record<string, unknown>): Promise<T[]> {
  const g = await graph();
  const reply = await g.query<T>(cypher, params ? { params: params as never } : undefined);
  return reply.data ?? [];
}

function toMastery(row: {
  score: number;
  confidence: number;
  trend: string;
}): MasteryEstimate {
  return {
    score: Number(row.score),
    confidence: Number(row.confidence),
    trend: row.trend as MasteryEstimate["trend"],
  };
}

type MasteryRow = {
  student_id: string;
  concept_id: string;
  score: number;
  confidence: number;
  trend: string;
  updated_at: string;
};

function toMasteryRecord(row: MasteryRow): MasteryRecord {
  return {
    student_id: row.student_id,
    concept_id: row.concept_id as ConceptId,
    mastery: toMastery(row),
    updated_at: row.updated_at,
  };
}

export function createLiveFalkorAdapter(): FalkorGraphAdapter {
  const adapter: FalkorGraphAdapter = {
    info(): AdapterInfo {
      return { name: "falkordb", mode: "live", provider: "falkordb-cypher" };
    },

    /**
     * Range indices on every id we look up by. FalkorDB errors when an index
     * already exists, so each statement is attempted independently and an
     * "already indexed" failure is treated as success.
     */
    async ensureSchema(): Promise<void> {
      const labels = ["Student", "Concept", "Misconception", "Room", "Support", "Assignment", "Lesson", "Source"];
      for (const label of labels) {
        try {
          await run(`CREATE INDEX FOR (n:${label}) ON (n.id)`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/already indexed|already exists/i.test(message)) throw error;
        }
      }
    },

    /**
     * Writes every record to the MASTERY_AT history, then points HAS_MASTERY
     * at the current estimate.
     *
     * The winner is chosen here rather than in Cypher on purpose: a single
     * UNWIND that MERGEs and SETs the same edge twice does not reliably leave
     * the last row's value behind, so batching two updates for one student
     * would silently keep the older score. Picking the last record per
     * (student, concept) in JS matches the mock's `history.at(-1)` exactly and
     * does not depend on engine row ordering.
     */
    async upsertMastery(records: MasteryRecord[]): Promise<number> {
      if (records.length === 0) return 0;

      const flatten = (record: MasteryRecord) => ({
        student_id: record.student_id,
        concept_id: record.concept_id,
        score: record.mastery.score,
        confidence: record.mastery.confidence,
        trend: record.mastery.trend,
        updated_at: record.updated_at,
      });

      await run(
        `UNWIND $records AS rec
         MERGE (s:Student {id: rec.student_id})
         MERGE (c:Concept {id: rec.concept_id})
         CREATE (s)-[:MASTERY_AT {
           score: rec.score,
           confidence: rec.confidence,
           trend: rec.trend,
           updated_at: rec.updated_at
         }]->(c)`,
        { records: records.map(flatten) },
      );

      const current = new Map<string, MasteryRecord>();
      for (const record of records) {
        current.set(`${record.student_id}::${record.concept_id}`, record);
      }

      await run(
        `UNWIND $records AS rec
         MATCH (s:Student {id: rec.student_id})
         MATCH (c:Concept {id: rec.concept_id})
         MERGE (s)-[cur:HAS_MASTERY]->(c)
         SET cur.score = rec.score,
             cur.confidence = rec.confidence,
             cur.trend = rec.trend,
             cur.updated_at = rec.updated_at`,
        { records: [...current.values()].map(flatten) },
      );

      return records.length;
    },

    async getMastery(studentId: string, conceptId?: ConceptId): Promise<MasteryRecord[]> {
      const rows = await run<MasteryRow>(
        `MATCH (s:Student {id: $studentId})-[m:HAS_MASTERY]->(c:Concept)
         WHERE ($conceptId IS NULL OR c.id = $conceptId)
         RETURN s.id AS student_id, c.id AS concept_id, m.score AS score,
                m.confidence AS confidence, m.trend AS trend, m.updated_at AS updated_at
         ORDER BY concept_id`,
        { studentId, conceptId: conceptId ?? null },
      );
      return rows.map(toMasteryRecord);
    },

    async recordMisconception(edge): Promise<MisconceptionEdge> {
      const at = new Date().toISOString();
      await run(
        `MERGE (s:Student {id: $student_id})
         MERGE (m:Misconception {id: $misconception_id})
         MERGE (c:Concept {id: $concept_id})
         MERGE (m)-[:BLOCKS]->(c)
         CREATE (s)-[:EXHIBITED {
           run_id: $run_id,
           evidence_refs: $evidence_refs,
           at: $at
         }]->(m)`,
        { ...edge, evidence_refs: edge.evidence_refs, at },
      );
      return { ...edge, at };
    },

    async findSharedBarriers(
      concepts: ConceptId[],
      options?: { runId?: string; minGroupSize?: number },
    ): Promise<SharedBarrierGroup[]> {
      const rows = await run<{
        misconception_id: string;
        concept_id: string;
        students: string[];
      }>(SHARED_BARRIERS_CYPHER, {
        concepts,
        runId: options?.runId ?? null,
        minGroupSize: options?.minGroupSize ?? 2,
      });

      return rows.map((row) => ({
        misconception_id: row.misconception_id as MisconceptionId,
        concept_id: row.concept_id as ConceptId,
        student_ids: [...row.students].sort(),
        path_explanation: `(Student)-[:EXHIBITED]->(:Misconception {id:'${row.misconception_id}'})-[:BLOCKS]->(:Concept {id:'${row.concept_id}'})`,
      }));
    },

    async saveRoomFormation(runId: string, rooms: Room[]): Promise<number> {
      if (rooms.length === 0) return 0;
      await run(
        `UNWIND $rooms AS room
         MERGE (r:Room {id: room.room_id})
         SET r.name = room.name,
             r.run_id = $runId,
             r.dominant_barrier = room.dominant_barrier
         WITH r, room
         UNWIND room.focus_concepts AS conceptId
         MERGE (c:Concept {id: conceptId})
         MERGE (r)-[:FOCUSES_ON]->(c)
         WITH r, room
         UNWIND room.members AS studentId
         MERGE (s:Student {id: studentId})
         MERGE (s)-[mem:MEMBER_OF]->(r)
         SET mem.run_id = $runId`,
        {
          runId,
          rooms: rooms.map((room) => ({
            room_id: room.room_id,
            name: room.name,
            dominant_barrier: room.dominant_barrier,
            members: room.members,
            focus_concepts: [...new Set(room.focus_concepts)],
          })),
        },
      );
      return rooms.length;
    },

    async masteryTrajectory(studentId: string, conceptId: ConceptId): Promise<MasteryRecord[]> {
      const rows = await run<MasteryRow>(
        `MATCH (s:Student {id: $studentId})-[m:MASTERY_AT]->(c:Concept {id: $conceptId})
         RETURN s.id AS student_id, c.id AS concept_id, m.score AS score,
                m.confidence AS confidence, m.trend AS trend, m.updated_at AS updated_at
         ORDER BY m.updated_at`,
        { studentId, conceptId },
      );
      return rows.map(toMasteryRecord);
    },

    async getSupports(studentId: string): Promise<SupportId[]> {
      const rows = await run<{ support_id: string }>(
        `MATCH (:Student {id: $studentId})-[:NEEDS]->(sup:Support)
         RETURN sup.id AS support_id ORDER BY support_id`,
        { studentId },
      );
      return rows.map((row) => row.support_id as SupportId);
    },

    /**
     * Node/edge slice for the world's constellation panel. Mirrors the mock:
     * EXHIBITED edges (plus their BLOCKS hop at depth >= 2) and the student's
     * current HAS_MASTERY edges.
     */
    async neighborhood(nodeId: string, depth = 2): Promise<GraphNeighborhood> {
      const nodes = new Map<string, GraphNeighborhood["nodes"][number]>();
      const edges: GraphNeighborhood["edges"] = [];

      const addNode = (id: string, kind: string, props: Record<string, unknown> = {}) => {
        if (!nodes.has(id)) nodes.set(id, { id, label: id, kind, props });
      };

      addNode(nodeId, "Student");

      const misconceptionRows = await run<{
        misconception_id: string;
        concept_id: string;
        run_id: string;
        at: string;
      }>(
        `MATCH (s:Student {id: $nodeId})-[e:EXHIBITED]->(m:Misconception)-[:BLOCKS]->(c:Concept)
         RETURN m.id AS misconception_id, c.id AS concept_id,
                e.run_id AS run_id, e.at AS at
         ORDER BY misconception_id, concept_id`,
        { nodeId },
      );

      for (const row of misconceptionRows) {
        addNode(row.misconception_id, "Misconception");
        edges.push({
          from: nodeId,
          to: row.misconception_id,
          kind: "EXHIBITED",
          props: { run_id: row.run_id, at: row.at },
        });
        if (depth >= 2) {
          addNode(row.concept_id, "Concept");
          edges.push({
            from: row.misconception_id,
            to: row.concept_id,
            kind: "BLOCKS",
            props: {},
          });
        }
      }

      const masteryRows = await run<MasteryRow>(
        `MATCH (s:Student {id: $nodeId})-[m:HAS_MASTERY]->(c:Concept)
         RETURN s.id AS student_id, c.id AS concept_id, m.score AS score,
                m.confidence AS confidence, m.trend AS trend, m.updated_at AS updated_at
         ORDER BY concept_id`,
        { nodeId },
      );

      for (const row of masteryRows) {
        addNode(row.concept_id, "Concept");
        edges.push({
          from: nodeId,
          to: row.concept_id,
          kind: "HAS_MASTERY",
          props: { level: toMastery(row), updated_at: row.updated_at },
        });
      }

      return { nodes: [...nodes.values()], edges };
    },

    /**
     * Materialise the evidence lineage once a reviewed curriculum becomes a
     * classroom run.  These are first-class FalkorDB relationships, so the UI
     * can query provenance without reconstructing it from serialized JSON.
     */
    async saveCurriculumEvidence(evidence: CurriculumEvidence): Promise<number> {
      const assignmentId = `assignment:${evidence.run_id}:${evidence.assignment_id}`;
      await run(
        `MERGE (a:Assignment {id: $assignmentId})
         SET a.run_id = $runId, a.draft_id = $draftId, a.topic = $topic`,
        { assignmentId, runId: evidence.run_id, draftId: evidence.draft_id, topic: evidence.topic },
      );
      if (evidence.sources.length > 0) {
        await run(
          `UNWIND $sources AS source
           MERGE (s:Source {id: source.id})
           SET s.source_id = source.source_id, s.title = source.title,
               s.url = source.url, s.publisher = source.publisher,
               s.provenance = source.provenance, s.retrieved_at = source.retrieved_at`,
          {
            sources: evidence.sources.map((source) => ({
              id: `source:${evidence.run_id}:${source.source_id}`,
              source_id: source.source_id,
              title: source.title,
              url: source.url,
              publisher: source.publisher,
              provenance: source.provenance,
              retrieved_at: source.retrieved_at,
            })),
          },
        );
      }
      if (evidence.chunks.length === 0) return 0;
      await run(
        `UNWIND $chunks AS chunk
         MATCH (a:Assignment {id: $assignmentId})
         MERGE (l:Lesson {id: chunk.id})
         SET l.run_id = $runId, l.chunk_id = chunk.chunk_id, l.title = chunk.title
         MERGE (a)-[:CONTAINS]->(l)
         WITH l, chunk
         UNWIND chunk.concept_ids AS conceptId
         MERGE (c:Concept {id: conceptId})
         MERGE (l)-[:TEACHES]->(c)`,
        {
          assignmentId,
          runId: evidence.run_id,
          chunks: evidence.chunks.map((chunk) => ({
            id: `lesson:${evidence.run_id}:${chunk.chunk_id}`,
            chunk_id: chunk.chunk_id,
            title: chunk.title,
            concept_ids: chunk.concept_ids,
          })),
        },
      );
      await run(
        `UNWIND $citations AS citation
         MATCH (l:Lesson {id: citation.lesson_id})
         MATCH (s:Source {id: citation.source_id})
         MERGE (l)-[:CITES]->(s)`,
        {
          citations: evidence.chunks.flatMap((chunk) =>
            chunk.citations.map((sourceId) => ({
              lesson_id: `lesson:${evidence.run_id}:${chunk.chunk_id}`,
              source_id: `source:${evidence.run_id}:${sourceId}`,
            })),
          ),
        },
      );
      return evidence.chunks.length;
    },

    async curriculumEvidence(runId: string): Promise<GraphNeighborhood> {
      const rows = await run<{
        assignment_id: string;
        topic: string;
        lesson_id: string;
        lesson_title: string;
        concept_id: string | null;
        source_id: string | null;
        source_title: string | null;
        source_url: string | null;
        source_publisher: string | null;
        source_provenance: string | null;
        source_retrieved_at: string | null;
      }>(
        `MATCH (a:Assignment {run_id: $runId})-[:CONTAINS]->(l:Lesson)
         OPTIONAL MATCH (l)-[:TEACHES]->(c:Concept)
         OPTIONAL MATCH (l)-[:CITES]->(s:Source)
         RETURN a.id AS assignment_id, a.topic AS topic, l.id AS lesson_id,
                l.title AS lesson_title, c.id AS concept_id, s.id AS source_id,
                s.title AS source_title, s.url AS source_url,
                s.publisher AS source_publisher, s.provenance AS source_provenance,
                s.retrieved_at AS source_retrieved_at
         ORDER BY lesson_id, concept_id, source_id`,
        { runId },
      );
      const nodes = new Map<string, GraphNeighborhood["nodes"][number]>();
      const edges = new Map<string, GraphNeighborhood["edges"][number]>();
      const addNode = (id: string, label: string, kind: string, props: Record<string, unknown> = {}) => {
        if (!nodes.has(id)) nodes.set(id, { id, label, kind, props });
      };
      const addEdge = (from: string, to: string, kind: string) => {
        const key = `${from}:${kind}:${to}`;
        if (!edges.has(key)) edges.set(key, { from, to, kind, props: {} });
      };
      for (const row of rows) {
        addNode(row.assignment_id, `${row.topic} learning plan`, "Assignment", { run_id: runId });
        addNode(row.lesson_id, row.lesson_title, "Lesson");
        addEdge(row.assignment_id, row.lesson_id, "CONTAINS");
        if (row.concept_id) {
          const conceptId = `concept:${runId}:${row.concept_id}`;
          addNode(conceptId, row.concept_id.replace(/[:_-]/g, " "), "Concept", { concept_id: row.concept_id });
          addEdge(row.lesson_id, conceptId, "TEACHES");
        }
        if (row.source_id && row.source_title) {
          addNode(row.source_id, row.source_title, "Source", {
            url: row.source_url,
            publisher: row.source_publisher,
            provenance: row.source_provenance,
            retrieved_at: row.source_retrieved_at,
          });
          addEdge(row.lesson_id, row.source_id, "CITES");
        }
      }
      return { nodes: [...nodes.values()], edges: [...edges.values()] };
    },

    /** Escape hatch for demo queries and debugging — real Cypher, real engine. */
    async query<T = unknown>(cypher: string, params?: Record<string, unknown>): Promise<T[]> {
      return run<T>(cypher, params);
    },
  };

  return adapter;
}

/** Closes the pooled connection. Used by tests and by resetAdapters(). */
export async function closeLiveFalkor(): Promise<void> {
  const store = globalThis as GlobalWithFalkor;
  const pending = store.__atrium_falkor_live__;
  if (!pending) return;
  delete store.__atrium_falkor_live__;
  try {
    const db = await pending;
    await db.close();
  } catch {
    // A connection that never opened needs no closing.
  }
}
