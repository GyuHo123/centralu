import { randomUUID } from 'node:crypto'
import type { NormalizedEvent } from '@cc/protocol'

/**
 * seq assignment + ring buffer (docs/protocol.md §1).
 * The core device that keeps "reconnecting from losing state" — the host keeps logging events
 * even while the UI is closed.
 */
export type LoggedEvent = { seq: number; event: NormalizedEvent }

/**
 * How much the buffer may hold, measured in serialised characters, whatever the event count.
 *
 * The count cap alone did not bound memory: a `message_image` event carries its whole base64 image
 * (up to ~11 MB), so 2000 of a screenshot-heavy session's events could pin hundreds of MB for as long
 * as the host stayed quiet afterwards (#392). Past this, the oldest events go first; a client whose
 * cursor falls out is told to resync, exactly as when the count cap pushes it out.
 */
export const EVENT_LOG_MAX_CHARS = 64 * 1024 * 1024

export class EventLog {
  private buf: LoggedEvent[] = []
  /** Serialised size of each entry in `buf`, index for index */
  private sizes: number[] = []
  private chars = 0
  private seq = 0
  /**
   * Which host lifetime issued these numbers (#82).
   *
   * A seq means something only inside the process that assigned it: a host that comes back up
   * (web and dev mode reuse the address and token; the desktop restarts it after a crash or an
   * update) numbers from 1 again. #173 caught the case where the new host is still *behind* the
   * client's cursor. It could not catch the other case: the new host had already numbered past
   * that cursor before the client came back, so `since(cursor)` handed out the tail of a
   * different lifetime as if it were what the client missed, and everything before it was lost
   * without a resync. Measured on main: a client holding A1..A3 reconnected to a host that had
   * broadcast B1..B5 and received `A1, A2, A3, B4, B5`. A per-lifetime id makes the two
   * lifetimes distinguishable whatever their numbers are.
   */
  readonly streamEpoch: string = randomUUID()

  constructor(
    private capacity = 2000,
    private maxChars = EVENT_LOG_MAX_CHARS,
  ) {}

  get currentSeq(): number {
    return this.seq
  }

  /** The oldest seq still in the buffer (0 if none) */
  get oldestSeq(): number {
    return this.buf[0]?.seq ?? 0
  }

  /** `chars` is the event's serialised size; the caller already has it (`broadcast` stringifies once) */
  append(event: NormalizedEvent, chars = JSON.stringify(event).length): LoggedEvent {
    const entry = { seq: ++this.seq, event }
    this.buf.push(entry)
    this.sizes.push(chars)
    this.chars += chars
    // The newest event always stays, however large: dropping it would leave nothing to replay at all
    let drop = 0
    while (drop < this.buf.length - 1 && (this.buf.length - drop > this.capacity || this.chars > this.maxChars)) {
      this.chars -= this.sizes[drop++]!
    }
    if (drop > 0) {
      this.buf.splice(0, drop)
      this.sizes.splice(0, drop)
    }
    return entry
  }

  /**
   * Returns events after afterSeq.
   * If resyncRequired=true, the request point is outside the buffer and cannot be resent, so the
   * UI has to reload a snapshot.
   *
   * `streamEpoch` is the lifetime the cursor came from. A cursor (afterSeq > 0) is honoured only
   * with this lifetime's epoch; a cursor with a different epoch, or with none at all, gets a
   * resync and never events (#82). Without an epoch there is no way to tell this lifetime's 7
   * from another lifetime's 7. A hello with neither (afterSeq absent or 0, no epoch) is a first
   * contact and keeps its old meaning: the whole buffer.
   */
  since(afterSeq: number, streamEpoch?: string): { events: LoggedEvent[]; resyncRequired: boolean } {
    if (streamEpoch !== undefined && streamEpoch !== this.streamEpoch) return { events: [], resyncRequired: true }
    if (afterSeq > 0 && streamEpoch === undefined) return { events: [], resyncRequired: true }
    /*
     * Received a number this instance never assigned (#173) — this host came back up and is
     * numbering from scratch (the web and dev modes come back up at the same address and token).
     * Returning only an empty list would make the client think it had received everything, and
     * nothing would get replayed until the new host's numbering passed the old value. There is no
     * way to know what was missed, so a snapshot reload is required instead.
     */
    if (afterSeq > this.seq) return { events: [], resyncRequired: true }
    if (afterSeq === this.seq) return { events: [], resyncRequired: false }
    if (this.buf.length === 0) return { events: [], resyncRequired: afterSeq < this.seq }
    // If the request point has been pushed out of the buffer, a resync is required
    if (afterSeq > 0 && afterSeq < this.oldestSeq - 1) return { events: [], resyncRequired: true }
    if (afterSeq === 0 && this.oldestSeq > 1) return { events: [], resyncRequired: true }
    return { events: this.buf.filter((e) => e.seq > afterSeq), resyncRequired: false }
  }
}
