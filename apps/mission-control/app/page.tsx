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
  const logRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/runs");
    const data = await res.json();
    setRuns(data.runs);
    setWorkflows(data.workflows);
    setEngines(data.engines);
    if (!workflowId && data.workflows[0]) setWorkflowId(data.workflows[0].id);
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
                  <td>{r.workflowId}</td>
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
  );
}
