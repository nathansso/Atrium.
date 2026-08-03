"use client";

/**
 * Research Studio — the educator entry point for source-grounded curriculum
 * authoring. Enter a topic and audience, review the cited draft (sources,
 * concept/prerequisite map, sequenced chunks with checks and citations, and any
 * evidence warnings), edit chunk text, then explicitly approve or reject.
 *
 * Unapproved web synthesis never becomes student-facing work: approval is a
 * distinct, deliberate action recorded server-side.
 */
import { useMemo, useState } from "react";
import type {
  CurriculumChunk,
  CurriculumDraft,
  ResearchWarning,
} from "@/contracts";

type ResearchResponse = {
  draft: CurriculumDraft;
  provider: string;
  degraded: boolean;
};

const WARNING_COLOR: Record<ResearchWarning["kind"], string> = {
  conflicting_evidence: "var(--danger)",
  weak_evidence: "var(--warn)",
  stale_source: "var(--warn)",
  thin_coverage: "var(--gold)",
  uncited_chunk: "var(--danger)",
};

const panel: React.CSSProperties = {
  background: "var(--stone-raised)",
  boxShadow: "inset 2px 2px 0 var(--stone-hi), inset -2px -2px 0 var(--stone-lo)",
  padding: 16,
  marginBottom: 16,
};
const label: React.CSSProperties = {
  fontFamily: "var(--font-label)",
  fontSize: 11,
  color: "var(--text-dim)",
  textTransform: "uppercase",
  letterSpacing: 1,
  display: "block",
  marginBottom: 4,
};
const input: React.CSSProperties = {
  width: "100%",
  background: "var(--slot)",
  boxShadow: "inset 2px 2px 0 var(--slot-lo)",
  border: "none",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  padding: "8px 10px",
};

