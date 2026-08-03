"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CurriculumChunk,
  CurriculumDraft,
  ResearchSource,
  ResearchWarning,
} from "@/contracts";
import { AtriumIcon } from "@/components/ui/atrium-icons";

type ResearchResponse = {
  draft: CurriculumDraft;
  provider: string;
  degraded: boolean;
};

type LaunchResponse = { run_id: string; reused: boolean };

type ResearchSession = {
  result: ResearchResponse;
  approval: CurriculumDraft["approval_state"];
  topic: string;
  audience: string;
  teachingIntent: string;
  freshness: string;
  maxSources: number;
};

const RESEARCH_SESSION_KEY = "atrium:active-research-draft";

function readResearchSession(): ResearchSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RESEARCH_SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ResearchSession>;
    if (!value.result?.draft?.draft_id || !value.approval) return null;
    return value as ResearchSession;
  } catch {
    return null;
  }
}

function saveResearchSession(session: ResearchSession): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(RESEARCH_SESSION_KEY, JSON.stringify(session));
}

const WARNING_LABEL: Record<ResearchWarning["kind"], string> = {
  conflicting_evidence: "Conflicting evidence",
  weak_evidence: "Weak evidence",
  stale_source: "Stale source",
  thin_coverage: "Thin coverage",
  uncited_chunk: "Uncited chunk",
};

