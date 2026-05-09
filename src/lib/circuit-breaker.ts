/**
 * Circuit Breaker — three-state FSM protecting downstream consumers.
 *
 * CLOSED   → normal operation; failures are counted
 * OPEN     → fast-fail; handler is not called, throws immediately
 *            (prevents cascading failures and saves consumer capacity)
 * HALF_OPEN → trial period; one call is allowed through
 *            success → CLOSED, failure → OPEN
 *
 * In production this would wrap HTTP calls to external services
 * (payment gateway, inventory API) so a slow upstream doesn't drain
 * thread pools or saturate Kafka consumer groups.
 */

export type CBState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CBStats {
  name:             string;
  state:            CBState;
  failureCount:     number;
  successCount:     number;
  totalCalls:       number;
  lastFailureAt:    number | null;  // Unix ms
  nextRetryAt:      number | null;  // when HALF_OPEN window opens
  failureThreshold: number;
  timeoutMs:        number;
}

export interface CBOptions {
  failureThreshold?: number;  // consecutive failures before OPEN  (default 3)
  successThreshold?: number;  // successes in HALF_OPEN to CLOSE   (default 2)
  timeoutMs?:        number;  // ms in OPEN before HALF_OPEN       (default 8000)
}

class CircuitBreaker {
  private state:       CBState = "CLOSED";
  private failures     = 0;
  private successes    = 0;
  private total        = 0;
  private lastFailAt:  number | null = null;

  readonly name:             string;
  readonly failureThreshold: number;
  readonly successThreshold: number;
  readonly timeoutMs:        number;

  constructor(name: string, opts: CBOptions = {}) {
    this.name             = name;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.successThreshold = opts.successThreshold ?? 2;
    this.timeoutMs        = opts.timeoutMs        ?? 8_000;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    this.total++;

    // Check if OPEN breaker should transition to HALF_OPEN
    if (this.state === "OPEN") {
      const elapsed = Date.now() - (this.lastFailAt ?? 0);
      if (elapsed >= this.timeoutMs) {
        this.state    = "HALF_OPEN";
        this.successes = 0;
      } else {
        throw new Error(
          `CircuitBreaker OPEN: ${this.name} — retry in ${Math.ceil((this.timeoutMs - elapsed) / 1000)}s`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state   = "CLOSED";
        this.failures = 0;
      }
    } else {
      this.failures = 0; // reset on any success in CLOSED
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailAt = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }

  getStats(): CBStats {
    return {
      name:             this.name,
      state:            this.state,
      failureCount:     this.failures,
      successCount:     this.successes,
      totalCalls:       this.total,
      lastFailureAt:    this.lastFailAt,
      nextRetryAt:      this.state === "OPEN" && this.lastFailAt
                          ? this.lastFailAt + this.timeoutMs
                          : null,
      failureThreshold: this.failureThreshold,
      timeoutMs:        this.timeoutMs,
    };
  }

  reset() {
    this.state     = "CLOSED";
    this.failures  = 0;
    this.successes = 0;
    this.lastFailAt = null;
  }
}

// ─── Global registry ──────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __circuitBreakers: Map<string, CircuitBreaker> | undefined;
}

const registry: Map<string, CircuitBreaker> =
  (global.__circuitBreakers ??= new Map());

const DEFAULTS: Record<string, CBOptions> = {
  "payment-service":      { failureThreshold: 3, timeoutMs: 8_000 },
  "inventory-service":    { failureThreshold: 3, timeoutMs: 8_000 },
  "notification-service": { failureThreshold: 5, timeoutMs: 15_000 },
};

export function getBreaker(name: string): CircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker(name, DEFAULTS[name] ?? {}));
  }
  return registry.get(name)!;
}

export function getAllBreakerStats(): CBStats[] {
  return Array.from(registry.values()).map((b) => b.getStats());
}

export function resetBreaker(name: string): boolean {
  const b = registry.get(name);
  if (!b) return false;
  b.reset();
  return true;
}

export function resetAllBreakers() {
  registry.forEach((b) => b.reset());
}
