import {
  accessibilityPlanSchema,
  supportLabels,
  type AccessibilityLayer,
  type AccessibilityPlan,
  type AgentResult,
  type DeliveryChannel,
  type DeliveryDirective,
  type GroupingPlan,
  type RoomId,
  type StudentContext,
  type SupportId,
} from "@/contracts";
import { buildAgentResult, type AgentContext } from "../agentRuntime";
import { round4 } from "../deterministic";

/**
 * Accessibility Agent.
 *
 * Consumes: `groups.proposed`
 * Publishes: `accessibility.layers.ready`
 *
 * This agent is a delivery layer and nothing else. It changes how work is
 * presented, paced, revealed, and ordered. It never changes what is being
 * learned, never removes academic content, and never proposes a change to a
 * documented support: that decision belongs to a human.
 */
export const AGENT = "accessibility_agent" as const;

type SupportRule = {
  channel: DeliveryChannel;
  directive: string;
};

/**
 * Documented support to delivery directive. Every entry is presentational:
 * none of them alters the objective, the item count, or the rigour.
 */
export const SUPPORT_RULES: Record<SupportId, SupportRule> = {
  extended_time: {
    channel: "pacing",
    directive:
      "Time targets extended by 50 percent with no visible countdown on the item.",
  },
  text_to_speech: {
    channel: "presentation",
    directive:
      "Every prompt is exposed to text-to-speech with expressions read as words.",
  },
  reduced_visual_density: {
    channel: "visibility",
    directive:
      "One item on screen at a time, decorative elements hidden, whitespace preserved.",
  },
  chunked_steps: {
    channel: "sequencing",
    directive:
      "Each item is delivered as labelled sub-steps that reveal one at a time.",
  },
  chunked_instructions: {
    channel: "sequencing",
    directive:
      "Instructions are split into predictable, labelled chunks with progress markers.",
  },
  read_aloud_directions: {
    channel: "presentation",
    directive:
      "Directions are read aloud once before the first item and repeatable on request.",
  },
  read_aloud: {
    channel: "presentation",
    directive:
      "Prompt and direction text can be read aloud on demand.",
  },
  manipulative_visuals: {
    channel: "presentation",
    directive:
      "Tile and chip manipulatives are available beside every item that uses them.",
  },
  visual_supports: {
    channel: "presentation",
    directive:
      "A visual model or number-line scaffold is available without changing item content.",
  },
  visual_model: {
    channel: "presentation",
    directive:
      "Worked visual models appear beside scaffolded practice items.",
  },
  frequent_check_ins: {
    channel: "pacing",
    directive:
      "A short check-in prompt appears after every second item without pausing the work.",
  },
  reduced_distraction: {
    channel: "visibility",
    directive:
      "Nonessential motion and decorative UI are hidden while the student works.",
  },
  reduced_language_load: {
    channel: "presentation",
    directive:
      "Directions use concise wording while preserving all math vocabulary.",
  },
  translated_glossary: {
    channel: "presentation",
    directive:
      "An operation-verb glossary is available in the student's home language.",
  },
  large_print: {
    channel: "visibility",
    directive: "Minimum 18pt type with the high-contrast theme enabled.",
  },
  quiet_start: {
    channel: "sequencing",
    directive:
      "The first item opens in a low-stimulus screen with no timer and no leaderboard.",
  },
  manipulatives: {
    channel: "presentation",
    directive:
      "Virtual manipulatives are available as optional scratch-work aids.",
  },
};

export function directivesForSupports(
  supports: SupportId[],
): DeliveryDirective[] {
  return [...supports]
    .sort()
    .map((support) => ({
      channel: SUPPORT_RULES[support].channel,
      directive: SUPPORT_RULES[support].directive,
      derived_from: support,
    }));
}

export function buildAccessibilityLayer(
  context: StudentContext,
  roomId: RoomId,
): AccessibilityLayer {
  const directives = directivesForSupports(context.documented_supports);

  const notes =
    directives.length > 0
      ? `Delivery adjusted for ${context.documented_supports
          .map((s) => supportLabels[s].toLowerCase())
          .join(", ")}. Same objectives, same item count, same rigour.`
      : "No documented supports on file. Standard delivery, unchanged objectives.";

  return {
    student_id: context.student_id,
    room_id: roomId,
    documented_supports: context.documented_supports,
    directives,
    objectives_modified: false,
    academic_content_removed: false,
    support_change_proposed: false,
    notes,
  };
}

export function buildAccessibilityPlan(
  contexts: StudentContext[],
  grouping: GroupingPlan,
): AccessibilityPlan {
  const roomByStudent = new Map<string, RoomId>(
    grouping.placements.map((p) => [p.student_id, p.room_id]),
  );

  const layers = [...contexts]
    .sort((a, b) => (a.student_id < b.student_id ? -1 : 1))
    .map((context) =>
      buildAccessibilityLayer(context, roomByStudent.get(context.student_id)!),
    );

  const roomDeliveryNotes = grouping.rooms.map((room) => {
    const roomLayers = layers.filter((l) => l.room_id === room.room_id);
    const channels = new Set(
      roomLayers.flatMap((l) => l.directives.map((d) => d.channel)),
    );
    const channelText =
      channels.size > 0
        ? `Active delivery channels: ${[...channels].sort().join(", ")}.`
        : "No delivery adjustments required.";
    return {
      room_id: room.room_id,
      note: `${room.name} delivers the same ${room.dominant_barrier.toLowerCase()} work to every member. ${channelText}`,
    };
  });

  return {
    layers,
    room_delivery_notes: roomDeliveryNotes,
    invariants: {
      delivery_layer_only: true,
      objectives_preserved: true,
      support_changes_require_human: true,
    },
  };
}

export function runAccessibility(
  ctx: AgentContext,
  contexts: StudentContext[],
  grouping: GroupingPlan,
): AgentResult<AccessibilityPlan> {
  const plan = buildAccessibilityPlan(contexts, grouping);

  // Every directive is a direct lookup from a documented support, so there is
  // no inference to be uncertain about.
  const withSupports = plan.layers.filter(
    (l) => l.documented_supports.length > 0,
  ).length;
  const confidence = round4(withSupports > 0 ? 0.97 : 0.9);

  const result = buildAgentResult(accessibilityPlanSchema, {
    run_id: ctx.run_id,
    agent: AGENT,
    confidence,
    evidence_refs: plan.layers.flatMap((layer) =>
      layer.documented_supports.map(
        (support) => `student:${layer.student_id}#support:${support}`,
      ),
    ),
    result: plan,
    human_review_required: false,
  });

  ctx.emit("accessibility.layers.ready", AGENT, {
    layer_count: plan.layers.length,
    students_with_supports: withSupports,
    layers: plan.layers.map((layer) => ({
      student_id: layer.student_id,
      room_id: layer.room_id,
      supports: layer.documented_supports,
      channels: [...new Set(layer.directives.map((d) => d.channel))].sort(),
    })),
    invariants: plan.invariants,
    confidence: result.confidence,
  });

  return result;
}
