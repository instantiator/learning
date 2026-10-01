# 04 — Events

An **event** is a message stating a fact about something that has already happened. It's the
only thing Axon persists, and its rules are different from every other message type.

## Terms you'll meet

| Term | Meaning |
|---|---|
| Event | An immutable statement of fact about the past |
| `@Event` | Declares an event's name, namespace, version |
| `@EventTag` | Marks the identifier field so the event can be found in a stream |
| Event store | The append-only store where events live. The source of truth |
| Stream | An ordered sequence of events. One per entity, identified by tag |
| `EventSourcedRepository` / `EventStore` | The interfaces you'll meet in stack traces |
| `EventAppender` | The context-aware way to append events |
| `EventSink` / `EventBus` | The component that publishes events to handlers |
| Domain event vs application event | A fact about the domain vs a fact about the application |
| `Converter` | Turns payloads into stored bytes and back. AF4: `Serializer` |
| Event transformation | Rewrites a stored event's shape on read. AF4: `EventUpcaster` |
| Aggregate sequence number | A `Long` giving the event's position within one stream |

## The idea

Events are facts, and facts have three properties that shape everything:

1. **Past tense.** `StudentEnrolled`, not `EnrollStudent`. A fact is not a request.
2. **No result.** Nobody is waiting for an answer. See
   [`01-messaging-core.md`](01-messaging-core.md) for why this matters so much.
3. **Immutability.** A stored event is never edited. Ever.

The consequence of the third point, combined with the first, is that your event classes
are part of your *data format*, not just your code. Changing `CourseCreated` to add a field
looks like a refactor and is actually a schema migration. This section exists because that
surprise catches everyone once.

### Domain events vs application events

A distinction you'll meet in almost every real codebase:

| | Domain event | Application event |
|---|---|---|
| Meaning | Something happened **in the domain** | Something happened **in the application** |
| Example | `OrderPlaced`, `PaymentReceived` | `OrderExportRequested`, `UserEmailChangedNotificationSent` |
| Who cares | The domain model | Integration and infrastructure |
| Should drive business rules | Yes | No |

The practical test: if a business rule could reject it, it's a domain event. If it's just
"the system did a thing", it's an application event. Application events are cheaper to
change, because nothing is supposed to be making decisions from them.

## The event store

The event store is append-only and organised into **streams**. One stream per entity,
identified by the entity's **tag**.

```
Stream: Tag("courseId", "c-1")
  seq 0   CourseCreated        (courseId=c-1, title="DDD", capacity=50)
  seq 1   StudentEnrolled      (courseId=c-1, studentId=s-9)
  seq 2   StudentEnrolled      (courseId=c-1, studentId=s-2)
  …
  seq 47  StudentEnrolled      (courseId=c-1, studentId=s-14)
```

Two mechanisms select events:

- **Tags** — a key/value pair on the event. `@EventTag` marks the field; `tagKey` on
  `@EventSourcedEntity` names the key. See
  [`03-entities-and-aggregates.md`](03-entities-and-aggregates.md).
- **`EventCriteria`** — a query object. `EventCriteria.havingTags(Tag.of("courseId", id))`
  is the tag-based filter; there's an `EventCriteriaBuilder` annotation for building them
  as constants.

Streams are also how Axon Server partitions and distributes events — see
[`11-axon-server.md`](11-axon-server.md).

Types you'll meet in stack traces: `EventStore`, `EventStorageEngine`,
`InMemoryEventStorageEngine`, `AggregateBasedJpaEventStorageEngine`,
`AggregateBasedAxonServerEventStorageEngine`, `DomainEventStream`, `TrackedEventStream`,
`EventConverter`, `TagResolver`.

## Appending events

Almost all the code you'll read appends rather than publishes:

```java
@CommandHandler
public static String handle(CreateCourse cmd, EventAppender appender) {
    appender.append(new CourseCreated(cmd.courseId(), cmd.title(), cmd.capacity()));
    return cmd.courseId();
}
```

`append` accepts a single event, a varargs sequence, or a `List<?>`.

Three rules from the docs, all of which exist for good reasons:

- **`EventAppender` must be injected as a handler parameter.** It is bound to the current
  `ProcessingContext`, which is how "append an event" becomes "append an event inside this
  transaction", and how correlation metadata gets attached.
- **Never store or reuse an `EventAppender`** across command invocations. It's bound to a
  transaction that will have closed.
- Events appended inside a context are stored **together, or not at all**.

`EventAppender.forContext(context)` is the explicit equivalent, used in the declarative
configuration style.

### Publishing

For the rarer case where you genuinely need to put an event on the wire — publishing to an
external system, or an event that isn't the result of a command — you use the **sink**:
`EventSink` in Axon Framework 5, `EventBus` in Axon Framework 4. (`EventBus` isn't gone in
Axon 5; it just *extends* `EventSink` now. Both are lower-level components, and the
documentation actually recommends `EventAppender` or `EventGateway` in day-to-day code.)

The distinction that trips people: **appending to the event store is not publishing to the
event bus.** Appending puts an event in the stream, and processors pick it up from there.
Publishing bypasses the store. In a well-formed Axon application you append and let the
processors see it. If you find yourself publishing from inside a command handler, that's a
sign you wanted to append.

