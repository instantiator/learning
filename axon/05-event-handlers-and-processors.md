# 05 — Event handlers and processors

Who consumes events, how they keep track of where they are, and what happens when one of
them fails. This is the most operationally-loaded part of Axon, and where a lot of
production surprises live.

## Terms you'll meet

| Term | Meaning |
|---|---|
| Event handler | A component that reacts to events. `@EventHandler` |
| Event processor | The runtime that moves events from a source to handlers |
| Subscribing processor | Called live, as events are published. No token, no replay |
| Streaming processor | Reads from a stream, tracking a **token**. Replayable |
| `Token` / `TrackingToken` | The processor's position in the event stream. `TrackingToken` is the AF4 name |
| `TokenStore` | Where a streaming processor persists its tokens |
| Segment | A slice of the event stream, processed independently |
| `SequencingPolicy` | Decides which events must be handled in order, and which may run in parallel |
| `@ResetHandler` | Runs before a replay, to prepare state |
| `@ReplayContext` | Injects the context object you passed when starting a replay |
| `ReplayStatus` | Tells a handler whether it's being called for a live event or a replay |
| `@AllowReplay` / `@DisallowReplay` | Opt an event in or out of replay |
| Dead-letter queue | Where events that can't be handled are parked, for later replay. **Axoniq Framework — commercial** |
| Error handler | Per-processor policy for what happens when a handler throws. `PropagatingErrorHandler` is the AF4-era name |
| Processing group | Axon Framework 4's word for a group of handlers sharing a processor |

## The idea

An **event handler** is a method annotated `@EventHandler`. Its only job is to react to an
event. It can do anything, because nothing calls it and waits.

An **event processor** is the machinery that actually delivers events to handlers. The
important question is: *where does it read from, and does it remember where it got to?*

There are two answers, and they are not variations on a theme. They have different
capabilities, different operational costs, and different failure modes.

## Subscribing processors

[VISUAL: an arrow from the command side directly into the handler]

A subscribing processor is **called live**, at the moment an event is published, in the same
process that published it.

- No token. No position. No persisted state.
- Events published while the processor isn't running are **lost**.
- Cannot be replayed. There is no "where did I get to" to reset.
- No parallelism, because it runs on the publishing thread.

Use it for: notifications, external integrations, anything with a **side effect**. The rule
of thumb the docs push you towards is: if the handler does something to the outside world,
it should be subscribing. If it only changes data your system owns, it should be streaming.

Why? Because a side effect must happen **once**. A streaming handler will see that event
again on every replay. A subscribing handler saw it once and it either worked or it didn't.

## Streaming processors

[VISUAL: a token-shaped cursor sitting on a stream, moving forward]

A streaming processor reads from an event stream and **tracks its position** with a
`TrackingToken`, persisted in a **`TokenStore`**.

- Can read historical events.
- Can be reset, and therefore **replayed**.
- Can process in parallel across **segments**.
- Can lag behind without losing anything.

Use it for: projections, read models, and anything you'd need to rebuild.

### Tokens

A `TrackingToken` is a position in the event stream. In Axon Server it's a global sequence
number; in a relational-database event store it's typically a timestamp plus a sequence
number, which is why the "token at this instant" API is also available.

The `TokenStore` is where tokens live, keyed by processor name. In Axon Framework 5 it's
`org.axonframework.messaging.eventhandling.processing.streaming.token.store.TokenStore`,
with `JpaTokenStore` for a relational database. In Axon Framework 4 it was the same
interface name in a different package, and you configured which event store read the
tokens.

> The `TokenStore` is the single most important piece of operational state after the event
> store itself. If tokens are lost, processors restart from the beginning and every
> projection is rebuilt. If tokens are stuck, a projection silently stops advancing.

### Segments

A **segment** is a slice of the event stream that one thread owns. A streaming processor
with N segments processes N slices in parallel, subject to its sequencing policy.

You can change segment count at runtime — `splitSegment(int)` and `mergeSegment(int)` on
the processor, or through Axon Server's dashboard, or (easiest) through Axoniq Platform,
which can also scale segments automatically to match your replica count.

The docs give a useful heuristic for when you use the API directly rather than the tooling:
to split a segment, pick the **largest**; to merge, pick the **smallest**.

Two constraints: the processor must hold the claim on the segment it operates on, or the
operation simply fails. And for a merge, the processor must hold *both* segments — the one
you name, and the one it will be merged with, which you can find out from
`Segment#mergeableSegmentId`.

## Sequencing policies

[VISUAL: two lanes. One event chain strictly serial. Another branch fanning out in parallel.]

A **`SequencingPolicy`** decides which events must be handled in order relative to each
other. Events with the same sequence identifier are processed one after another. Events
with different identifiers run in parallel.

