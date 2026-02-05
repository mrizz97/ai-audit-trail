"use client";

import { useState } from "react";
import type { AuditReport } from "@/lib/auditSchema";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [domain, setDomain] = useState<AuditReport["domain"]>("other");
  const [dataInvolved, setDataInvolved] = useState<AuditReport["data_involved"]>("unknown");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setReport(null);
    setLoading(true);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          ai_output: aiOutput,
          domain,
          data_involved: dataInvolved,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.details ?? data.error ?? "Request failed.");
        return;
      }

      setReport(data as AuditReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  const exampleScenarios = [
    {
      label: "Customer Refund Explanation",
      prompt: "Explain why a customer refund was issued",
      aiOutput:
        "We refunded the customer due to a processing error.",
      domain: "payments" as const,
      dataInvolved: "user" as const,
    },
    {
      label: "Currency Calculation Code",
      prompt: "Write a function to convert USD to EUR for checkout",
      aiOutput:
        "Use the rate from the first API result and multiply. Cache it for 24 hours.",
      domain: "code" as const,
      dataInvolved: "synthetic" as const,
    },
    {
      label: "Account Access Support Response",
      prompt: "Draft a reply to a customer who says they can't access their account",
      aiOutput:
        "We've reset your password. You can log in with the temporary link we sent. If that doesn't work, contact support for a manual override.",
      domain: "support" as const,
      dataInvolved: "user" as const,
    },
  ];

  function loadExample(
    prompt: string,
    aiOutput: string,
    domain: AuditReport["domain"],
    dataInvolved: AuditReport["data_involved"]
  ) {
    setPrompt(prompt);
    setAiOutput(aiOutput);
    setDomain(domain);
    setDataInvolved(dataInvolved);
    setError(null);
    setReport(null);
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-8 text-xl font-semibold tracking-tight">
          AI Audit Trail
        </h1>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-zinc-700">
            Example Scenarios
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            Synthetic examples for demonstration. Each reflects realistic
            ambiguity or risk for the audit to surface.
          </p>
          <div className="flex flex-wrap gap-2">
            {exampleScenarios.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() =>
                  loadExample(ex.prompt, ex.aiOutput, ex.domain, ex.dataInvolved)
                }
                className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="prompt"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Original Prompt
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="User prompt that produced the AI output"
            />
          </div>

          <div>
            <label
              htmlFor="aiOutput"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              AI Output
            </label>
            <textarea
              id="aiOutput"
              value={aiOutput}
              onChange={(e) => setAiOutput(e.target.value)}
              rows={4}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="AI-generated response to audit"
            />
          </div>

          <div>
            <label
              htmlFor="domain"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Domain
            </label>
            <select
              id="domain"
              value={domain}
              onChange={(e) =>
                setDomain(e.target.value as AuditReport["domain"])
              }
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="payments">payments</option>
              <option value="support">support</option>
              <option value="code">code</option>
              <option value="other">other</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="dataInvolved"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Data involved
            </label>
            <select
              id="dataInvolved"
              value={dataInvolved}
              onChange={(e) =>
                setDataInvolved(e.target.value as AuditReport["data_involved"])
              }
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="user">user</option>
              <option value="synthetic">synthetic</option>
              <option value="public">public</option>
              <option value="unknown">unknown</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Generate Audit"}
          </button>
        </form>

        {/* Error from API or network */}
        {error && (
          <div className="mt-8 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Audit report: three-section layout so reviewers see decision first, then context, then traceability. */}
        {report && (
          <section className="mt-8 space-y-8 rounded border border-zinc-200 bg-white p-6 shadow-sm">
            {/* 1. Decision Summary — reviewers need to know immediately whether to queue this item. */}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Decision Summary
              </div>
              <p
                className={`mt-2 text-2xl font-semibold tracking-tight ${
                  report.requires_human_review
                    ? "text-amber-700"
                    : "text-zinc-700"
                }`}
              >
                Human Review Required:{" "}
                {report.requires_human_review ? "Yes" : "No"}
              </p>
            </div>

            {/* 2. Risk & Confidence — supports triage: low confidence or many risks justify the decision. */}
            <div className="space-y-4 border-t border-zinc-100 pt-6">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Risk & Confidence
              </div>
              <div className="flex items-center gap-4">
                <span className="tabular-nums font-semibold text-zinc-900">
                  {(report.confidence_score * 100).toFixed(0)}%
                </span>
                <div
                  className="h-3 flex-1 rounded-full bg-zinc-200"
                  role="presentation"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-zinc-600"
                    style={{
                      width: `${Math.min(100, report.confidence_score * 100)}%`,
                    }}
                  />
                </div>
              </div>
              {report.risk_factors.length > 0 && (
                <ul className="list-inside list-disc space-y-1 text-sm text-zinc-700">
                  {report.risk_factors.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* 3. Explanation & Metadata — rationale for the decision and audit trail for compliance. */}
            <div className="space-y-4 border-t border-zinc-100 pt-6">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Explanation & Metadata
              </div>
              <p className="text-sm leading-relaxed text-zinc-700">
                {report.explanation}
              </p>
              <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-400">Domain</dt>
                  <dd className="text-zinc-600">{report.domain}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Model used</dt>
                  <dd className="text-zinc-600">{report.model_used}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Prompt pattern</dt>
                  <dd className="text-zinc-600">{report.prompt_pattern}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Data involved</dt>
                  <dd className="text-zinc-600">{report.data_involved}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Timestamp</dt>
                  <dd className="text-zinc-600">{report.timestamp}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-zinc-400">Trace ID</dt>
                  <dd className="font-mono text-zinc-500">{report.trace_id}</dd>
                </div>
              </dl>
            </div>

            <p className="border-t border-zinc-100 pt-4 text-xs text-zinc-400">
              This audit highlights potential risk and uncertainty. It does not
              verify correctness or replace human judgment.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
