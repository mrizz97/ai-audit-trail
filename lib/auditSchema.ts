import { z } from "zod";

/** Request body for POST /api/audit: the content to be audited. */
export const AuditRequestSchema = z.object({
  prompt: z.string(),
  ai_output: z.string(),
  domain: z.enum(["payments", "support", "code", "other"]),
});

export type AuditRequest = z.infer<typeof AuditRequestSchema>;

/**
 * Schema for an AI audit report. Used to validate and type audit records
 * produced by the system, ensuring consistency for storage, APIs, and compliance.
 */
export const AuditReportSchema = z.object({
  /** Unique id for the entire request/response flow. Product: correlates logs and events across services. Trust: enables reproducible investigation. Compliance: supports audit trails and non-repudiation. */
  trace_id: z.string().uuid(),

  /** Identifier of the model that generated the output (e.g. "gpt-4", "claude-3"). Product: model comparison and cost/usage. Trust: accountability for which system produced the content. Compliance: required for AI governance and incident attribution. */
  model_used: z.string(),

  /** Short, non-PII summary of the user prompt (e.g. intent or topic). Product: search and analytics without storing raw prompts. Trust: explains what was audited without exposing sensitive input. Compliance: supports review and retention policies while limiting PII. */
  prompt_summary: z.string().max(500),

  /** Business domain of the interaction. Product: routing, SLAs, and domain-specific dashboards. Trust: applies the right policies and reviewers per domain. Compliance: domain-specific regulations (e.g. payments vs support). */
  domain: z.enum(["payments", "support", "code", "other"]),

  /** Classification of how sensitive the involved data is. Product: determines retention, access, and alerting. Trust: ensures high-sensitivity items get stricter handling. Compliance: drives encryption, access control, and retention (e.g. PCI, HIPAA). */
  data_sensitivity: z.enum(["low", "medium", "high"]),

  /** List of detected risk indicators (e.g. "financial_advice", "pii_mentioned", "hallucination_risk"). Product: filtering and prioritization in dashboards. Trust: transparent, machine-readable reasons for flags. Compliance: evidence for why an item was escalated or restricted. */
  risk_factors: z.array(z.string()),

  /** Model/grader confidence in the audit assessment (0–1). Product: sorting and triage (low confidence first). Trust: avoids over-trusting low-confidence automated decisions. Compliance: supports “human in the loop” thresholds and documentation. */
  confidence_score: z.number().min(0).max(1),

  /** Whether this report should be queued for human review. Product: drives review queues and SLA tracking. Trust: ensures high-risk or low-confidence cases get human oversight. Compliance: often required for high-sensitivity or high-risk AI outputs. */
  requires_human_review: z.boolean(),

  /** Short, human-readable rationale for the audit result. Product: helps reviewers and support understand quickly. Trust: explainability for users and auditors. Compliance: supports documented reasoning for decisions and appeals. */
  explanation: z.string().max(2000),

  /** When the audit was produced (ISO 8601). Product: time-series analytics and SLAs. Trust: ordering and causality of events. Compliance: required for audit trails and retention/legal hold. */
  timestamp: z.string().datetime({ offset: true }),
});

export type AuditReport = z.infer<typeof AuditReportSchema>;
