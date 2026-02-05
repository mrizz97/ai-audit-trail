import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  AuditRequestSchema,
  AuditReportSchema,
} from "@/lib/auditSchema";

export async function GET() {
  return NextResponse.json({ message: "Audit API" });
}

/**
 * POST /api/audit
 *
 * Design principles (fail closed, risk surfacing, human review first-class):
 * - We validate all inputs and LLM output with Zod. Invalid data → 400. We never guess or
 *   auto-correct; false confidence is worse than failing.
 * - This endpoint surfaces risk and supports review; it does not approve or attest correctness.
 * - requires_human_review is a first-class outcome: when in doubt, we bias toward human review.
 * - LLM is called with low temperature to prioritize reliability over creativity.
 */
export async function POST(request: Request) {
  // --- 1. Validate request body (fail closed: no guessing, no defaults) ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  const parseResult = AuditRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const message = parseResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return NextResponse.json(
      { error: "Request validation failed.", details: message },
      { status: 400 }
    );
  }

  const { prompt, ai_output, domain, data_involved } = parseResult.data;

  // Server-authoritative metadata: not delegated to the LLM.
  const MODEL_USED = "gpt-4o-mini";
  const PROMPT_PATTERN = "audit-risk-v1";

  // --- 2. Call LLM with conservative prompt; force JSON matching report shape ---
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Audit service not configured (missing OPENAI_API_KEY)." },
      { status: 500 }
    );
  }

  const systemPrompt = `You are an AI audit system reviewing AI-assisted outputs used in sensitive workflows.

Your role is NOT to verify correctness.
Your role is to surface uncertainty and risk.

Instructions:
- Be conservative. Lower confidence when assumptions are unclear. Require human review when ambiguous.
- Avoid overconfidence or definitive language.
- Explicitly consider and flag (in risk_factors and explanation) where relevant:
  - Hallucination: invented facts, unsupported claims, or plausible-sounding falsehoods
  - Bias/fairness: unfair treatment, stereotyping, or discriminatory implications
  - Privacy/PII: exposure or handling of personal or identifiable data
  - Financial correctness: money, amounts, rates, or commitments that could be wrong or misleading
  - Account/security: access, credentials, permissions, or security-sensitive advice
- When any of these risks are present or uncertain, set requires_human_review to true and lower confidence_score.

Return ONLY valid JSON with exactly these fields (all required). Do not include trace_id, model_used, prompt_pattern, timestamp, or data_involved — they are set server-side.

Schema:
{
  "prompt_summary": "<string, short non-PII summary of the user prompt, max 500 chars>",
  "domain": "payments" | "support" | "code" | "other",
  "data_sensitivity": "low" | "medium" | "high",
  "risk_factors": ["<string>", ...],
  "confidence_score": <number between 0 and 1>,
  "requires_human_review": <boolean>,
  "explanation": "<string, concise human-readable rationale, max 2000 chars>"
}`;

  const userPrompt = `Domain (use exactly as given): ${domain}
Data involved (use exactly as given): ${data_involved}
Take data_involved into account when setting data_sensitivity and risk_factors: e.g. "user" implies higher sensitivity and privacy/PII risk; "synthetic" or "public" may allow lower sensitivity; "unknown" should bias toward conservative (higher sensitivity, more risk factors).

User prompt to summarize (do not include PII in prompt_summary):
${prompt}

AI output to audit:
${ai_output}

Return only the JSON object, no other text.`;

  let llmResponse: Response;
  try {
    llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM request failed.";
    return NextResponse.json(
      { error: "Audit service unavailable.", details: message },
      { status: 502 }
    );
  }

  if (!llmResponse.ok) {
    const text = await llmResponse.text();
    return NextResponse.json(
      {
        error: "Audit service error.",
        details: text || llmResponse.statusText,
      },
      { status: 502 }
    );
  }

  let data: unknown;
  try {
    const json = await llmResponse.json();
    const content = (json as { choices?: Array<{ message?: { content?: string } }> })
      ?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "Invalid response from audit service: missing content." },
        { status: 502 }
      );
    }
    data = JSON.parse(content);
  } catch {
    return NextResponse.json(
      { error: "Invalid response from audit service: not valid JSON." },
      { status: 502 }
    );
  }

  // --- 3. Merge server-authoritative metadata (overwrite any LLM-supplied values) ---
  const merged = {
    ...(typeof data === "object" && data !== null ? data : {}),
    trace_id: crypto.randomUUID(),
    model_used: MODEL_USED,
    prompt_pattern: PROMPT_PATTERN,
    timestamp: new Date().toISOString(),
    data_involved,
  };

  // --- 4. Validate full report with Zod (fail closed: do not guess or fix) ---
  // We use parse() + try/catch so that invalid reports throw and we always return 400
  // for schema violations. 400 signals client/LLM that the payload was rejected;
  // we never return a partially-valid or corrected report, only the exact validated object.
  let report;
  try {
    report = AuditReportSchema.parse(merged);
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")
        : "Audit output validation failed.";
    return NextResponse.json(
      {
        error: "Audit output validation failed; report rejected.",
        details: message,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(report);
}