export function CurriculumResearchPanel() {
  const router = useRouter();
  const [topic, setTopic] = useState("AI literacy");
  const [audience, setAudience] = useState("high school");
  const [teachingIntent, setTeachingIntent] = useState("critical, responsible use");
  const [freshness, setFreshness] = useState("");
  const [maxSources, setMaxSources] = useState(8);
  const [loading, setLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [launchLoading, setLaunchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [approval, setApproval] = useState<CurriculumDraft["approval_state"] | null>(null);

  const draft = result?.draft ?? null;

  const persist = (nextResult: ResearchResponse, nextApproval: CurriculumDraft["approval_state"]) => {
    saveResearchSession({
      result: nextResult,
      approval: nextApproval,
      topic,
      audience,
      teachingIntent,
      freshness,
      maxSources,
    });
  };

  useEffect(() => {
    const saved = readResearchSession();
    if (!saved) return;
    setResult(saved.result);
    setApproval(saved.approval);
    setTopic(saved.topic);
    setAudience(saved.audience);
    setTeachingIntent(saved.teachingIntent);
    setFreshness(saved.freshness);
    setMaxSources(saved.maxSources);
  }, []);
  const sourceById = useMemo(
    () => new Map((draft?.sources ?? []).map((source) => [source.source_id, source])),
    [draft],
  );
  const conceptById = useMemo(
    () => new Map((draft?.concepts ?? []).map((concept) => [concept.concept_id, concept])),
    [draft],
  );

  const decisionRecorded = approval === "approved" || approval === "rejected";
  const workflowStep = !draft ? 1 : approval === "approved" ? 4 : approval === "rejected" ? 3 : 2;

  async function runResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (decisionLoading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setApproval(null);

    try {
      const response = await fetch("/api/curriculum/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          audience: audience.trim(),
          teaching_intent: teachingIntent.trim() || undefined,
          freshness_cutoff: freshness || null,
          max_sources: maxSources,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Research failed (${response.status})`);
      }
      const nextResult = body as ResearchResponse;
      setResult(nextResult);
      setApproval(nextResult.draft.approval_state);
      persist(nextResult, nextResult.draft.approval_state);
    } catch (researchError) {
      setError(
        researchError instanceof Error ? researchError.message : String(researchError),
      );
    } finally {
      setLoading(false);
    }
  }

  async function launch() {
    if (!draft || approval !== "approved" || launchLoading) return;
    setLaunchLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/curriculum/${draft.draft_id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launched_by: "educator", teaching_intent: teachingIntent.trim() || undefined }),
      });
      const body = await response.json();
      if (!response.ok || !body?.run_id) {
        throw new Error(body?.error?.message ?? "Could not launch the curriculum.");
      }
      router.push(`/demo?runId=${encodeURIComponent((body as LaunchResponse).run_id)}`);
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : String(launchError));
    } finally {
      setLaunchLoading(false);
    }
  }

  async function decide(reject: boolean) {
    if (!draft || decisionRecorded) return;
    const decidingDraftId = draft.draft_id;
    setDecisionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/curriculum/${decidingDraftId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: "educator", reject }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Approval failed");
      }
      if (body?.draft?.draft_id !== decidingDraftId) {
        throw new Error("Approval response did not match the reviewed draft.");
      }
      setApproval(body.draft.approval_state);
      persist({ ...result!, draft: body.draft }, body.draft.approval_state);
    } catch (approvalError) {
      setError(
        approvalError instanceof Error ? approvalError.message : String(approvalError),
      );
    } finally {
      setDecisionLoading(false);
    }
  }

  return (
    <div className="research-studio">
      <section className="research-hero" aria-labelledby="research-studio-title">
        <div className="research-hero__copy">
          <span className="eyebrow">Research Studio</span>
          <h1 id="research-studio-title">Build a curriculum you can trace.</h1>
          <p>
            Research a topic, inspect every source and prerequisite, then make the
            educator approval decision before anything can become student-facing.
          </p>
        </div>
        <div className="research-hero__guardrail">
          <AtriumIcon name="approve" size={22} />
          <div>
            <strong>Educator gate required</strong>
            <span>Approval is required before a classroom run can launch.</span>
          </div>
        </div>
      </section>

      <ol className="research-steps" aria-label="Research workflow">
        {[
          [1, "Research", "Gather cited evidence"],
          [2, "Review", "Check sequence and claims"],
          [3, "Decide", "Record an educator decision"],
          [4, "Launch", "Open the learning run"],
        ].map(([step, title, description]) => {
          const stepNumber = Number(step);
          const state =
            stepNumber < workflowStep
              ? "complete"
              : stepNumber === workflowStep
                ? "current"
                : "upcoming";
          return (
            <li
              key={stepNumber}
              className="research-step"
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="research-step__number">
                {state === "complete" ? "✓" : stepNumber}
              </span>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </li>
          );
        })}
      </ol>

      <form className="research-form" onSubmit={runResearch} aria-busy={loading}>
        <header className="research-card__header">
          <div>
            <span className="eyebrow">Research brief</span>
            <h2>What should Atrium investigate?</h2>
          </div>
          <span className="research-form__mode">
            <AtriumIcon name="connection" size={17} />
            Firecrawl search · cited sources required
          </span>
        </header>

        <div className="research-form__grid">
          <label className="research-field research-field--topic" htmlFor="research-topic">
            <span>Topic</span>
            <input
              id="research-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. AI literacy"
              required
            />
          </label>
          <label className="research-field" htmlFor="research-audience">
            <span>Audience</span>
            <input
              id="research-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder="e.g. high school"
              required
            />
          </label>
          <label className="research-field research-field--intent" htmlFor="research-intent">
            <span>Teaching intent</span>
            <input
              id="research-intent"
              value={teachingIntent}
              onChange={(event) => setTeachingIntent(event.target.value)}
              placeholder="What should learners understand or be able to do?"
            />
          </label>
        </div>

        <details className="research-form__advanced">
          <summary>Research settings</summary>
          <div className="research-form__advanced-grid">
            <label className="research-field" htmlFor="research-freshness">
              <span>Flag sources older than</span>
              <input
                id="research-freshness"
                type="date"
                value={freshness}
                onChange={(event) => setFreshness(event.target.value)}
              />
            </label>
            <label className="research-field" htmlFor="research-max-sources">
              <span>Maximum sources</span>
              <input
                id="research-max-sources"
                type="number"
                min={1}
                max={20}
                value={maxSources}
                onChange={(event) =>
                  setMaxSources(
                    Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                  )
                }
              />
            </label>
          </div>
        </details>

        <div className="research-form__footer">
          <p>
            Results are a reviewable preview. Approval is recorded separately from
            the classroom event pipeline.
          </p>
          <button
            type="submit"
            className="primary-action research-form__submit"
            disabled={loading || decisionLoading || !topic.trim() || !audience.trim()}
          >
            <AtriumIcon name="research" size={21} />
            {loading ? "Researching…" : draft ? "Research again" : "Research topic"}
          </button>
        </div>
      </form>

      {error && (
        <div className="research-alert research-alert--error" role="alert">
          <AtriumIcon name="warning" size={20} />
          <span>{error}</span>
        </div>
      )}

      {loading && <ResearchLoading />}

      {draft && !loading && (
        <div className="research-draft">
          <header className="research-draft__summary">
            <div>
              <span className="eyebrow">Curriculum draft</span>
              <h2>{draft.topic}</h2>
              <p>
                For {draft.audience}
                {draft.teaching_intent ? ` · ${draft.teaching_intent}` : ""}
              </p>
            </div>
            <dl className="research-draft__stats">
              <div><dt>Concepts</dt><dd>{draft.concepts.length}</dd></div>
              <div><dt>Chunks</dt><dd>{draft.chunks.length}</dd></div>
              <div><dt>Sources</dt><dd>{draft.sources.length}</dd></div>
              <div><dt>Warnings</dt><dd>{draft.warnings.length}</dd></div>
            </dl>
            <div className="research-draft__provider" data-degraded={result?.degraded}>
              <AtriumIcon name="sources" size={18} />
              <span>
                <strong>{result?.provider ?? "Unknown provider"}</strong>
                {result?.degraded ? "Fixture preview" : "Source retrieval complete"}
              </span>
            </div>
          </header>

          <div className="research-review">
            <div className="research-review__main">
              <section className="research-card" aria-labelledby="concept-sequence-title">
                <header className="research-card__header">
                  <div>
                    <span className="eyebrow">Prerequisite map</span>
                    <h2 id="concept-sequence-title">Concept sequence</h2>
                  </div>
                  <AtriumIcon name="sequence" size={24} />
                </header>
                <ol className="research-sequence">
                  {draft.sequence.map((conceptId, index) => {
                    const concept = conceptById.get(conceptId);
                    const prerequisites = concept?.prerequisites
                      .map((id) => conceptById.get(id)?.label ?? id)
                      .join(", ");
                    return (
                      <li key={conceptId}>
                        <span className="research-sequence__index">{index + 1}</span>
                        <div>
                          <strong>{concept?.label ?? conceptId}</strong>
                          <p>{concept?.summary}</p>
                          <small>
                            {prerequisites
                              ? `Builds on ${prerequisites}`
                              : "Foundation concept"}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section className="research-card" aria-labelledby="evidence-ledger-title">
                <header className="research-card__header">
                  <div>
                    <span className="eyebrow">Citation audit</span>
                    <h2 id="evidence-ledger-title">Evidence ledger</h2>
                  </div>
                  <span className="research-card__count">{draft.claims.length} claims</span>
                </header>
                <ul className="research-claims">
                  {draft.claims.map((claim) => (
                    <li key={claim.claim_id} data-conflicting={claim.conflicting}>
                      <div className="research-claim__head">
                        <strong>{claim.statement}</strong>
                        <span>{Math.round(claim.confidence * 100)}% confidence</span>
                      </div>
                      {claim.note && <p>{claim.note}</p>}
                      <div className="research-citations">
                        {claim.citations.map((sourceId) => (
                          <CitationLink
                            key={sourceId}
                            source={sourceById.get(sourceId)}
                            fallback={sourceId}
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="research-chunks" aria-labelledby="curriculum-chunks-title">
                <header className="research-chunks__header">
                  <div>
                    <span className="eyebrow">Student-facing preview</span>
                    <h2 id="curriculum-chunks-title">Sequenced curriculum</h2>
                  </div>
                  <span>Read-only until approved</span>
                </header>
                <div className="research-chunks__list">
                  {draft.chunks.map((chunk) => (
                    <ChunkCard
                      key={chunk.chunk_id}
                      chunk={chunk}
                      sourceForId={(sourceId) => sourceById.get(sourceId)}
                      conceptLabel={(conceptId) =>
                        conceptById.get(conceptId)?.label ?? conceptId
                      }
                    />
                  ))}
                </div>
              </section>
            </div>

            <aside className="research-review__rail" aria-label="Evidence and approval">
              <section
                className="research-card research-approval"
                aria-labelledby="approval-gate-title"
                aria-busy={decisionLoading}
              >
                <header className="research-card__header">
                  <div>
                    <span className="eyebrow">Required decision</span>
                    <h2 id="approval-gate-title">Educator approval</h2>
                  </div>
                  <AtriumIcon name="approve" size={24} />
                </header>
                <div className="research-approval__state" data-state={approval ?? "pending"} aria-live="polite">
                  {approval ?? "pending"}
                </div>
                <p>
                  Confirm that the evidence, sequence, and student-facing language
                  are ready. This records a decision; it does not launch a class.
                </p>
                <div className="research-approval__actions">
                  <button
                    type="button"
                    className="research-decision research-decision--approve"
                    onClick={() => void decide(false)}
                    disabled={decisionLoading || decisionRecorded || launchLoading}
                  >
                    <AtriumIcon name="approve" size={19} />
                    Approve draft
                  </button>
                  <button
                    type="button"
                    className="research-decision research-decision--reject"
                    onClick={() => void decide(true)}
                    disabled={decisionLoading || decisionRecorded || launchLoading}
                  >
                    <AtriumIcon name="reject" size={19} />
                    Reject
                  </button>
                </div>
                {approval === "approved" && (
                  <p className="research-approval__recorded">
                    Approved. Launch creates one curriculum-backed classroom run.
                  </p>
                )}
                {approval === "approved" && (
                  <button
                    type="button"
                    className="research-decision research-decision--approve"
                    onClick={() => void launch()}
                    disabled={launchLoading}
                  >
                    <AtriumIcon name="classroom" size={19} />
                    {launchLoading ? "Launching…" : "Start learning"}
                  </button>
                )}
              </section>

              <section className="research-card" aria-labelledby="evidence-review-title">
                <header className="research-card__header">
                  <div>
                    <span className="eyebrow">Quality signals</span>
                    <h2 id="evidence-review-title">Evidence review</h2>
                  </div>
                  <span className="research-card__count">{draft.warnings.length}</span>
                </header>
                {draft.warnings.length === 0 ? (
                  <p className="research-card__empty">
                    No evidence warnings were raised. Citations still require educator review.
                  </p>
                ) : (
                  <ul className="research-warnings">
                    {draft.warnings.map((warning, index) => (
                      <li key={`${warning.kind}-${index}`} data-kind={warning.kind}>
                        <AtriumIcon name="warning" size={18} />
                        <span>
                          <strong>{WARNING_LABEL[warning.kind]}</strong>
                          {warning.message}
                          {(warning.concept_id || warning.refs.length > 0) && (
                            <small>
                              {warning.concept_id ? `Concept: ${warning.concept_id}` : ""}
                              {warning.concept_id && warning.refs.length > 0 ? " · " : ""}
                              {warning.refs.length > 0
                                ? `References: ${warning.refs.join(", ")}`
                                : ""}
                            </small>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="research-card" aria-labelledby="research-sources-title">
                <header className="research-card__header">
                  <div>
                    <span className="eyebrow">Provenance</span>
                    <h2 id="research-sources-title">Sources</h2>
                  </div>
                  <AtriumIcon name="sources" size={23} />
                </header>
                <ol className="research-sources">
                  {draft.sources.map((source, index) => (
                    <li key={source.source_id}>
                      <span className="research-source__index">{index + 1}</span>
                      <div>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                          <AtriumIcon name="external" size={14} />
                        </a>
                        <p>{source.publisher} · {source.source_type.replace(/_/g, " ")}</p>
                        <blockquote>{source.excerpt}</blockquote>
                        <small>
                          {source.credibility} · {source.provenance} · {source.published_at ?? "date unavailable"}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>

          <section
            className="research-start-learning"
            data-ready={approval === "approved"}
            aria-label="Start the approved curriculum"
          >
            <div>
              <span className="eyebrow">Ready for the classroom</span>
              <h2>Start with lesson 1 of {draft.chunks.length}</h2>
              <p>
                {approval === "approved"
                  ? "Open the first cited lesson in the classroom. The remaining lessons unlock in sequence."
                  : "Approve this research draft to unlock its cited lesson sequence."}
              </p>
            </div>
            <button
              type="button"
              className="primary-action research-start-learning__button"
              onClick={() => void launch()}
              disabled={approval !== "approved" || launchLoading}
            >
              <AtriumIcon name="classroom" size={21} />
              {launchLoading ? "Launching…" : "Start learning"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function ResearchLoading() {
  return (
    <div className="research-loading" role="status" aria-live="polite">
      <span className="research-loading__mark" aria-hidden="true" />
      <div>
        <strong>Building the evidence map…</strong>
        <span>Collecting sources, checking claims, and ordering prerequisites.</span>
      </div>
    </div>
  );
}

function CitationLink({
  source,
  fallback,
}: {
  source: ResearchSource | undefined;
  fallback: string;
}) {
  if (!source) return <span>{fallback}</span>;
  return (
    <a href={source.url} target="_blank" rel="noreferrer" title={source.title}>
      {source.publisher}
      <AtriumIcon name="external" size={12} />
    </a>
  );
}

function ChunkCard({
  chunk,
  sourceForId,
  conceptLabel,
}: {
  chunk: CurriculumChunk;
  sourceForId: (sourceId: string) => ResearchSource | undefined;
  conceptLabel: (conceptId: string) => string;
}) {
  return (
    <article className="research-chunk">
      <header className="research-chunk__header">
        <span className="research-chunk__order">{chunk.order + 1}</span>
        <div>
          <h3>{chunk.title}</h3>
          <div className="research-chunk__concepts">
            {chunk.concept_ids.map((conceptId) => (
              <span key={conceptId}>{conceptLabel(conceptId)}</span>
            ))}
          </div>
        </div>
        <span className="research-chunk__duration">{chunk.duration_minutes} min</span>
      </header>

      <div className="research-chunk__body">
        <span>Student-facing content</span>
        <p>{chunk.body}</p>
      </div>

      <div className="research-check">
        <span className="research-check__icon">?</span>
        <div>
          <span>Comprehension check · {chunk.comprehension_check.kind.replace(/_/g, " ")}</span>
          <strong>{chunk.comprehension_check.prompt}</strong>
          <p>{chunk.comprehension_check.answer}</p>
        </div>
      </div>

      <div className="research-citations research-chunk__citations">
        <span>Citations</span>
        {chunk.citations.map((sourceId) => (
          <CitationLink
            key={sourceId}
            source={sourceForId(sourceId)}
            fallback={sourceId}
          />
        ))}
      </div>
    </article>
  );
}
