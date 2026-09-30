# 02 — Commands

A **command** is a message expressing an intent to change state. It's the entry point to the
write side, and it's where you'll spend most of your time reading.

## Terms you'll meet

| Term | Meaning |
|---|---|
| Command | A request to change something, named for intent |
| `@Command` | Declares a command's name, namespace, version, routing key |
| `@CommandHandler` | Marks the method that handles a command |
| Routing key | The value used to pick which handler *instance* gets the command |
| `RoutingStrategy` | The component that extracts the routing key from a command |
| Creational handler | A `static` handler for the command that *creates* an entity |
| Instance handler | A handler method on an already-loaded entity |
| Stateless handler | A handler needing no prior state — no loading, no locking |
| `CommandGateway` | The public entry point for sending commands |
| `CommandDispatcher` | Like the gateway, but automatically uses the current context |
| `SequencingPolicy` | Decides which commands must run one after another |
| `NoHandlerForCommandException` | No handler is registered for that command type |
| `EntityNotFoundException` | The targeted entity doesn't exist |

## The idea

A command names an **intent**, not an action. `EnrollStudent` is intent. `IncrementCount`
is action. The difference is who decides: intent means the domain decides whether it's
allowed and how it happens; action means the caller has already decided, and the handler
just complies.

This is worth holding onto because it drives the naming you'll see in a codebase. Good
command names are things like `IssueGiftCard`, `EnrollStudent`, `ConfirmOrder` — all
intent. If you see `UpdateColumn` or `SetFlag`, that's usually a smell.

The docs make a point worth repeating: **if a command only validates or fetches without
changing anything, it should probably be a query.** Commands should change conceptual
state.

## Commands are addressed, not broadcast

You send a command to *one* handler. There's exactly one, and it's a configuration
requirement — two handlers for the same command is a startup error, not a
pick-one-at-random situation.

The addressing has two layers, and they're commonly confused:

**Layer 1 — the routing key picks which instance.** If you have ten thousand gift cards,
`IssueCard` has ten thousand possible targets. The routing key says which one.

```java
@Command(routingKey = "cardId")
public record IssueCardCommand(String cardId, int amount, String shopId) { }
```

The `routingKey` attribute names a property on the payload. It can be a field name or a
getter — `cardId` or `getCardId` both work, and the framework looks for `get`-prefixed
methods, `is`-prefixed methods, or an exact name match.

The component that does the extraction is a **`RoutingStrategy`**, living on the
`DefaultCommandGateway`:

| Strategy | Where the key comes from |
|---|---|
| `AnnotationRoutingStrategy` | the `routingKey` attribute on `@Command` (the default) |
| `MetadataRoutingStrategy` | a named metadata entry |
| your own | implement `getRoutingKey(CommandMessage)` |

One warning from the docs that's easy to miss: **the routing key's `toString()` must be
consistent.** If two commands that should go to the same instance produce different strings,
they land on different instances and you get phantom concurrency conflicts.

**Layer 2 — sequencing decides what runs when.** Also keyed on the routing key by
default, but a different mechanism at a different point in the pipeline. A
`SequencingPolicy` decides which commands must be processed one after another; commands
with different sequence identifiers run concurrently.

| Policy | Behaviour |
|---|---|
| `RoutingKeySequencingPolicy` | sequence by routing key (the default) |
| `NoOpSequencingPolicy` | no sequencing; everything concurrent |

The interface is one method:

```java
public interface SequencingPolicy<M extends Message> {
    Optional<Object> sequenceIdentifierFor(M message, @Nullable ProcessingContext context);
}
```

Return `Optional.empty()` and the command bypasses sequencing entirely — which is the
right answer for commands that genuinely don't need it.

> The important structural fact: the sequencing policy is applied by a handler
> interceptor, so it runs **after routing and before the handler executes**. It does not
> change dispatching or routing. Two distinct mechanisms, two distinct phases. Write-ups
> routinely conflate them.

## Three kinds of command handler

This is the single most useful classification in Axon Framework 5, because it tells you
what a handler is going to cost and where its logic lives.

### 1. Stateless

No prior state needed. Each invocation is independent.

Use it for: sending a notification, forwarding to an external system, dispatching a batch
of sub-commands, creating something with a client-supplied id and no rules to check.

```java
@Component
public class FacultyAnnouncementCommandHandler {

    @CommandHandler
    public void handle(SendFacultyAnnouncement command) {
        notificationService.send(command.recipientId(), command.message());
    }
}
```

No entity, no event store read, no lock. Cheapest thing in the framework. The docs are
direct about the failure mode to avoid here:

> If you are adding an entity only to hold a flag that is set once and never changes, that
> is a signal the command may not need an entity.

### 2. Command handlers on the event-sourced entity

Logic lives *on* the entity, next to its state and its event sourcing handlers. This is the
classic DDD shape.

