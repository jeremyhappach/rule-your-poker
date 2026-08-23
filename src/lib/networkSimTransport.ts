import {
  getChaosRealtimeDecision,
  getChaosRequestDecision,
  getChaosStatus,
  recordChaosTransportEvent,
  subscribeChaosStatus,
} from './networkSimChaos';
import { getNetworkSimRuntime } from './networkSimRuntime';

const CONTROL_PATHS = ['/rest/v1/network_sim_events', '/rest/v1/profiles'];

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | null {
  if (init?.signal) return init.signal;
  return typeof Request !== 'undefined' && input instanceof Request ? input.signal : null;
}

function waitFor(delayMs: number, signal: AbortSignal | null): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function bypassSimulation(url: string): boolean {
  return CONTROL_PATHS.some((path) => url.includes(path));
}

function offlineError(): TypeError {
  return new TypeError('Cross-Country Chaos simulated request failure before send');
}

export const simulatedSupabaseFetch: typeof fetch = async (input, init) => {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const url = requestUrl(input);
  if (getNetworkSimRuntime().mode !== 'cross_country_chaos' || bypassSimulation(url)) {
    return nativeFetch(input, init);
  }

  const method = (init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
  const kind = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'read' : 'write';
  const decision = getChaosRequestDecision(kind);
  if (decision.failBeforeSend) {
    recordChaosTransportEvent('http_failed_before_send', method, { kind, phase: decision.phaseKind, url: new URL(url).pathname });
    throw offlineError();
  }
  if (decision.delayMs > 0) {
    recordChaosTransportEvent('http_delayed', method, { kind, phase: decision.phaseKind, delayMs: decision.delayMs, url: new URL(url).pathname });
    await waitFor(decision.delayMs, requestSignal(input, init));
  }
  if (getChaosStatus().disconnected) {
    recordChaosTransportEvent('http_failed_before_send', method, { kind, phase: 'offline', url: new URL(url).pathname });
    throw offlineError();
  }

  // A request is delegated exactly once. Writes are never retried by the harness.
  return nativeFetch(input, init);
};

type SocketEventName = 'open' | 'message' | 'close' | 'error';
type SocketListener = EventListenerOrEventListenerObject;

export class NetworkSimWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;

  private socket: WebSocket | null = null;
  private readonly targetUrl: string;
  private readonly protocols?: string | string[];
  private readonly listeners = new Map<SocketEventName, Set<SocketListener>>();
  private readonly deliveryTimers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeStatus: (() => void) | null;
  private manuallyClosed = false;
  private lastDeliveryAt = 0;
  private deferredBinaryType: BinaryType = 'blob';

  constructor(url: string | URL, protocols?: string | string[]) {
    this.targetUrl = url.toString();
    this.protocols = protocols;
    this.unsubscribeStatus = subscribeChaosStatus(() => this.handleChaosStatus());
    if (getNetworkSimRuntime().mode === 'cross_country_chaos' && getChaosStatus().disconnected) {
      recordChaosTransportEvent('websocket_open_deferred', 'supabase_realtime', { phase: getChaosStatus().phaseKind });
    } else {
      this.openNativeSocket();
    }
  }

  get url(): string {
    return this.socket?.url ?? this.targetUrl;
  }

  get protocol(): string {
    return this.socket?.protocol ?? '';
  }

  get extensions(): string {
    return this.socket?.extensions ?? '';
  }

  get readyState(): number {
    return this.socket?.readyState ?? (this.manuallyClosed ? NetworkSimWebSocket.CLOSED : NetworkSimWebSocket.CONNECTING);
  }

  get bufferedAmount(): number {
    return this.socket?.bufferedAmount ?? 0;
  }

  get binaryType(): BinaryType {
    return this.socket?.binaryType ?? this.deferredBinaryType;
  }

  set binaryType(value: BinaryType) {
    this.deferredBinaryType = value;
    if (this.socket) this.socket.binaryType = value;
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new DOMException('WebSocket is not open', 'InvalidStateError');
    }
    this.socket.send(data);
  }

  close(code?: number, reason?: string): void {
    this.manuallyClosed = true;
    this.cleanupStatusSubscription();
    this.clearDeliveryTimers();
    this.socket?.close(code, reason);
  }

  addEventListener(type: SocketEventName, listener: SocketListener | null): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set<SocketListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: SocketEventName, listener: SocketListener | null): void {
    if (listener) this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    this.emit(event.type as SocketEventName, event);
    return !event.defaultPrevented;
  }

  private openNativeSocket(): void {
    if (this.manuallyClosed || this.socket) return;
    const socket = this.protocols === undefined
      ? new WebSocket(this.targetUrl)
      : new WebSocket(this.targetUrl, this.protocols);
    socket.binaryType = this.deferredBinaryType;
    this.socket = socket;
    socket.onopen = (event) => this.emit('open', event);
    socket.onerror = (event) => this.emit('error', event);
    socket.onmessage = (event) => this.handleMessage(event);
    socket.onclose = (event) => {
      this.clearDeliveryTimers();
      this.cleanupStatusSubscription();
      this.emit('close', event);
    };
  }

  private handleChaosStatus(): void {
    if (this.manuallyClosed) return;
    const chaosActive = getNetworkSimRuntime().mode === 'cross_country_chaos';
    if (!chaosActive || !getChaosStatus().disconnected) {
      this.openNativeSocket();
      return;
    }
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
      recordChaosTransportEvent('websocket_forced_close', 'supabase_realtime', { phase: getChaosStatus().phaseKind });
      this.socket.close(4001, 'cross-country-chaos-offline');
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (getNetworkSimRuntime().mode !== 'cross_country_chaos') {
      this.emit('message', event);
      return;
    }
    const decision = getChaosRealtimeDecision();
    if (decision.drop) {
      recordChaosTransportEvent('realtime_dropped', 'supabase_realtime', { phase: decision.phaseKind });
      return;
    }
    const now = Date.now();
    const deliveryAt = Math.max(now + decision.delayMs, this.lastDeliveryAt + 1);
    this.lastDeliveryAt = deliveryAt;
    const delayMs = Math.max(0, deliveryAt - now);
    if (delayMs === 0) {
      this.emit('message', event);
      return;
    }
    recordChaosTransportEvent('realtime_delayed', 'supabase_realtime', { phase: decision.phaseKind, delayMs });
    const timer = setTimeout(() => {
      this.deliveryTimers.delete(timer);
      this.emit('message', event);
    }, delayMs);
    this.deliveryTimers.add(timer);
  }

  private emit(type: SocketEventName, event: Event): void {
    const propertyHandler = type === 'open'
      ? this.onopen
      : type === 'message'
        ? this.onmessage
        : type === 'close'
          ? this.onclose
          : this.onerror;
    propertyHandler?.(event as never);
    this.listeners.get(type)?.forEach((listener) => {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    });
  }

  private clearDeliveryTimers(): void {
    this.deliveryTimers.forEach((timer) => clearTimeout(timer));
    this.deliveryTimers.clear();
  }

  private cleanupStatusSubscription(): void {
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
  }
}