## Declaring an event

```java
import org.axonframework.messaging.eventhandling.annotation.Event;

@Event(namespace = "faculty", name = "CourseCreated", version = "1.0.0")
public record CourseCreated(@EventTag String courseId, String title, int capacity) {}
```

Without `@Event`, the name defaults to the fully qualified class name — which again ties
your stored data to your Java package structure. If you ever intend to move a class, this
is the annotation that saves you.

`@Event(version = "…")` replaces Axon Framework 4's `@Revision`.

## Event compatibility: the hard part

An event is written once and read forever. You can never change it. So what do you do when
the world moves on?

### Level 1 — payload conversion (the easy answer)

Axon Framework 5 stores the event with its `MessageType` metadata, and when a handler
receives it, Axon converts the payload to whatever type that handler declares. This is the
same `Converter` mechanism used for commands.

This handles the common case: you added a field with a sensible default, and the old stored
events don't have it. The handler can still be given the new type, and the missing field
gets its default. Mostly this just works.

### Level 2 — event transformation (the real answer)

Adding a field is easy. **Reshaping** an event — renaming a field, splitting one event into
two, changing a nested structure — is not. That's what **event transformation** is for. It
rewrites the event as it's read out of the store, so the rest of the system sees the new
shape.

The dependency is `io.axoniq.framework:axoniq-message-transformation`, and the types are
`EventTransformation` and `EventTransformerChain` — in the `io.axoniq.framework` package,
so it's an Axoniq Framework (commercial) feature, not the open-source core.

Axon Server also has a server-side equivalent: **persistent event transformation**, which
applies the rewrite once, permanently, rather than on every read. That has a real
operational consequence — it's a mutation of your data, and it's not undoable. See
[`11-axon-server.md`](11-axon-server.md).

### Level 3 — write new events

When the meaning itself changed, you don't transform. You append a new event type and let
the old one be history. This is the most honest answer and the one that costs the most
thought.

### In practice

A codebase that has been running for a while will have all three, plus a lot of events that
nobody has looked at in years. When you meet an event class, the useful question is: *who
reads this, and would they be surprised by the current shape?* Usually the answer is that
it's read by exactly one handler in a projector, and it hasn't changed since it was written.

## Sequence numbers

An event's position within its stream. Two related metadata entries in Axon Framework 4's
aggregate-based model: `@SequenceNumber` (a `Long`) gives the position, `@SourceId` (a
`String`) gives the aggregate identifier that published it, and `@AggregateType` gives the
aggregate type name.

The documentation's own caveat is important:

> None of the above are applicable when the event store is based on the dynamic consistency
> boundary principle, since events are not aggregate-specific in that scenario.

In other words: with event-sourced entities, reach for the **tag** on the event instead.
Don't expect `@SequenceNumber` to resolve.

## In the code

A realistic event, its tag, and everything that reads it:

```java
// The event — written once, read forever
@Event(namespace = "faculty", name = "StudentEnrolled", version = "1.0.0")
public record StudentEnrolled(
        @EventTag String courseId,
        String studentId,
        Instant enrolledAt) { }
```

```java
// Read side 1: a projector maintains a counter
@EventHandler
void on(StudentEnrolled event) {
    courseStatisticsRepository.incrementEnrolled(event.courseId());
}

// Read side 2: a notification. No state, so no entity, so no load.
@EventHandler
void on(StudentEnrolled event, @MetadataValue("userId") String userId) {
    notificationService.send(userId, "You are enrolled on " + event.courseId());
}

// Write side: the entity rebuilds its own count from these events
@EventSourcingHandler
void on(StudentEnrolled event) {
    this.enrolledCount++;
}
```

Same event, three consumers, three completely different reasons to be interested in it.
That multiplicity is the point of events, and it's why you'll find the same event class
referenced from files in packages that have nothing to do with each other.

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `EventBus` | still exists — and `EventBus` now *extends* `EventSink`. Neither replaced the other |
| `EventGateway` | `EventAppender` — and `EventGateway` still exists alongside it |
| `AggregateLifecycle.apply(…)` | `EventAppender.append(…)` |
| `@AggregateIdentifier` on events | `@EventTag` |
| `@Revision("1.0")` | `@Event(version = "1.0.0")`. Unversioned events also shift: `0.0.0` → `0.0.1` |
| `XStreamSerializer`, `JacksonSerializer` | `JacksonConverter`; XML via `XmlMapper` *(a Jackson type, not an Axon one)*. XStream has "no direct replacement", and the new format is **not** XStream-compatible — stored events may need reprocessing |
| `axon.serializer.*` properties | `axon.converter.*` properties |
| `SingleEventUpcaster`, `EventUpcasterChain` | `EventTransformation`, `EventTransformerChain` (Axoniq Framework), keyed on `MessageType` |
| `apply(event, metaData)` | `EventAppender` is processing-context aware, so "correlation data is taken care of" |

## See also

- [`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md) — who
  actually consumes these, and what happens when one fails.
- [`07-projections-and-read-models.md`](07-projections-and-read-models.md) — building
  read-side state from these.
- [`09-data-loading-and-replay.md`](09-data-loading-and-replay.md) — what happens when an
  entity reconstructs itself from a stream of them.
