"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RunRow {
  id: string;
  workflowId: string;
  status: string;
  nextStepIndex: number;
  confidence?: { score: number; requiresHumanApproval: boolean };
  updatedAt: string;
}
interface WorkflowRow {
  id: string;
  description: string;
  persona: string | null;
}
interface EngineRow {
  id: string;
  displayName: string;
}
interface Metrics {
  metrics: {
    totalRuns: number;
    byStatus: Record<string, number>;
    avgConfidence: number;
    approvalGated: number;
    engineUsage: Record<string, { steps: number; inputTokens: number; outputTokens: number }>;
  };
  calibrationError: number;
  learning: Record<string, { bestEngine?: string; lessons: string[] }>;
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

export default function Page() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [engines, setEngines] = useState<EngineRow[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [engineId, setEngineId] = useState("");
  const [input, setInput] = useState("fix the flaky login test");
  const [events, setEvents] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [runsRes, metricsRes] = await Promise.all([fetch("/api/runs"), fetch("/api/metrics")]);
    const data = await runsRes.json();
    setRuns(data.runs);
    setWorkflows(data.workflows);
    setEngines(data.engines);
    if (!workflowId && data.workflows[0]) setWorkflowId(data.workflows[0].id);
    if (metricsRes.ok) setMetrics(await metricsRes.json());
  }, [workflowId]);

  useEffect(() => {
    void refresh();
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      setEvents((prev) => [...prev.slice(-200), e.data]);
      void refresh();
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [events]);

  const start = async () => {
    await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowId, input, preferredEngineId: engineId || undefined }),
    });
    await refresh();
  };

  const control = async (id: string, action: string) => {
    await fetch(`/api/runs/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await refresh();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <div>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Start a workflow</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.id} {w.persona ? `(${w.persona})` : ""}
                </option>
              ))}
            </select>
            <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
              <option value="">auto (policy)</option>
              {engines.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.displayName}
                </option>
              ))}
            </select>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: 6 }}
            />
            <button style={btn} onClick={start}>
              Start
            </button>
          </div>
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Runs</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#7d8590" }}>
                <th>workflow</th>
                <th>status</th>
                <th>step</th>
                <th>confidence</th>
                <th>controls</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #21262d" }}>
                  <td>
                    <a href={`/runs/${r.id}`} style={{ color: "#58a6ff", textDecoration: "none" }}>
                      {r.workflowId}
                    </a>
                  </td>
                  <td>{r.status}</td>
                  <td>{r.nextStepIndex}</td>
                  <td>{r.confidence ? r.confidence.score.toFixed(2) : "—"}</td>
                  <td>
                    <button style={btn} onClick={() => control(r.id, "pause")}>
                      Pause
                    </button>
                    <button style={btn} onClick={() => control(r.id, "resume")}>
                      Resume
                    </button>
                    <button style={{ ...btn, background: "#b62324" }} onClick={() => control(r.id, "stop")}>
                      Stop
                    </button>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "#7d8590", paddingTop: 8 }}>
                    No runs yet — start one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Metrics</h3>
          {metrics ? (
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>
                Total runs: <b>{metrics.metrics.totalRuns}</b>
              </div>
              <div>
                {Object.entries(metrics.metrics.byStatus).map(([s, n]) => (
                  <span key={s} style={{ marginRight: 10, color: "#9fb0c0" }}>
                    {s}: {n}
                  </span>
                ))}
              </div>
              <div>
                Avg confidence: <b>{metrics.metrics.avgConfidence.toFixed(2)}</b> · gated:{" "}
                {metrics.metrics.approvalGated}
              </div>
              <div>
                Calibration error: <b>{metrics.calibrationError.toFixed(3)}</b>
              </div>
              <div style={{ marginTop: 6, color: "#7d8590" }}>Engine usage</div>
              {Object.entries(metrics.metrics.engineUsage).map(([e, u]) => (
                <div key={e} style={{ color: "#9fb0c0" }}>
                  {e}: {u.steps} steps, {u.outputTokens} out-tok
                </div>
              ))}
              {Object.entries(metrics.learning).some(([, l]) => l.bestEngine) && (
                <>
                  <div style={{ marginTop: 6, color: "#7d8590" }}>Learned best engine</div>
                  {Object.entries(metrics.learning)
                    .filter(([, l]) => l.bestEngine)
                    .map(([wf, l]) => (
                      <div key={wf} style={{ color: "#9fb0c0" }}>
                        {wf} → {l.bestEngine}
                      </div>
                    ))}
                </>
              )}
              {Object.entries(metrics.learning).some(([, l]) => l.lessons.length > 0) && (
                <>
                  <div style={{ marginTop: 6, color: "#7d8590" }}>Lessons learned</div>
                  {Object.entries(metrics.learning).flatMap(([wf, l]) =>
                    l.lessons.map((text, i) => (
                      <div key={`${wf}-${i}`} style={{ color: "#9fb0c0", fontSize: 12 }}>
                        <span style={{ color: "#7d8590" }}>{wf}:</span> {text}
                      </div>
                    )),
                  )}
                </>
              )}
            </div>
          ) : (
            <div style={{ color: "#7d8590" }}>No metrics yet — start a run.</div>
          )}
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Live events</h3>
        <div
          ref={logRef}
          style={{
            height: 480,
            overflow: "auto",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: "#9fb0c0",
          }}
        >
          {events.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
