"use client";

import { useRef, useState } from "react";
import { mockAssignment } from "@/world/mock/seed";
import type { AtriumController } from "./useAtrium";

const SPEEDS = [1, 2, 4];

export function CommandRail({ controller }: { controller: AtriumController }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const {
    assignmentText,
    setAssignmentText,
    teachingIntent,
    setTeachingIntent,
    startRun,
    simulate,
    reset,
    skipAnimation,
    canStart,
    canSimulate,
    stage,
    stageLabel,
    transport,
    backendDetected,
    speed,
    setSpeed,
    notice,
  } = controller;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setAssignmentText(text);
    setFileName(file.name);
    setEditorOpen(true);
  };

  return (
    <header className="rail">
      <div className="rail__top">
        <div className="rail__brand">
          <span className="rail__logo" aria-hidden="true" />
          <div>
            <h1 className="rail__title">Atrium</h1>
            <p className="rail__tagline">
              Every submission rebuilds the school
            </p>
          </div>
        </div>

        <div className="rail__status">
          <span
            className={`badge badge--${transport}`}
            data-tip={
              transport === "live"
                ? "Connected to the run API and SSE stream"
                : "Replaying the frozen sequence with the same AgentEvent contract"
            }
          >
            {transport === "live" ? "Live API" : "Mock replay"}
          </span>
          <span className={`badge badge--stage badge--stage-${stage}`}>
            {stageLabel}
          </span>
          <div className="rail__speed" role="group" aria-label="Replay speed">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                className={`speed${speed === value ? " speed--active" : ""}`}
                onClick={() => setSpeed(value)}
                aria-pressed={speed === value}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rail__controls">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,text/plain"
          className="rail__file"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <button
          type="button"
          className={`button button--primary${canStart ? " button--ready" : ""}`}
          onClick={() => void startRun()}
          disabled={!canStart}
        >
          Start run
        </button>
        <button
          type="button"
          className={`button button--primary${canSimulate ? " button--ready" : ""}`}
          onClick={() => void simulate()}
          disabled={!canSimulate}
          data-tip={
            canSimulate ? undefined : "Available once the rooms have been built"
          }
        >
          Run classroom
        </button>
        <span className="rail__spacer" />
        <button
          type="button"
          className="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload
        </button>
        <button
          type="button"
          className="button"
          onClick={() => setEditorOpen((value) => !value)}
          aria-expanded={editorOpen}
        >
          {editorOpen ? "Hide text" : "Edit text"}
        </button>
        <button
          type="button"
          className="button"
          onClick={skipAnimation}
          data-tip="Drain queued events and settle the world"
        >
          Skip
        </button>
        <button type="button" className="button" onClick={reset}>
          Reset
        </button>
      </div>

      <div className="helpbar">
        <span>
          <kbd>Enter</kbd>
          {canSimulate ? "Run classroom" : "Start run"}
        </span>
        <span>
          <kbd>1</kbd>-<kbd>9</kbd> Jump to stage
        </span>
        <span>
          <kbd>R</kbd>Reset
        </span>
        <span>
          <kbd>Esc</kbd>Clear selection
        </span>
      </div>

      {notice && <p className="rail__notice">{notice}</p>}
      {backendDetected === false && !notice && (
        <p className="rail__notice rail__notice--quiet">
          No backend on /api/runs. Replaying the frozen sequence with the same
          AgentEvent contract the live stream uses.
        </p>
      )}

      {editorOpen && (
        <div className="rail__editor">
          <label className="field">
            <span className="field__label">
              Assignment text{fileName ? ` — ${fileName}` : ""}
            </span>
            <textarea
              value={assignmentText}
              onChange={(event) => setAssignmentText(event.target.value)}
              rows={8}
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span className="field__label">Teaching intent</span>
            <textarea
              value={teachingIntent}
              onChange={(event) => setTeachingIntent(event.target.value)}
              rows={3}
            />
            <button
              type="button"
              className="chip-button chip-button--tiny"
              onClick={() => {
                setAssignmentText(mockAssignment.source_text);
                setTeachingIntent(mockAssignment.teaching_intent);
                setFileName(null);
              }}
            >
              Restore sample
            </button>
          </label>
        </div>
      )}
    </header>
  );
}
