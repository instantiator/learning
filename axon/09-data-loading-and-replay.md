# 09 — Data loading and replay

Two different operations that get conflated constantly. **Loading** is putting data *in*.
**Replay** is re-delivering data that's already there. They fail differently and mean
different things.

## Terms you'll meet

| Term | Meaning |
|---|---|
| Event store | The append-only log of everything that happened |
| Stream | An ordered sequence of events, one per aggregate |
| Aggregate stream | The events for one entity, in order |
| Token | A position in a stream. Marked or uncommitted |
| Token store | Where a processor persists its position |
| Tracked stream | A stream that remembers tokens |
| Untracked stream | No tokens; always starts at the beginning |
| Replay | Reset a processor's token and re-deliver events |
| `ReplayToken` | Marks where a replay started, so progress is measurable |
| `resetTokens()` | The mechanism. A method on `StreamingEventProcessor` |
| `ReplayAware` / `isReplay()` | Lets a handler know it's being called for a replay |
| `EventStore` | The read/write interface, in both AF4 and AF5 |
| `ReplayStatus` | Where a streaming processor is, and where its replay began |

## The idea

There are three related things and it's worth keeping them straight.

**The event store** is the source of truth. Append-only, ordered, permanent.

**A stream** is a view of that store. A *tracked* stream carries a position — that's what
lets a processor resume. An *untracked* stream has no position, so every read starts at the
beginning. The classic example of an untracked stream is a **subscription query** for
entities that never change, like a list of countries: there's no last event, so there's no
"latest" position, and re-reading from the start each time is cheap and correct.

**A token** is that position. Either *marked* — you're done with it — or *uncommitted* — you've
handed it out but not finished with it. That distinction is what makes concurrent processors
safe.

## Replay

A **replay** resets a processor's position and re-delivers every event from the reset point
to the end of the stream. The processor runs the same handlers it always runs.

When you need one:

1. You added a handler to an existing projector.
2. You changed how a projector computes something.
3. You found a projector bug and don't want to reason about which events were mis-processed.
4. You changed an event's shape and stored data no longer converts.

The API is small. `resetTokens()` on the streaming processor — which truncates the tokens it
has issued — followed by a `ReplayToken` marking the reset point. From then on the processor
re-reads.

> **Version markers.** In Axon Framework 4 you had to stop the engine, call
> `ProcessingEventProcessor#resetTrackingTokens()`, then `start()`. In Axon Framework 5,
> `resetTokens()` is a method directly on `StreamingEventProcessor`
> (`org.axonframework.messaging.eventhandling.processing.streaming`), with several overloads
> including one taking a `ResetContext`.
>
> One name to be careful about: there is **no** `BoundaryStreamableEventSource` type. The
> AF5 stream types are `StreamableEventSource` and `MultiStreamableEventSource` in
> `org.axonframework.messaging.eventstreaming`. "Dynamic consistency boundary" is a *concept*
> in AF5, not a type. `ResetContext` is what actually expresses a partial replay.
>
> Similarly, `XEventStore` is not a real type in either version. Axon Framework 5 uses
> `org.axonframework.eventsourcing.eventstore.EventStore`, with `StorageEngineBackedEventStore`
> as the default implementation. Axon Framework 4 called it `EventStore` too — there was no
> rename.

## Preparing handlers for a replay

Re-running a handler is only safe if the handler can survive being re-run. Two mechanisms help.

**`@ResetHandler`** — invoked *before* the replay starts, with the event processor paused. A
projector uses it to truncate its table. Without it, a replay double-counts everything.

```java
@ResetHandler
void onReset(ReplayToken token) {
    if (token != null && token.isReplay()) {
        repository.truncate();
    }
}
```

**`@AllowReplay` / `@DisallowReplay`** — replay-awareness, per event type. By default handlers
receive all events. `@DisallowReplay` is for the rare handler that genuinely cannot be re-run
(an outbound integration, say) and needs to be told.

`ReplayAware` interfaces let a handler inspect `isReplay()` at runtime. A handler that behaves
differently during replay — suppressing an email, skipping an external call — implements it
directly.

**Partial replay and handler leniency.** This is the one people get wrong. A *partial* replay
resets to a point in the middle of history. Your handler will be invoked with an event whose
predecessors it never saw. The documentation is explicit that event handlers "may handle an
event in the middle of model construction" and must be made lenient or tolerant of missing
data.

An incrementing projector is fine with this. A projector that assumes a `CourseCreated` was
already processed is not.

