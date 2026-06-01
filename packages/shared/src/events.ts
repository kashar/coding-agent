import { EventEmitter } from "node:events";
import type { RunStatus, StepStatus } from "./types.js";

/**
 * In-process event bus. Abstracted behind an interface so it can later be backed by
 * Redis pub/sub or another transport without changing producers/consumers.
 */
export type HelmsmanEvent =
  | { type: "run.created"; runId: string; workflowId: string; at: string }
  | { type: "run.status"; runId: string; status: RunStatus; at: string }
  | { type: "step.status"; runId: string; stepId: string; name: string; status: StepStatus; at: string }
  | { type: "step.log"; runId: string; stepId: string; message: string; at: string }
  | { type: "engine.event"; runId: string; stepId: string; engineId: string; payload: unknown; at: string }
  | { type: "run.completed"; runId: string; status: RunStatus; at: string };

export type EventHandler = (event: HelmsmanEvent) => void;

export interface EventBus {
  publish(event: HelmsmanEvent): void;
  subscribe(handler: EventHandler): () => void;
  /** Subscribe to events for a single run; returns an unsubscribe function. */
  subscribeRun(runId: string, handler: EventHandler): () => void;
}

export class InProcessEventBus implements EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Many concurrent run subscribers are expected.
    this.emitter.setMaxListeners(0);
  }

  publish(event: HelmsmanEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(handler: EventHandler): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  subscribeRun(runId: string, handler: EventHandler): () => void {
    const wrapped: EventHandler = (event) => {
      if ("runId" in event && event.runId === runId) handler(event);
    };
    this.emitter.on("event", wrapped);
    return () => this.emitter.off("event", wrapped);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