This matters enormously for correctness, and getting it wrong produces the classic Axon bug:
two projectors writing to the same row in a different order than the events occurred.

| Policy | Behaviour | When |
|---|---|---|
| `PropertySequencingPolicy` | sequence by a property on the event (typically the entity's tag) | the default choice for projections |
| `SequentialSequencingPolicy` | everything strictly in order | simple, low-volume, or genuinely global ordering |
| Your own | implement `SequencingPolicy` | anything unusual |

The default for a projector should almost always be "sequence by entity id". That gives you
per-entity ordering — which is what correctness requires — with parallelism *across*
entities. Globally sequential processing is the safe default that's usually left in place
from a template, and it's the most common reason a system is slower than it needs to be.

Configure it in Spring Boot properties:

```properties
axon.eventhandling.processors.course-statistics.mode=pooled-streaming
axon.eventhandling.processors.course-statistics.sequencing-policy=propertySequencingPolicy
axon.eventhandling.processors.course-statistics.thread-count=8
```

> **Documentation defect worth knowing:** one Axon Framework 5 page shows
> `mode=tracking`, which is not a valid 5.x value — it's leftover from the Axon Framework 4
> `TrackingEventProcessor`. Everywhere else on the same page uses `pooled-streaming`. If you
> copy that line you configure a processor type that no longer exists.

> Note the property name: `eventhandling`, not `event-handling`. Easy to typo.

> **A real default change in Axon Framework 5:** the default sequencing policy moved from
> `SequentialPerAggregatePolicy` (AF4) to **`HierarchicalSequencingPolicy`**. The
> `SequencingPolicy` interface itself changed too — from
> `getSequenceIdentifierFor(T)` to `Optional<Object> sequenceIdentifierFor(Message,
> ProcessingContext)` — and is now shared with command handling rather than being
> event-handling-only. So "what happens if I configure nothing" has a different answer than it
> did in 4.x.

## Replay awareness

Handlers get invoked for events they may have already seen. Two mechanisms help.

**`@DisallowReplay`** marks an event type that must never be handled during a replay —
because the handler has a side effect that already happened. `@AllowReplay` is the
explicit opt-in for the ambiguous middle.

**`@ResetHandler`** lets a component prepare itself *before* a replay starts. A projector
that rebuilds a table from scratch wants to truncate that table here, not on the first
event.

**`@ReplayContext`** injects a context object you supplied when triggering the reset, so
the handler knows *why* it's replaying — "rebuilding after deploy ABC-123" versus "backfilling
historical data".

And `ReplayStatus` (injectable as a plain parameter) tells the handler, at runtime, whether
it's being called for a live event or a replay. This is the most flexible option and often
the most useful:

```java
@EventHandler
void on(CardIssued event, ReplayStatus status) {
    if (status == ReplayStatus.REPLAY && !rebuildMode) {
        return;   // we already sent this notification
    }
    notificationService.send(event);
}
```

The docs also name a `ReplayBlockingEventHandlingComponent` interface, for components that
need to hold up the replay while they do setup work.

Full detail on the mechanics is in
[`09-data-loading-and-replay.md`](09-data-loading-and-replay.md).

## When a handler fails

[VISUAL: an event striking a wall labelled "handler threw"]

Here's the structural problem, and it's the thing to keep in mind about the whole read
side: **an event handler has nobody to report failure to.** The publisher has long since
moved on. So a failure has to be handled *somewhere*, and Axon gives you a few options.

**Commands and queries** are easy — the exception propagates to the caller. **Events** are
not. A throwing event handler fails the stream.

Two mechanisms manage that:

### The dead-letter queue

Events that can't be handled are parked in a **dead-letter queue** rather than blocking
everything behind them. You inspect the queue, fix the problem, and replay the failed
events.

This is the escape hatch that keeps one bad event from stalling an entire projection. If a
codebase has a dead-letter queue configured, expect to meet it in an operations runbook.

> **Licensing and package warnings.** **Axon Framework 5 open-source core has no dead-letter
> queue.** It's an Axoniq Framework feature, so it needs a licence — consistent with the
> `io.axoniq.framework` namespace it lives in:
> `io.axoniq.framework.messaging.deadletter` (`DeadLetter`, `SequencedDeadLetterProcessor`,
> `EnqueuePolicy`) and
> `io.axoniq.framework.messaging.eventhandling.deadletter` (with a `.jpa` sub-package for
> `JpaSequencedDeadLetterQueue`). The two roots aren't parallel, so IDE auto-import will get
> this wrong. If a codebase has a DLQ and no Axoniq Framework licence, that is worth
> understanding before the first incident.

### `PropagatingErrorHandler`

Error handling is a **per-processor** decision, and getting it wrong is how you get a
projection that silently skips events.

> **A naming caveat.** `PropagatingErrorHandler` is the Axon Framework 4-era name and does not
> appear in the current Axon Framework 5 reference. What *is* documented in 5.x is the
> per-processor error-handling configuration itself. If a codebase imports
> `PropagatingErrorHandler`, treat it as a 4.x-era name and expect the modern equivalent to
> look different.

The general guidance: propagate for projections where silently dropping an event corrupts
the model; be more forgiving for notification-style side effects.

### `@ExceptionHandler`

Narrowest option. An `@ExceptionHandler` method on the handling component reacts to
exceptions from handler methods *in that same class*, narrowed by `resultType` and
optionally `messageType`.

## Observing processors

A streaming processor exposes `processingStatus()`, keyed by segment. Each status gives you:

| Accessor | Meaning |
|---|---|
| `isCaughtUp()` | Is it up to date with the stream? |
| `isReplaying()` | Is this segment replaying? |
| `isMerging()` | Is this segment being merged into another? |
| `TrackingToken` | The segment's current token |
| `isErrorState()` | Did it fail? |
| `getCurrentPosition()` | Where it is now |
| `getResetPosition()` | Where the replay started. Comparing the two gives you an estimate of replay time |

Caveat from the docs: only segments currently being processed, or that errored previously,
appear in this map. For a complete picture you have to ask each instance of your
application.

### Metrics worth watching

Axon's metric modules expose a `MessageMonitor` per processor with three numbers:

- **Latency** — time between an event being published and being handled. High latency means
  the processor is behind.
- **Capacity** — how busy it is. The docs suggest 0.8 on a single thread is a warning sign:
  either a performance problem, or the segment should be split.
- **Counter** — events per minute. A drop outside your normal range warrants investigation.

## In the code

A complete, realistic projector in Axon Framework 5:

```java
@EventHandler
void on(CourseCreated event) {
    statistics.insert(new CourseStatisticsRow(event.courseId(), 0, event.capacity()));
}

@EventHandler
void on(StudentEnrolled event) {
    statistics.incrementEnrolled(event.courseId());
}

@ResetHandler
void prepareForReplay(ResetContext<Object> context) {
    statistics.truncate();      // don't double-count
}
```

Registered so that events are sequenced by course and eight threads can work in parallel:

```java
@Bean
EventProcessorDefinition<String> courseStatisticsProcessor(
        EventHandlingComponentsConfigurer configurer) {

    return EventProcessorModule.pooledStreaming("course-statistics", configurer -> configurer
        .sequencingPolicy(PropertySequencingPolicy.builder()
                              .propertyName("courseId")
                              .build())
        .threadCount(8)
        .eventHandlingComponents(c -> c.declarative("courseStatistics",
                cfg -> new CourseStatisticsProjector(statistics))));
}
```

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `TrackingEventProcessor` | `StreamingEventProcessor` |
| `SubscribingEventProcessor` | unchanged, but configured differently |
| `ProcessEventStore` | gone. A streaming processor reads a `StreamableEventSource` directly |
| `EventProcessingConfigurer` | `EventHandlingComponentsConfigurer` / per-processor configurers |
| `@ProcessingGroup` | `@Namespace` |
| `TokenStore` (`org.axonframework.eventsourcing.eventstore.token`) | `TokenStore` (`...processing.streaming.token.store`) |
| `ReplayToken`, `ResettableMessageSource` | `resetTokens(...)` on the processor; `ReplayStatus` and `@ReplayContext` in handlers |
| gap-aware and non-gap-aware streaming processors | segment-based; gap detection is internal |
| `EventBus` | `EventSink` |
| `mode=tracking` | `mode=pooled-streaming` (or `subscribing`) |
| `AxonConfiguration.eventTracking(…)` | `MessagingConfigurer#eventProcessing(…)` with per-processor configurers |
| `SequentialPerAggregatePolicy` (default) | `HierarchicalSequencingPolicy` (default) |
| `SequencingPolicy#getSequenceIdentifierFor(T)` | `SequencingPolicy#sequenceIdentifierFor(Message, ProcessingContext)`, now shared with command handling |
| `TrackingToken` | `Token`, plus `ReplayToken` for a replay start |
| `MessageMonitor` | same name, same metrics |

## See also

- [`07-projections-and-read-models.md`](07-projections-and-read-models.md) — what you're
  building with all this.
- [`09-data-loading-and-replay.md`](09-data-loading-and-replay.md) — the reset mechanics.
- [`12-testing-and-observability.md`](12-testing-and-observability.md) — testing event
  handlers, and the metrics in more detail.