## The operational sequence

In practice a rebuild looks like this:

```
1. Stop every instance of the projector.  All of them.
2. Clear the processor's token.
3. The @ResetHandler runs → truncate the read model table.
4. Start the processor → it re-reads the stream from the reset point.
5. Watch ReplayStatus: where is it now, and where did the replay start?
6. Latency spikes; capacity saturates; the read model is stale meanwhile.
7. When done, the processor is caught up and the read model is correct again.
```

Step 1 is the one people skip. A single instance still running with a live token will
interleave with the replay and you'll end up with a table that's neither the old one nor the
new one.

Step 5 is the one people forget: `ReplayStatus` gives you the token where the replay started.
The difference between that and the current token is your ETA.

> **A subtlety worth knowing:** in Axon Framework 5, a processor's *first* pass over a stream
> reports `REGULAR`, not `REPLAY`. A status of `REPLAY` genuinely means a replay was
> triggered. So a `@ResetHandler` that truncates on any non-null token is correct, but one
> that assumes a token always means "replay" will misbehave on first run.

## Loading data

**Loading** means getting events *into* the store. There are three ways, and they're not
interchangeable.

**Event sourcing** — you don't load events; you send commands and let the framework append
them. This is the normal path.

**Snapshotting** — periodically store an entity's current state so loading its stream is fast.
This is an optimization; it doesn't change semantics, and you can always fall back to replay.

**Event sourcing bootstrapping** — for existing data, you publish *initialization events* that
represent the current state. Each entity gets a `…Created` event carrying its state. This is
how you import a legacy database into an event-sourced model.

That last one is the "data loading" most Axon projects mean. The pattern:

```
Legacy database row  →  Initialisation event  →  Event store  →  projector  →  read model
```

The critical discipline: initialization events are *creation* events, and the read model
built from them must be identical to the one built by replaying real history. If it isn't,
you've built two sources of truth that disagree.

Axon provides `InitializingEvent` and the `@Aggregate` creator mechanism for this, and the
docs call the technique "event sourcing bootstrapping". Note that it's the *entity* that gets
initialized, not the projection — projectors stay rebuildable.

## Why replay is safe only sometimes

A replay re-runs handlers. Whether that's safe depends entirely on what the handler does.

| Handler type | Replay-safe? | Why |
|---|---|---|
| Projector (insert/increment table) | Yes, with `@ResetHandler` | Pure derived state; truncate and rebuild |
| Query handler | N/A | Not event-driven; nothing to replay |
| Subscribing side-effect handler | **No** | The effect already happened once; re-running repeats it |
| Streaming side-effect handler | **Dangerous** | Same, plus it *will* be re-delivered |
| Event-sourced entity | Yes | Re-applying events converges; snapshotting makes it fast |

That's the entire reason subscribing and streaming processors exist as different types, and
the reason a codebase that puts a projector and an email-sender behind the same annotation
is a design smell.

## The whole thing in one picture

```
 Event store ──► tracked stream ──► processor (token at position N) ──► read model
      ▲                                       │
      │                                       │ resetTokens()
      │                                       ▼
      └─────────────────────────────  ReplayToken marks the new start
```

Loading, by contrast, comes in the other direction: it *appends* to the store. Replay
re-*reads* from it. Nothing about replay modifies the event store.

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `EventProcessingEngine#stop` / `start` | — |
| `ProcessingEventProcessor#resetTrackingTokens()` | `StreamingEventProcessor#resetTokens()` |
| `TrackingToken` interface | `Token`, plus `ReplayToken` for a replay start |
| `EventStreamableEventSource` | `StreamableEventSource` / `MultiStreamableEventSource` |
| `EventStore` | `EventStore` (same name; default impl `StorageEngineBackedEventStore`) |
| no partial reset | `resetTokens(ResetContext)` expresses a partial reset |
| `InitializingEvent` | still present; used for bootstrapping |
| `@AllowReplay` / `@DisallowReplay` | still present |
| `ReplayAware` | still present |
| `ReplayTokenAware` processors | `ReplayStatus` exposes start/current |
| first pass reports `REPLAY` | first pass reports `REGULAR` |

## See also

- [`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md) — tokens,
  sequencing, and the dead-letter queue.
- [`07-projections-and-read-models.md`](07-projections-and-read-models.md) — why a projector
  needs a reset handler.
- [`12-testing-and-observability.md`](12-testing-and-observability.md) — watching a replay
  finish.