```java
@EventSourcedEntity(tagKey = "courseId")
public class CourseEntity {

    private String courseId;
    private int capacity;
    private int enrolledCount;

    @CommandHandler
    public static String handle(CreateCourse cmd, EventAppender appender) {   // creational
        if (cmd.capacity() <= 0) {
            throw new IllegalArgumentException("Capacity must be positive");
        }
        appender.append(new CourseCreated(cmd.courseId(), cmd.title(), cmd.capacity()));
        return cmd.courseId();
    }

    @CommandHandler
    public void handle(EnrollStudent cmd, EventAppender appender) {          // instance
        if (enrolledCount >= capacity) {
            throw new IllegalStateException("Course is full");
        }
        appender.append(new StudentEnrolled(courseId, cmd.studentId()));
    }

    // @EventSourcingHandler methods omitted — see 03
}
```

Two details that catch people:

- **Creational handlers are `static`.** There is no entity yet. They return the new
  entity's identifier, which is what the caller gets back.
- **`EventAppender` is a handler parameter.** It must be injected, not constructed, and
  never stored or reused across invocations.

### 3. Stateful command handlers in a separate class

The entity holds state; a separate class holds the logic and receives the loaded entity as
a parameter. This maps handlers to use cases rather than to entities, which is the
**Vertical Slice Architecture** fit.

```java
@CommandHandler
void handle(SubscribeStudentToCourse command,
            @InjectEntity Course course,
            EventAppender appender) {

    if (course.enrolledCount() >= course.capacity()) {
        throw new IllegalStateException("Course is full");
    }
    appender.append(new StudentSubscribedToCourse(command.courseId(), command.studentId()));
}
```

The docs present this as "the natural fit for Vertical Slice Architecture", with one
handler class per command:

| Command | Event | Handler class |
|---|---|---|
| `CreateCourse` | `CourseCreated` | `CreateCourseHandler` |
| `RenameCourse` | `CourseRenamed` | `RenameCourseHandler` |
| `SubscribeStudentToCourse` | `StudentSubscribedToCourse` | `SubscribeStudentToCourseHandler` |

Claimed benefits: navigability (you find the logic by the use case), testability,
parallel development, and alignment with the domain model.

## Sending commands: gateway vs dispatcher

**`CommandGateway`** is what application code uses. Wraps your POJO in a `CommandMessage`
for you.

| Method | Behaviour |
|---|---|
| `send(Object)` | fire-and-forget, returns `CommandResult` |
| `sendAndWait(Object[, Class])` | blocks for the result. Re-throws handler exceptions, wrapping **checked** ones in `CommandExecutionException`. Returns `null` for a `void` handler |
| `send(Object, Class<R>)` | `CompletableFuture<R>` |
| `send(Object, Metadata)` | with extra metadata |
| `send(Object, Metadata, ProcessingContext)` | fully explicit |

> **Axon Framework 4 difference:** minimal. Axon Framework 4.13 *already* documents both —
> `send(Object)` as async returning a `CompletableFuture`, and `sendAndWait(Object[, timeout,
> unit])` as the blocking pair. So this is not a 5-only API. If you see
> a blocking `send` you're on 4.

**`CommandDispatcher`** is the in-handler equivalent. It has the same `send(...)` shapes
but **no `ProcessingContext` parameter**, because it automatically uses the current one.
That's the whole point: correlation metadata propagates to the follow-up commands
automatically.

> **Axon Framework 4 name:** Axon Framework 4 also used `CommandGateway` for this. The 5.x
> split into "public gateway" and "context-aware dispatcher" is new. A codebase that
> injects `CommandGateway` into a handler is AF4; one that injects `CommandDispatcher` is
> AF5.

## What can a handler return?

Three things, in rough order of usefulness:

1. **The entity identifier** — a creational handler returns the id of what it just created.
2. **Confirmation data** — an operation reference, a receipt.
3. **A synchronous workflow** — the handler does several steps inline and returns the last
   result.

And the fourth case, which is really the most common: **the handler throws.** An exception
from a command handler *is* the command result.

If you only want information back and change nothing, use a query. A blocking
`sendAndWait` in a request path is often a query in disguise, and it's slower and more
awkward than the alternative.

## Exceptions you'll see

| Exception | Meaning |
|---|---|
| `NoHandlerForCommandException` | Nothing registered for that command type. Common during refactoring: you renamed the class but the sender still sends the old name |
| `EntityNotFoundException` | `@InjectEntity` found no entity for the id. By default, **the command fails** rather than the handler being called with `null` |
| `ChildEntityNotFoundException` | A command routed to a child entity that doesn't exist in the parent's collection |
| `DuplicateCommandHandlerSubscriptionException` | Two handlers for the same command in one entity hierarchy. Thrown **at startup**, so you'll never see it at runtime |
| `CommandExecutionException` | Wraps a checked exception thrown by a handler |
| `ConcurrencyException` | Optimistic-lock conflict on an entity |