export function CurriculumResearchPanel() {
  const [topic, setTopic] = useState("AI literacy");
  const [audience, setAudience] = useState("high school");
  const [teachingIntent, setTeachingIntent] = useState("critical, responsible use");
  const [freshness, setFreshness] = useState("");
  const [maxSources, setMaxSources] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [approval, setApproval] = useState<CurriculumDraft["approval_state"] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const draft = result?.draft ?? null;
  const sourceById = useMemo(
    () => new Map((draft?.sources ?? []).map((s) => [s.source_id, s])),
    [draft],
  );

  async function runResearch() {
    setLoading(true);
    setError(null);
    setResult(null);
    setApproval(null);
    setEdits({});
    try {
      const response = await fetch("/api/curriculum/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          audience,
          teaching_intent: teachingIntent || undefined,
          freshness_cutoff: freshness || null,
          max_sources: maxSources,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Research failed (${response.status})`);
      }
      setResult(body as ResearchResponse);
      setApproval(body.draft.approval_state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function decide(reject: boolean) {
    if (!draft) return;
    try {
      const response = await fetch(`/api/curriculum/${draft.draft_id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: "educator", reject }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Approval failed");
      setApproval(body.draft.approval_state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: 24, fontFamily: "var(--font-body)", color: "var(--text)" }}>
      <h1 style={{ fontFamily: "var(--font-label)", color: "var(--gold)", fontSize: 22, marginBottom: 4 }}>
        Research Studio
      </h1>
      <p style={{ color: "var(--text-dim)", marginTop: 0, marginBottom: 20 }}>
        Source-grounded curriculum authoring. Research a topic, review the cited draft, then approve to teach it.
      </p>

      <div style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={label}>Topic</label>
            <input style={input} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div>
            <label style={label}>Audience</label>
            <input style={input} value={audience} onChange={(e) => setAudience(e.target.value)} />
          </div>
          <div>
            <label style={label}>Teaching intent</label>
            <input style={input} value={teachingIntent} onChange={(e) => setTeachingIntent(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>Freshness cutoff</label>
              <input style={input} type="date" value={freshness} onChange={(e) => setFreshness(e.target.value)} />
            </div>
            <div>
              <label style={label}>Max sources</label>
              <input
                style={input}
                type="number"
                min={1}
                max={20}
                value={maxSources}
                onChange={(e) => setMaxSources(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
        <button
          onClick={runResearch}
          disabled={loading || !topic || !audience}
          style={{
            marginTop: 14,
            background: "var(--gold)",
            color: "var(--text-on-gold)",
            fontFamily: "var(--font-label)",
            fontSize: 13,
            padding: "10px 18px",
            border: "none",
            cursor: loading ? "wait" : "pointer",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          {loading ? "Researching…" : "Research topic"}
        </button>
      </div>

      {error && (
        <div style={{ ...panel, borderLeft: "3px solid var(--danger)", color: "var(--danger)" }}>{error}</div>
      )}

      {draft && (
        <>
          <div style={{ ...panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--font-label)", fontSize: 16 }}>{draft.topic}</div>
              <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
                for {draft.audience} · {draft.concepts.length} concepts · {draft.chunks.length} chunks ·{" "}
                {draft.sources.length} sources
              </div>
              <div style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 4 }}>
                provider: {result?.provider}
                {result?.degraded ? " (degraded → mock fallback)" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: 12,
                  padding: "4px 10px",
                  background: "var(--slot)",
                  color:
                    approval === "approved"
                      ? "var(--xp)"
                      : approval === "rejected"
                        ? "var(--danger)"
                        : "var(--warn)",
                }}
              >
                {approval ?? "pending"}
              </span>
              <button onClick={() => decide(false)} style={approveBtn("var(--xp)")}>Approve</button>
              <button onClick={() => decide(true)} style={approveBtn("var(--danger)")}>Reject</button>
            </div>
          </div>

          {draft.warnings.length > 0 && (
            <div style={panel}>
              <div style={label}>Evidence review ({draft.warnings.length})</div>
              {draft.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 6, color: WARNING_COLOR[w.kind] }}>
                  ▸ <strong>{w.kind.replace(/_/g, " ")}</strong> — <span style={{ color: "var(--text)" }}>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          <div style={panel}>
            <div style={label}>Concept sequence (prerequisite order)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {draft.sequence.map((conceptId, i) => {
                const concept = draft.concepts.find((c) => c.concept_id === conceptId);
                return (
                  <span key={conceptId} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {i > 0 && <span style={{ color: "var(--text-faint)" }}>→</span>}
                    <span style={{ background: "var(--slot)", padding: "4px 8px", fontSize: 13 }} title={concept?.summary}>
                      {concept?.label ?? conceptId}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          <div style={panel}>
            <div style={label}>Sources</div>
            {draft.sources.map((s) => (
              <div key={s.source_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--stone-lo)" }}>
                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--aqua)", fontWeight: 600, fontSize: 14 }}>
                  {s.title}
                </a>
                <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
                  {s.publisher} · {s.source_type.replace(/_/g, " ")} · {s.published_at ?? "undated"}
                </div>
                <div style={{ color: "var(--text)", fontSize: 13, marginTop: 4 }}>&ldquo;{s.excerpt}&rdquo;</div>
                <div style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 2 }}>{s.credibility}</div>
              </div>
            ))}
          </div>

          {draft.chunks.map((chunk) => (
            <ChunkCard
              key={chunk.chunk_id}
              chunk={chunk}
              body={edits[chunk.chunk_id] ?? chunk.body}
              onEdit={(value) => setEdits((prev) => ({ ...prev, [chunk.chunk_id]: value }))}
              sourceLabel={(ref) => sourceById.get(ref)?.publisher ?? ref}
            />
          ))}
        </>
      )}
    </div>
  );
}

function approveBtn(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `2px solid ${color}`,
    color,
    fontFamily: "var(--font-label)",
    fontSize: 12,
    padding: "6px 12px",
    cursor: "pointer",
    textTransform: "uppercase",
  };
}

function ChunkCard({
  chunk,
  body,
  onEdit,
  sourceLabel,
}: {
  chunk: CurriculumChunk;
  body: string;
  onEdit: (value: string) => void;
  sourceLabel: (ref: string) => string;
}) {
  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--font-label)", fontSize: 14 }}>
          {chunk.order + 1}. {chunk.title}
        </div>
        <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{chunk.duration_minutes} min</div>
      </div>
      <textarea
        value={body}
        onChange={(e) => onEdit(e.target.value)}
        rows={3}
        style={{ ...input, marginTop: 8, resize: "vertical", lineHeight: 1.5 }}
      />
      <div style={{ marginTop: 8, fontSize: 13 }}>
        <span style={label}>Comprehension check</span>
        <div style={{ color: "var(--text)" }}>{chunk.comprehension_check.prompt}</div>
        <div style={{ color: "var(--text-dim)", marginTop: 2 }}>{chunk.comprehension_check.answer}</div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-faint)" }}>
        Cites: {chunk.citations.map(sourceLabel).join(", ")}
      </div>
    </div>
  );
}
