import { randomUUID } from "node:crypto";

/** Branded id helpers so different id kinds are not accidentally interchangeable. */
export type RunId = string & { readonly __brand: "RunId" };
export type StepId = string & { readonly __brand: "StepId" };
export type LessonId = string & { readonly __brand: "LessonId" };

export function newRunId(): RunId {
  return `run_${randomUUID()}` as RunId;
}

export function newStepId(): StepId {
  return `step_${randomUUID()}` as StepId;
}

export function newLessonId(): LessonId {
  return `lesson_${randomUUID()}` as LessonId;
}
