import { z } from "zod";

/**
 * Vocabulary shared by every branch. Frozen per docs/CONTRACTS.md.
 * Only change through team agreement.
 */

export const conceptIds = [
  "integer_operations",
  "distributive_property",
  "equation_sequencing",
  "combining_like_terms",
] as const;

export const conceptIdSchema = z.enum(conceptIds);
export type ConceptId = z.infer<typeof conceptIdSchema>;

export const conceptLabels: Record<ConceptId, string> = {
  integer_operations: "Integer Operations",
  distributive_property: "Distributive Property",
  equation_sequencing: "Equation Sequencing",
  combining_like_terms: "Combining Like Terms",
};

/**
 * Documented accommodations. These are delivery-layer inputs only.
 * They must never be used as academic grouping signal.
 */
export const supportIds = [
  "extended_time",
  "text_to_speech",
  "reduced_visual_density",
  "chunked_steps",
  "chunked_instructions",
  "read_aloud_directions",
  "read_aloud",
  "manipulative_visuals",
  "visual_supports",
  "visual_model",
  "frequent_check_ins",
  "reduced_distraction",
  "reduced_language_load",
  "translated_glossary",
  "large_print",
  "quiet_start",
  "manipulatives",
] as const;

export const supportIdSchema = z.enum(supportIds);
export type SupportId = z.infer<typeof supportIdSchema>;

export const supportLabels: Record<SupportId, string> = {
  extended_time: "Extended time",
  text_to_speech: "Text to speech",
  reduced_visual_density: "Reduced visual density",
  chunked_steps: "Chunked steps",
  chunked_instructions: "Chunked instructions",
  read_aloud_directions: "Read-aloud directions",
  read_aloud: "Read aloud",
  manipulative_visuals: "Manipulative visuals",
  visual_supports: "Visual supports",
  visual_model: "Visual model",
  frequent_check_ins: "Frequent check-ins",
  reduced_distraction: "Reduced distraction",
  reduced_language_load: "Reduced language load",
  translated_glossary: "Translated glossary",
  large_print: "Large print",
  quiet_start: "Quiet start",
  manipulatives: "Manipulatives",
};

/**
 * Academic barriers observed in student work. These are the only
 * signals allowed to drive grouping.
 */
export const misconceptionIds = [
  "sign_error_negatives",
  "sign_error_on_subtraction",
  "sign_drop_on_distribution",
  "drops_negative_coefficient",
  "partial_distribution",
  "distributes_only_first_term",
  "operation_order_confusion",
  "operation_order_inversion",
  "loses_track_of_multi_step_order",
  "inverse_operation_misapplied",
  "reverses_inverse_operation",
  "combines_unlike_terms",
  "like_terms_overcombine",
  "like_terms_over_merge",
] as const;

export const misconceptionIdSchema = z.enum(misconceptionIds);
export type MisconceptionId = z.infer<typeof misconceptionIdSchema>;

export const misconceptionLabels: Record<MisconceptionId, string> = {
  sign_error_negatives: "Sign error with negative integers",
  sign_error_on_subtraction: "Sign error when subtracting a negative",
  sign_drop_on_distribution: "Drops a sign during distribution",
  drops_negative_coefficient: "Drops the negative on a coefficient",
  partial_distribution: "Distributes across only part of the expression",
  distributes_only_first_term: "Distributes to the first term only",
  operation_order_confusion: "Operations applied in the wrong order",
  operation_order_inversion: "Correct operations applied in the wrong order",
  loses_track_of_multi_step_order: "Loses track of multi-step order",
  inverse_operation_misapplied: "Applies the inverse operation to one side only",
  reverses_inverse_operation: "Reverses inverse operation",
  combines_unlike_terms: "Combines unlike terms",
  like_terms_overcombine: "Over-combines like and unlike terms",
  like_terms_over_merge: "Merges terms that are already simplified",
};

export const misconceptionConcept: Record<MisconceptionId, ConceptId> = {
  sign_error_negatives: "integer_operations",
  sign_error_on_subtraction: "integer_operations",
  sign_drop_on_distribution: "integer_operations",
  drops_negative_coefficient: "integer_operations",
  partial_distribution: "distributive_property",
  distributes_only_first_term: "distributive_property",
  operation_order_confusion: "equation_sequencing",
  operation_order_inversion: "equation_sequencing",
  loses_track_of_multi_step_order: "equation_sequencing",
  inverse_operation_misapplied: "equation_sequencing",
  reverses_inverse_operation: "equation_sequencing",
  combines_unlike_terms: "combining_like_terms",
  like_terms_overcombine: "combining_like_terms",
  like_terms_over_merge: "combining_like_terms",
};

export const roomIds = ["ember", "forge", "harbor", "summit"] as const;

export const roomIdSchema = z.enum(roomIds);
export type RoomId = z.infer<typeof roomIdSchema>;

export const roomNames = ["Ember", "Forge", "Harbor", "Summit"] as const;

export const roomNameSchema = z.enum(roomNames);
export type RoomName = z.infer<typeof roomNameSchema>;

export const roomNameById: Record<RoomId, RoomName> = {
  ember: "Ember",
  forge: "Forge",
  harbor: "Harbor",
  summit: "Summit",
};
