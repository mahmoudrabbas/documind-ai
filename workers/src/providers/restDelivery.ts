import type {
  NotificationTransportPort,
  TransportDeliveryInput,
  TransportDeliveryResult,
} from "../contracts/notificationTransport.js";

/**
 * Phase 1 REST delivery adapter (T12).
 *
 * In Phase 1 delivery is a NO-OP: the notification document is already
 * persisted by the dispatch worker before the transport is invoked, and the
 * user retrieves it by polling `GET /notifications`. The adapter always
 * reports success so the worker proceeds to the delivered/VISIBLE state.
 *
 * Socket.IO push is NOT emitted here — that is SocketIoDelivery (T16, Phase 2).
 *
 * Adapters never throw for transient reasons; they report failure through the
 * `{ok, errorCategory}` result taxonomy so the worker classifies it via
 * RetryableJobError / PermanentJobError.
 */
export class RestDelivery implements NotificationTransportPort {
  async deliver(_input: TransportDeliveryInput): Promise<TransportDeliveryResult> {
    return { ok: true };
  }
}
