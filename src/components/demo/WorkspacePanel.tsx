"use client";

import { useId, useState, type KeyboardEvent } from "react";
import {
  AtriumIcon,
  type AtriumIconName,
} from "@/components/ui/atrium-icons";
import type { GraphOverlay } from "@/world/types";
import type { RunProjection } from "@/world/runState";
import { AgentFeed } from "@/components/panels/AgentFeed";
import { AssignmentMorphPanel } from "@/components/panels/AssignmentMorphPanel";
import { DetailPanel } from "@/components/panels/DetailPanel";
import type { Selection } from "./useAtrium";

type WorkspaceTab = "details" | "activity" | "assignment";

const WORKSPACE_TABS: ReadonlyArray<{
  id: WorkspaceTab;
  label: string;
  icon: AtriumIconName;
}> = [
  { id: "details", label: "Details", icon: "details" },
  { id: "activity", label: "Activity", icon: "activity" },
  { id: "assignment", label: "Assignment", icon: "assignment" },
];

function selectionKey(selection: Selection): string {
  switch (selection.kind) {
    case "student":
      return `student:${selection.studentId}`;
    case "room":
      return `room:${selection.roomId}`;
    case "event":
      return `event:${selection.eventId}`;
    case "plan_item":
      return `plan_item:${selection.itemId}`;
    case "building":
      return `building:${selection.id}`;
    case "graph":
      return `graph:${selection.nodeId}`;
    case "none":
      return "none";
  }
}

export type WorkspacePanelProps = {
  selection: Selection;
  projection: RunProjection;
  onSelect: (selection: Selection) => void;
  onApprove: (reviewId: string) => void;
  graph?: GraphOverlay;
};

export function WorkspacePanel({
  selection,
  projection,
  onSelect,
  onApprove,
  graph,
}: WorkspacePanelProps) {
  const currentSelectionKey = selectionKey(selection);
  const [workspaceState, setWorkspaceState] = useState<{
    activeTab: WorkspaceTab;
    selectionKey: string;
  }>({
    activeTab: "details",
    selectionKey: currentSelectionKey,
  });
  const idPrefix = useId();
  const eventCount = projection.events.length;
  const assignmentStatus =
    projection.variants.length > 0
      ? String(projection.variants.length)
      : projection.assignment
        ? "Ready"
        : null;

  if (workspaceState.selectionKey !== currentSelectionKey) {
    setWorkspaceState({
      activeTab:
        selection.kind === "none" ? workspaceState.activeTab : "details",
      selectionKey: currentSelectionKey,
    });
  }

  const activeTab =
    workspaceState.selectionKey === currentSelectionKey
      ? workspaceState.activeTab
      : selection.kind === "none"
        ? workspaceState.activeTab
        : "details";

  const selectTab = (tab: WorkspaceTab) => {
    setWorkspaceState({ activeTab: tab, selectionKey: currentSelectionKey });
  };

  const moveTabFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    nextTab: WorkspaceTab,
  ) => {
    event.preventDefault();
    selectTab(nextTab);
    const tabList = event.currentTarget.closest('[role="tablist"]');
    tabList
      ?.querySelector<HTMLButtonElement>(`[data-workspace-tab="${nextTab}"]`)
      ?.focus();
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    tab: WorkspaceTab,
  ) => {
    const index = WORKSPACE_TABS.findIndex((candidate) => candidate.id === tab);
    if (event.key === "Home") {
      moveTabFocus(event, WORKSPACE_TABS[0].id);
    } else if (event.key === "End") {
      moveTabFocus(event, WORKSPACE_TABS[WORKSPACE_TABS.length - 1].id);
    } else if (event.key === "ArrowRight") {
      moveTabFocus(event, WORKSPACE_TABS[(index + 1) % WORKSPACE_TABS.length].id);
    } else if (event.key === "ArrowLeft") {
      moveTabFocus(
        event,
        WORKSPACE_TABS[(index - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length].id,
      );
    }
  };

  return (
    <section className="workspace" aria-label="Run workspace">
      <div className="workspace__tabs" role="tablist" aria-label="Run workspace views">
        {WORKSPACE_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          const tabId = `${idPrefix}-${tab.id}-tab`;
          const panelId = `${idPrefix}-${tab.id}-panel`;

          return (
            <button
              key={tab.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              data-workspace-tab={tab.id}
              className={`workspace__tab${selected ? " workspace__tab--active" : ""}`}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              <AtriumIcon name={tab.icon} size={18} />
              <span>{tab.label}</span>
              {tab.id === "activity" && (
                <span
                  className="workspace__tab-count"
                  aria-label={`${eventCount} events`}
                >
                  {eventCount}
                </span>
              )}
              {tab.id === "assignment" && assignmentStatus && (
                <span
                  className="workspace__tab-status"
                  aria-label={
                    projection.variants.length > 0
                      ? `${projection.variants.length} assignment variants ready`
                      : "Assignment ready"
                  }
                >
                  {assignmentStatus}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id={`${idPrefix}-details-panel`}
        className="workspace__panel"
        role="tabpanel"
        aria-labelledby={`${idPrefix}-details-tab`}
        hidden={activeTab !== "details"}
      >
        <DetailPanel
          selection={selection}
          projection={projection}
          onSelect={onSelect}
          onApprove={onApprove}
          graph={graph}
        />
      </div>

      <div
        id={`${idPrefix}-activity-panel`}
        className="workspace__panel workspace__panel--activity"
        role="tabpanel"
        aria-labelledby={`${idPrefix}-activity-tab`}
        hidden={activeTab !== "activity"}
      >
        <AgentFeed
          projection={projection}
          selection={selection}
          onSelect={onSelect}
        />
      </div>

      <div
        id={`${idPrefix}-assignment-panel`}
        className="workspace__panel workspace__panel--assignment"
        role="tabpanel"
        aria-labelledby={`${idPrefix}-assignment-tab`}
        hidden={activeTab !== "assignment"}
      >
        <AssignmentMorphPanel projection={projection} />
      </div>
    </section>
  );
}
