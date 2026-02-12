export interface TraceStep {
  step: string;
  duration_ms: number;
  detail?: string;
}

export class RequestTrace {
  private steps: TraceStep[] = [];
  private pending = new Map<string, number>();

  step(label: string) {
    this.pending.set(label, performance.now());
  }

  end(label: string, detail?: string) {
    const start = this.pending.get(label);
    if (start === undefined) return;
    this.pending.delete(label);
    this.steps.push({
      step: label,
      duration_ms: Math.round(performance.now() - start),
      ...(detail ? { detail } : {}),
    });
  }

  add(label: string, duration_ms: number, detail?: string) {
    this.steps.push({
      step: label,
      duration_ms,
      ...(detail ? { detail } : {}),
    });
  }

  toJSON(): TraceStep[] {
    return this.steps;
  }

  serialize(): string {
    return JSON.stringify(this.steps);
  }
}
