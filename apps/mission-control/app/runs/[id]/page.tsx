"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Check {
  name: string;
  phase: string;
  passed: boolean;
  detail: string;
}
interface Step {
  id: string;
  name: string;
  status: string;
  engineId?: string;
  output?: unknown;
  error?: string;
  checks: Check[];
}
interface Run {
  id: string;
  workflowId: string;
  status: string;
  confidence?: { score: number; rationale: string; requiresHumanApproval: boolean };
  input?: unknown;
}

const card: React.CSSProperties = {
  background: "#11161f",
  border: "1px solid #21262d",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};
const btn: React.CSSProperties = {
  background: "#1f6feb",
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "6px 12px",
  cursor: "pointer",
  marginRight: 6,
};
const statusColor: Record<string, string> = {
  completed: "#3fb950",
  failed: "#f85149",
  running: "#d29922",
  paused: "#a371f7",
  cancelled: "#7d8590",
};

export default function RunDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/runs/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setRun(data.run);
    setSteps(data.steps);
  }, [id]);

  useEffect(() => {
    void refresh();
    const es = new EventSource("/api/stream");
    es.onmessage = () => void refresh();
    return () => es.close();
  }, [refresh]);

  const control = async (action: string) => {
    await fetch(`/api/runs/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await refresh();
  };

  if (!run) return <div style={{ color: "#7d8590" }}>Loading run {id}…</div>;

  // A gated run completes with a "pending-approval" final step; offer to re-run with approval.
  const lastOutput = steps.at(-1)?.output as { status?: string } | undefined;
  const pendingApproval = lastOutput?.status === "pending-approval";

  const approve = async () => {
    const input = { ...(run.input as Record<string, unknown>), approved: true };
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowId: run.workflowId, input }),
    });
    const data = await res.json();
    if (data.runId) window.location.href = `/runs/${data.runId}`;
  };

  return (
    <div>
      <a href="/" style={{ color: "#58a6ff", fontSize: 13 }}>
        ← all runs
      </a>
      <div style={{ ...card, marginTop: 12 }}>
        <h2 style={{ margin: "0 0 8px" }}>
          {run.workflowId}{" "}
          <span style={{ color: statusColor[run.status] ?? "#7d8590", fontSize: 14 }}>
            ● {run.status}
          </span>
        </h2>
        <div style={{ color: "#7d8590", fontSize: 12 }}>{run.id}</div>
        {run.confidence && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            Confidence: <b>{run.confidence.score.toFixed(2)}</b>
            {run.confidence.requiresHumanApproval && (
              <span style={{ color: "#d29922" }}> · ⚠ human approval required</span>
            )}
            <div style={{ color: "#7d8590" }}>{run.confidence.rationale}</div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button style={btn} onClick={() => control("pause")}>
            Pause
          </button>
          <button style={btn} onClick={() => control("resume")}>
            Resume
          </button>
          <button style={{ ...btn, background: "#b62324" }} onClick={() => control("stop")}>
            Stop
          </button>
          {pendingApproval && (
            <button style={{ ...btn, background: "#238636" }} onClick={approve}>
              ✓ Approve &amp; proceed
            </button>
          )}
        </div>
        {pendingApproval && (
          <div style={{ marginTop: 8, color: "#d29922", fontSize: 13 }}>
            ⚠ This run was gated for human approval. Approving re-runs it with side-effects enabled.
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Step timeline</h3>
        {steps.map((s, i) => (
          <div
            key={s.id}
            style={{ borderLeft: `3px solid ${statusColor[s.status] ?? "#30363d"}`, paddingLeft: 12, marginBottom: 14 }}
          >
            <div style={{ fontWeight: 600 }}>
              {i + 1}. {s.name}{" "}
              <span style={{ color: statusColor[s.status] ?? "#7d8590", fontSize: 12 }}>
                {s.status}
              </span>
              {s.engineId && (
                <span style={{ color: "#7d8590", fontSize: 11 }}> · engine: {s.engineId}</span>
              )}
            </div>
            {s.checks.length > 0 && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {s.checks.map((c) => (
                  <span key={c.name} style={{ marginRight: 10, color: c.passed ? "#3fb950" : "#f85149" }}>
                    {c.passed ? "✓" : "✗"} {c.name}
                  </span>
                ))}
              </div>
            )}
            {s.error && <div style={{ color: "#f85149", fontSize: 12 }}>error: {s.error}</div>}
            {s.output != null && (
              <pre
                style={{
                  background: "#0d1117",
                  border: "1px solid #21262d",
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 11,
                  color: "#9fb0c0",
                  overflow: "auto",
                  marginTop: 6,
                }}
              >
                {JSON.stringify(s.output, null, 2).slice(0, 1500)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