### The `@InjectEntity` opt-out

By default, a missing entity fails the command. Three ways to say "no, let me handle
absence":

```java
// (a) a @Nullable annotation
@CommandHandler
public void handle(IssueCard command,
                   @InjectEntity @Nullable GiftCard card,
                   EventAppender appender) { /* card may be null */ }

// (b) Optional
@CommandHandler
public void handle(IssueCard command,
                   @InjectEntity Optional<GiftCard> card,
                   EventAppender appender) { /* card.isEmpty() means absent */ }

// (c) ManagedEntity — the wrapper is never null, only its contents
@CommandHandler
public void handle(IssueCard command,
                   @InjectEntity ManagedEntity<String, GiftCard> card,
                   EventAppender appender) {
    if (card.entity() == null) { /* absent */ }
}
```

For Kotlin, a nullable parameter (`GiftCard?`) works — but only with the `axon-kotlin`
extension, because without it the framework can't tell `GiftCard?` from `GiftCard`. The
Kotlin type wins over a `@Nullable` annotation when they disagree.

`ManagedEntity` has a nice property: the wrapper is never replaced, so it keeps working
*after* the handler appends an event. An event-sourced entity stays subscribed to live
updates, so appending evolves that same `ManagedEntity` in place. That lets one handler
make a second decision, later, based on state an event it just appended established.

## Working with more than one entity

If a command spans entities, name which field to use for each:

```java
@CommandHandler
void handle(SubscribeStudentToCourse command,
            @InjectEntity(idProperty = "courseId") Course course,
            @InjectEntity(idProperty = "studentId") Student student,
            EventAppender appender) { ... }
```

Note that such a command has **no** `@TargetEntityId` — there is no single primary entity.
The handler works across two. See [`03-entities-and-aggregates.md`](03-entities-and-aggregates.md).

## Declaring a command

```java
@Command(
    namespace = "faculty",            // default: the class's package
    name      = "IssueStudentTranscript", // default: the simple class name
    version   = "1.0.0",              // default: "0.0.1"
    routingKey = "studentId"          // which property routes this command
)
public record IssueStudentTranscript(StudentId studentId, CourseId courseId) {}
```

If you omit `@Command` entirely, Axon falls back to the fully qualified class name, which
tightly couples the message's identity to your Java package structure. That's the single
most common cause of "my rename broke everything".

The matching handler annotation:

```java
@CommandHandler(commandName = "faculty.IssueStudentTranscript")
public void handle(IssueStudentTranscriptDto dto) { }

@CommandHandler(commandName = "faculty.RenameCourse", payloadType = RenameCourseDto.class)
public void handleRename(RenameCourseDto dto) { }
```

- `commandName` — the exact command name this method handles.
- `payloadType` — the Java type to convert the payload to.

## In the code

A full path through the layers, so you can see the pieces in order:

```java
// 1. Application code sends it
String cardId = commandGateway.sendAndWait(new IssueCard(cardId, 50))
        .returnPayload(String.class);

// 2. A stateful handler decides
@CommandHandler
String handle(IssueCard command, @InjectEntity ManagedEntity<String, GiftCard> card,
              EventAppender appender) {
    if (card.entity() != null) {
        throw new IllegalStateException("GiftCard for id [" + command.cardId() + "] already exists");
    }
    appender.append(new CardIssued(command.cardId(), command.amount()));
    return command.cardId();
}

// 3. A different handler reacts
@EventHandler
void on(CardIssued event) {
    auditTrail.record("issued", event.cardId());
}
```

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `@TargetAggregateIdentifier` on the payload field | `@TargetEntityId` (which entity to load) **plus** `@Command(routingKey = "…")` (where to route) |
| `@RoutingKey` (an AF4 alternative) | `routingKey` attribute on `@Command` |
| `CommandGateway` for in-handler dispatch | `CommandDispatcher` |
| blocking `send(Object)` | `sendAndWait(Object)` — *but both exist in 4.13* |
| `AggregateLifecycle.apply(…)` to publish | `EventAppender.append(…)` |
| `ConflictResolver` | 0 hits in AF5. `SequencingPolicy` is the documented redesign of async sequencing |
| `DisruptorCommandBus` | absent from the AF5 docs; `SimpleCommandBus` is the only one documented |
| handlers organised by aggregate | third option added: **Stateful Command Handlers** (own class, entity via `@InjectEntity`) |

## See also

- [`03-entities-and-aggregates.md`](03-entities-and-aggregates.md) — where the state comes
  from that handlers validate against.
- [`01-messaging-core.md`](01-messaging-core.md) — the message envelope and `ProcessingContext`.
- [`10-configuration.md`](10-configuration.md) — registering command handling modules.
