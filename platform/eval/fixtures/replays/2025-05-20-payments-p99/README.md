# Replay fixture: 2025-05-20 payments-api p99 spike

Ground-truth bundle for the `correlate-deploy-to-alert` skill and the
`sre.incident-brief` workflow eval. Replays a real (anonymised) regression:
PR-812 tightened the retry policy on `payments-api`, deployed as v2.4.1
at 14:28 UTC, caused p99 latency to spike at 14:32. Reverted at 14:51.

## Files

| Path | Purpose |
|---|---|
| `manifest.yaml` | Fixture index, ground truth, expected outcomes |
| `graph/nodes.yaml` | Knowledge-graph nodes (services, deploys, commits, PRs, alerts) |
| `graph/edges.yaml` | Knowledge-graph edges between the above |
| `retrieval/items.yaml` | KnowledgeItems with bodies + embeddings stubs |
| `tools/grafana.get_alert.json` | Pre-recorded tool response |
| `tools/bamboo.list_deploys.json` | Pre-recorded tool response |
| `tools/trace.json` | Pre-recorded `trace` tool response |

## How it's loaded

```
agentctl eval workflow sre.incident-brief \
    --case incident-brief-001 \
    --replay replays/2025-05-20-payments-p99
```

The replay harness:
1. Loads `graph/*` into a local Neo4j instance.
2. Loads `retrieval/items.yaml` into a local pgvector + OpenSearch.
3. Registers pre-recorded `tools/*.json` responses with a mock Tool Gateway.
4. Triggers the workflow with `manifest.yaml.inputs`.
5. Compares output against `manifest.yaml.expected` and runs judges.

Tool responses are pre-recorded so the eval is **deterministic** — same
inputs, same fixture, same expected outcome. Only the LLM generation
varies between runs, which is what the judges grade.
