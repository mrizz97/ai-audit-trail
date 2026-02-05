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
    const message = parseResult.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    return NextResponse.json(
      { error: "Request validation failed.", details: message },
      { status: 400 }
    );
  }

  const { prompt, ai_output, domain } = parseResult.data;

  // --- 2. Call LLM with conservative prompt; force JSON matching AuditReportSchema ---
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
- Be conservative
- Lower confidence when assumptions are unclear
- Identify financial, privacy, or hallucination risks
- Require human review when ambiguity exists
- Avoid overconfidence or definitive language

Return ONLY valid JSON that matches the provided schema.

Schema (all fields required):
{
  "trace_id": "<UUID v4 string>",
  "model_used": "<string, e.g. the model name if known or 'unknown'>",
  "prompt_summary": "<string, short non-PII summary of the user prompt, max 500 chars>",
  "domain": "payments" | "support" | "code" | "other",
  "data_sensitivity": "low" | "medium" | "high",
  "risk_factors": ["<string>", ...],
  "confidence_score": <number between 0 and 1>,
  "requires_human_review": <boolean>,
  "explanation": "<string, concise human-readable rationale, max 2000 chars>",
  "timestamp": "<ISO 8601 with offset, e.g. 2024-01-15T12:00:00.000Z>"
}`;

  const userPrompt = `Domain (use exactly as given): ${domain}

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

  // --- 3. Validate LLM output with Zod (fail closed: do not guess or fix) ---
  // We use parse() + try/catch so that invalid reports throw and we always return 400
  // for schema violations. 400 signals client/LLM that the payload was rejected;
  // we never return a partially-valid or corrected report, only the exact validated object.
  let report;
  try {
    report = AuditReportSchema.parse(data);
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
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
