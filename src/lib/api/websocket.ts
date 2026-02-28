import type { WsServerMessage, RawSessionEntry } from '$shared/types.js';

type UpdateCallback = (entries: RawSessionEntry[]) => void;

export class LiveSessionClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 30000;
  private subscribers = new Map<string, UpdateCallback[]>();
  private url: string;
  private destroyed = false;

  constructor(url = `ws://${window.location.host}/ws`) {
    this.url = url;
  }

  connect(): void {
    if (this.destroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectDelay = 1000;
      // Re-subscribe to all active sessions
      for (const sessionId of this.subscribers.keys()) {
        this.send({ type: 'subscribe', sessionId });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;
        if (msg.type === 'session-update') {
          const cbs = this.subscribers.get(msg.sessionId) ?? [];
          for (const cb of cbs) cb(msg.entries);
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in', this.reconnectDelay, 'ms');
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
          this.connect();
        }, this.reconnectDelay);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      this.ws?.close();
    };
  }

  subscribe(sessionId: string, callback: UpdateCallback): () => void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, []);
    }
    this.subscribers.get(sessionId)!.push(callback);
    this.send({ type: 'subscribe', sessionId });

    return () => {
      const cbs = this.subscribers.get(sessionId) ?? [];
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
      if (cbs.length === 0) this.subscribers.delete(sessionId);
    };
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.subscribers.clear();
  }
}

// Singleton instance
let _client: LiveSessionClient | null = null;

export function getWsClient(): LiveSessionClient {
  if (!_client) {
    _client = new LiveSessionClient();
    _client.connect();
  }
  return _client;
}
