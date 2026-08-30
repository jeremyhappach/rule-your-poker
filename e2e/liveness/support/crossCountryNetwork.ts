import type { BrowserContext, Route, WebSocketRoute } from '@playwright/test';

type NetworkProfile = {
  httpBaseMs: number;
  httpJitterMs: number;
  websocketBaseMs: number;
  websocketJitterMs: number;
};

const HEALTHY: NetworkProfile = {
  httpBaseMs: 0,
  httpJitterMs: 0,
  websocketBaseMs: 0,
  websocketJitterMs: 0,
};

const LONG_HAUL: NetworkProfile = {
  httpBaseMs: 180,
  httpJitterMs: 620,
  websocketBaseMs: 260,
  websocketJitterMs: 1_250,
};

function isSupabaseUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

function wait(milliseconds: number): Promise<void> {
  return milliseconds <= 0
    ? Promise.resolve()
    : new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * WebSocket/TCP preserves message order. Each frame receives its own latency
 * target, but a later low-jitter frame may never overtake an earlier
 * high-jitter frame. Waiting until each frame's original ready time avoids
 * turning the queue into cumulative per-frame latency.
 */
export class OrderedDeliveryQueue {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly onPendingChange: (delta: 1 | -1) => void = () => undefined,
  ) {}

  enqueue(delayMs: number, deliver: () => void): void {
    const readyAt = Date.now() + Math.max(0, delayMs);
    this.onPendingChange(1);
    this.tail = this.tail
      .catch(() => undefined)
      .then(async () => {
        await wait(Math.max(0, readyAt - Date.now()));
        try {
          deliver();
        } catch {
          // A test may intentionally close/remount a socket while a delayed
          // frame is queued. The replacement connection owns recovery.
        }
      })
      .finally(() => this.onPendingChange(-1));
  }

  async drain(): Promise<void> {
    await this.tail;
  }
}

/**
 * Browser-level impairment, intentionally outside application code. It delays
 * actual Supabase HTTP/WebSocket traffic and can discard one HTTP response
 * after the server has processed it, reproducing an ambiguous commit.
 */
export class CrossCountryNetwork {
  private profile: NetworkProfile = HEALTHY;
  private sequence = 0;
  private loseResponseFor: RegExp | null = null;
  private delayNextRequestFor: { pathPattern: RegExp; delayMs: number } | null = null;
  private pendingDeliveries = 0;
  private runtimeConfig: { url: string; publishableKey: string } | null = null;
  private readonly requestCounts = new Map<string, number>();

  async attach(context: BrowserContext): Promise<void> {
    await context.route('**/*', async (route) => this.handleHttp(route));
    await context.routeWebSocket(
      (url) => isSupabaseUrl(url.toString()),
      (socket) => this.handleWebSocket(socket),
    );
  }

  useHealthyProfile(): void {
    this.profile = HEALTHY;
  }

  useLongHaulProfile(): void {
    this.profile = LONG_HAUL;
  }

  loseNextResponse(pathPattern: RegExp): void {
    this.loseResponseFor = pathPattern;
  }

  delayNextRequest(pathPattern: RegExp, delayMs: number): void {
    this.delayNextRequestFor = { pathPattern, delayMs };
  }

  requestCount(pathname: string): number {
    return this.requestCounts.get(pathname) ?? 0;
  }

  async waitForDelayedDeliveries(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.pendingDeliveries > 0 && Date.now() < deadline) {
      await wait(25);
    }
    if (this.pendingDeliveries > 0) {
      throw new Error(`Cross-country transport still has ${this.pendingDeliveries} delayed frame(s)`);
    }
  }

  async waitForRuntimeConfig(timeoutMs = 10_000): Promise<{ url: string; publishableKey: string }> {
    const deadline = Date.now() + timeoutMs;
    while (!this.runtimeConfig && Date.now() < deadline) await wait(25);
    if (!this.runtimeConfig) throw new Error('No Supabase runtime request was observed');
    return this.runtimeConfig;
  }

  private deterministicJitter(maximum: number): number {
    if (maximum <= 0) return 0;
    this.sequence += 1;
    return (Math.imul(this.sequence, 1_103_515_245) >>> 16) % (maximum + 1);
  }

  private async handleHttp(route: Route): Promise<void> {
    const request = route.request();
    const url = request.url();
    if (!isSupabaseUrl(url)) {
      await route.continue();
      return;
    }
    const pathname = new URL(url).pathname;
    this.requestCounts.set(pathname, (this.requestCounts.get(pathname) ?? 0) + 1);

    const publishableKey = request.headers().apikey;
    if (!this.runtimeConfig && publishableKey) {
      this.runtimeConfig = {
        url: new URL(url).origin,
        publishableKey,
      };
    }

    const delayMs = this.profile.httpBaseMs + this.deterministicJitter(this.profile.httpJitterMs);
    await wait(delayMs);

    let wasDeliberatelyDelayed = false;
    if (this.delayNextRequestFor?.pathPattern.test(pathname)) {
      const delayedRequest = this.delayNextRequestFor;
      this.delayNextRequestFor = null;
      wasDeliberatelyDelayed = true;
      await wait(delayedRequest.delayMs);
    }

    if (this.loseResponseFor?.test(pathname)) {
      this.loseResponseFor = null;
      await route.fetch({ timeout: 30_000 });
      await route.abort('failed');
      return;
    }

    try {
      await route.continue();
    } catch (error) {
      // A deliberately delayed request may be aborted by the application
      // deadline before the harness releases it. The replay request owns the
      // next attempt; the abandoned route must not fail the test callback.
      if (!wasDeliberatelyDelayed) throw error;
    }
  }

  private handleWebSocket(client: WebSocketRoute): void {
    const server = client.connectToServer();
    const trackPending = (delta: 1 | -1) => {
      this.pendingDeliveries += delta;
    };
    const clientToServer = new OrderedDeliveryQueue(trackPending);
    const serverToClient = new OrderedDeliveryQueue(trackPending);

    client.onMessage((message) => {
      clientToServer.enqueue(this.websocketDelayMs(), () => server.send(message));
    });
    server.onMessage((message) => {
      serverToClient.enqueue(this.websocketDelayMs(), () => client.send(message));
    });
  }

  private websocketDelayMs(): number {
    return this.profile.websocketBaseMs
      + this.deterministicJitter(this.profile.websocketJitterMs);
  }
}

export async function runOfflineBurst(context: BrowserContext, durationMs = 2_000): Promise<void> {
  await context.setOffline(true);
  await wait(durationMs);
  await context.setOffline(false);
}
