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
 * Browser-level impairment, intentionally outside application code. It delays
 * actual Supabase HTTP/WebSocket traffic and can discard one HTTP response
 * after the server has processed it, reproducing an ambiguous commit.
 */
export class CrossCountryNetwork {
  private profile: NetworkProfile = HEALTHY;
  private sequence = 0;
  private loseResponseFor: RegExp | null = null;
  private pendingDeliveries = 0;
  private runtimeConfig: { url: string; publishableKey: string } | null = null;

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

    const publishableKey = request.headers().apikey;
    if (!this.runtimeConfig && publishableKey) {
      this.runtimeConfig = {
        url: new URL(url).origin,
        publishableKey,
      };
    }

    const delayMs = this.profile.httpBaseMs + this.deterministicJitter(this.profile.httpJitterMs);
    await wait(delayMs);

    if (this.loseResponseFor?.test(new URL(url).pathname)) {
      this.loseResponseFor = null;
      await route.fetch({ timeout: 30_000 });
      await route.abort('failed');
      return;
    }

    await route.continue();
  }

  private handleWebSocket(client: WebSocketRoute): void {
    const server = client.connectToServer();

    client.onMessage((message) => {
      this.delayDelivery(() => server.send(message));
    });
    server.onMessage((message) => {
      this.delayDelivery(() => client.send(message));
    });
  }

  private delayDelivery(deliver: () => void): void {
    const delayMs = this.profile.websocketBaseMs
      + this.deterministicJitter(this.profile.websocketJitterMs);
    if (delayMs <= 0) {
      deliver();
      return;
    }

    this.pendingDeliveries += 1;
    setTimeout(() => {
      try {
        deliver();
      } catch {
        // The test may intentionally close/remount a socket while a delayed
        // frame is queued. The browser recovery path, not a stale test timer,
        // owns the replacement connection.
      } finally {
        this.pendingDeliveries -= 1;
      }
    }, delayMs);
  }
}

export async function runOfflineBurst(context: BrowserContext, durationMs = 2_000): Promise<void> {
  await context.setOffline(true);
  await wait(durationMs);
  await context.setOffline(false);
}
