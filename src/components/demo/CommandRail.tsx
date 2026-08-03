"use client";

import { useRef, useState } from "react";
import { AtriumIcon } from "@/components/ui/atrium-icons";
import { AtriumSectionNav } from "@/components/ui/atrium-section-nav";
import { mockAssignment } from "@/world/mock/seed";
import type { AtriumController } from "./useAtrium";

const SPEEDS = [1, 2, 4];

export function CommandRail({ controller }: { controller: AtriumController }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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
    lessonProgress,
    nextLesson,
  } = controller;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setAssignmentText(text);
    setFileName(file.name);
    setEditorOpen(true);
  };

  const restoreSample = () => {
    setAssignmentText(String(mockAssignment.source_text ?? ""));
    setTeachingIntent(String(mockAssignment.teaching_intent ?? ""));
    setFileName(null);
  };

  const primaryLabel = canSimulate
    ? "Run classroom"
    : stage === "phase_one"
      ? "Building rooms"
      : stage === "phase_two"
        ? "Assessing work"
        : stage === "complete"
          ? "Start new run"
          : "Start run";
  const primaryDisabled = !canSimulate && !canStart;

  return (
    <header className="appbar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.markdown,text/plain"
        className="sr-only"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      <div className="appbar__top">
        <div className="brand" aria-label="Atrium">
          <span className="brand__wordmark">Atrium</span>
          <span className="brand__descriptor">Adaptive classroom intelligence</span>
        </div>

        <AtriumSectionNav current="classroom" />

        <div className="appbar__tools">
          <span className={`status-pill status-pill--${transport}`}>
            <AtriumIcon name="connection" size={18} />
            {transport === "live" ? "Live" : "Demo"}
          </span>
          <span className={`status-pill status-pill--stage status-pill--${stage}`}>
            {stageLabel}
          </span>
          <div className="speed-control" role="group" aria-label="Replay speed">
            <AtriumIcon name="speed" size={18} />
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                className="speed-control__option"
                onClick={() => setSpeed(value)}
                aria-pressed={speed === value}
              >
                {value}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Keyboard shortcuts"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((open) => !open)}
          >
            <AtriumIcon name="keyboard" />
          </button>
        </div>
      </div>

      {helpOpen && (
        <div className="shortcut-popover" role="note" aria-label="Keyboard shortcuts">
          <span><kbd>Enter</kbd>{canSimulate ? "Run classroom" : "Start run"}</span>
          <span><kbd>1-9</kbd>Select pipeline stage</span>
          <span><kbd>R</kbd>Reset</span>
          <span><kbd>Esc</kbd>Clear selection</span>
        </div>
      )}

      <section className="run-setup" aria-labelledby="run-setup-title">
        <div className="run-setup__summary">
          <span className="eyebrow">Run setup</span>
          <div className="run-setup__title-row">
            <h2 id="run-setup-title">{fileName ?? "Sample assignment"}</h2>
          </div>
          <p>{teachingIntent || "Add a teaching intent to guide the classroom agents."}</p>
        </div>

        <div className="run-setup__actions">
          <button
            type="button"
            className="control-button"
            onClick={() => setEditorOpen((open) => !open)}
            aria-expanded={editorOpen}
          >
            <AtriumIcon name="assignment" />
            Assignment
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => void (canSimulate ? simulate() : startRun())}
            disabled={primaryDisabled}
          >
            <AtriumIcon name={canSimulate ? "classroom" : "start"} />
            {primaryLabel}
          </button>
          {lessonProgress?.next && (
            <button
              type="button"
              className="control-button"
              onClick={nextLesson}
              disabled={!lessonProgress.can_advance}
              title={lessonProgress.can_advance ? `Open lesson ${lessonProgress.next.position + 1}` : "Finish this lesson's assignment first"}
            >
              <AtriumIcon name="sequence" />
              Next lesson →
            </button>
          )}
          <div className="utility-menu">
            <button
              type="button"
              className="icon-button icon-button--bordered"
              aria-label="More run actions"
              aria-expanded={utilityOpen}
              onClick={() => setUtilityOpen((open) => !open)}
            >
              <AtriumIcon name="more" />
            </button>
            {utilityOpen && (
              <div className="utility-menu__popover" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUtilityOpen(false);
                    fileInputRef.current?.click();
                  }}
                >
                  <AtriumIcon name="upload" size={20} />
                  Upload file
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUtilityOpen(false);
                    skipAnimation();
                  }}
                >
                  <AtriumIcon name="skip" size={20} />
                  Skip animation
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="utility-menu__danger"
                  onClick={() => {
                    setUtilityOpen(false);
                    reset();
                  }}
                >
                  <AtriumIcon name="reset" size={20} />
                  Reset run
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {(notice || backendDetected === false) && (
        <p className={`appbar__notice${notice ? "" : " appbar__notice--quiet"}`}>
          {notice ?? "The live API is unavailable, so Atrium will replay the same typed event contract locally."}
        </p>
      )}

      {editorOpen && (
        <section className="assignment-editor" aria-label="Assignment editor">
          <label className="field">
            <span className="field__label">Assignment text</span>
            <textarea
              value={assignmentText}
              onChange={(event) => setAssignmentText(event.target.value)}
              rows={7}
              spellCheck={false}
            />
          </label>
          <div className="assignment-editor__intent">
            <label className="field">
              <span className="field__label">Teaching intent</span>
              <textarea
                value={teachingIntent}
                onChange={(event) => setTeachingIntent(event.target.value)}
                rows={4}
              />
            </label>
            <div className="assignment-editor__actions">
              <button type="button" className="text-button" onClick={() => fileInputRef.current?.click()}>
                <AtriumIcon name="upload" size={20} />
                Upload file
              </button>
              <button type="button" className="text-button" onClick={restoreSample}>
                <AtriumIcon name="reset" size={20} />
                Restore sample
              </button>
            </div>
          </div>
        </section>
      )}
    </header>
  );
}
