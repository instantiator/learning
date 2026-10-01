# 01 — Messaging core

Every concept in Axon is built on one abstraction: the **message**. Learn this note and the
other twelve become much easier, because commands, events, and queries differ far less than
you'd expect.

## Terms you'll meet

| Term | Meaning |
|---|---|
| `Message` | The base abstraction: a typed payload plus metadata |
| Payload | The object carrying the actual content — a command, an event, or a query |
| `Metadata` | Key/value side-channel: identifiers, timestamps, correlation, tenant |
| `MessageType` | A `QualifiedName` plus a version string. The logical *identity* of a message |
| `QualifiedName` | `namespace + name`, e.g. `faculty.IssueStudentTranscript` |
| Bus | The component that accepts messages of one kind and routes them to handlers |
| Dispatch | The act of sending a message onto a bus |
| Handle | The act of a handler method receiving and dealing with it |
| `ProcessingContext` | The unit of work for one message: transactional scope + lifecycle hooks |
| `ParameterResolver` | The mechanism that fills a handler method's parameters |
| Interceptor | Code that wraps dispatch or handling |
| `correlationId` / `causationId` | IDs linking a message to the chain of messages that led to it |

## The idea

A **message** in Axon is two things glued together: a **payload**, which is your domain
object, and **metadata**, which is a map of framework-managed information.

```
┌─────────────────────────────────────────────┐
│ Message                                      │
│                                             │
│  payload:  EnrollStudentCommand(             │
│              courseId = "c-1",               │
│              studentId = "s-9")              │
│                                             │
│  metadata:  {                               │
│              "id"            : "uuid-1234",  │  ← Axon-generated
│              "timestamp"     : 2026-03-11T… │  ← Axon-generated
│              "type"          : faculty.Enroll,
│              "correlationId" : "trace-77",   │  ← Axon-generated
│              "causationId"   : "uuid-1230",  │  ← Axon-generated
│              "userId"        : "u-42"        │  ← you put this here
│            }                                │
└─────────────────────────────────────────────┘
```

The separation matters more than it looks. **The payload is yours; the metadata is
Axon's.** Which means:

- If you change the shape of a command class, the metadata is untouched.
- If you want to pass extra information *without* changing the message type, you put it in
  metadata. The receiving handler pulls it out with `@MetadataValue("userId")`.
- You can inspect the whole envelope in a log or a database without deserialising the
  payload.

### `MessageType`: identity is not the Java class

This is a genuinely important design decision in Axon Framework 5, and it's the thing most
in tension with how developers from Axon Framework 4 will think.

A message's identity is a **`MessageType`**, which is a **`QualifiedName`** (a namespace
plus a name) and a **version** string:

```java
@Command(namespace = "faculty", name = "IssueStudentTranscript", version = "1.0.0")
public record IssueStudentTranscript(StudentId studentId, CourseId courseId) { }
```

The point is that this decouples the *logical identity* of a command from its Java
representation. Two different Java classes can be the same command. That unlocks
something useful: **payload conversion at handling time**.

```java
// Two representations of the same logical command
@Command(namespace = "faculty", name = "IssueStudentTranscript", version = "1.0.0")
public record IssueStudentTranscript(StudentId studentId, CourseId courseId) {}

public record IssueStudentTranscriptDto(String studentId, String courseId) {}

@CommandHandler
public void handle(IssueStudentTranscript command) { /* strongly-typed IDs */ }

@CommandHandler(commandName = "faculty.IssueStudentTranscript")
public void handle(IssueStudentTranscriptDto dto) { /* plain strings */ }
```

Axon uses a **`Converter`** to convert the payload to whatever type the handler declares.
This means a service that has evolved to use a `CustomerId` value object can still receive
commands from a service that hasn't. It also means many of the reasons people reach for
**upcasters** in Axon Framework 4 simply don't apply to commands — the docs are explicit
that upcasters (now *event transformation*) are still needed for stored events, but
conversion is the better tool for commands.

**Defaults, if you don't annotate:** the name is the fully qualified class name, and the
version defaults to `"0.0.1"`. The namespace defaults to the class's package name, or to a
`@Namespace` annotation if present. Note that default version is a documented
inconsistency — the query handler page says `1.0`, the anatomy-of-a-message page says
`0.0.1`. Set `@Command(version = …)` explicitly and the question never arises.

The `@Namespace` annotation (`org.axonframework.messaging.core.annotation`) is worth
noticing. It can sit on a class, an enclosing class, the package's `package-info.java`, or
the module descriptor — which makes it a clean way to stamp an entire bounded context with
its namespace. In Axon Framework 4, the closest equivalent was `@ProcessingGroup`.

## The three buses

Axon has one bus per message type. They look like siblings but behave quite differently.

| Bus | Interface | Accepts | Returns | On failure |
|---|---|---|---|---|
| Command | `CommandBus` / `CommandGateway` | commands | a result or an exception | the sender finds out |
| Event | `EventBus` / `EventSink` | events | nothing | nobody finds out |
| Query | `QueryBus` / `QueryGateway` | queries | a result | the sender finds out |

That middle row is the important one. **An event has no result and no caller.** You publish
it and move on. If a handler later chokes on it, the failure surfaces somewhere else — a
dead-letter queue, an error handler, a stuck processor. This is the structural reason
Axon is eventually consistent, and it's covered properly in
[`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md).

## `ProcessingContext`: the unit of work

When Axon handles a message, it opens a **`ProcessingContext`**. It is the transactional
scope for that one message: things appended inside it are stored together, or not at all.

Its lifecycle is a fixed sequence of phases, and you can hook into any of them:

```
pre-invocation → invocation → post-invocation → prepare-commit → commit → after-commit
```

The practical API:

```java
@CommandHandler
public void handle(IssueCard command,
                   EventAppender appender,
                   ProcessingContext context) {

    appender.append(new CardIssued(command.cardId(), command.amount()));

    // only runs if the unit of work commits successfully
    context.runOnCommit(ctx -> notifyIssuingBank(command));
}
```

`runOnCommit` is the idiom that replaces a lot of "publish an event, then send an email"
code that used to be a liability — the email only goes out if the event actually stored.

The context also carries a **resource map** for the duration of the message:
`putResource`, `getResource`, `containsResource`, `computeResourceIfAbsent`. This is how
the event store knows which JDBC connection or which transaction to use. The `EventAppender`
you were handed is bound to this context; that's the mechanism by which "append an event"
becomes "append an event in this transaction."

> **Axon Framework 4 name:** `UnitOfWork`, usually reached through the static
> `CurrentUnitOfWork.get()`. Same idea, thread-local access. Axon Framework 5 passes it to
> you explicitly, which is both nicer and testable.

## Handler parameters

You don't have to be told what a handler method needs. Axon inspects its parameters and
fills them. This is done by a **`ParameterResolver`**, built by a `ParameterResolverFactory`
— and you can add your own, which is how a codebase ends up with a
`@AuthenticatedUser` annotation that just works.

The rule: **the first parameter is always the payload**, unless you want the whole message
instead (in which case set `commandName`/`eventName`/`queryName` so Axon knows which
message the method is for).

### Command handlers

| Parameter | What you get |
|---|---|
| first parameter | the command payload |
| `CommandMessage` / `Message` | the whole envelope |
| `Metadata` | the whole metadata map |
| `@MetadataValue("userId") String` | one metadata entry. `required = true` means *don't invoke me without it* |
| `@MessageIdentifier String` | the message's own id |
| `ProcessingContext` | the unit of work |
| `EventAppender` | publish events, context-aware |
| `CommandDispatcher` | send another command, context-aware |
| any Spring bean | injected; `@Qualifier` to disambiguate |

### Event handlers

Everything above except `@MessageIdentifier` variations, plus:

| Parameter | What you get |
|---|---|
| `@Timestamp Instant` | when the event was *generated*, not when it was handled |
| `TrackingToken` | the processor's current position. Streaming processors only |
| `Segment` | which slice of the stream this handler owns. `null` for subscribing processors |
| `ReplayStatus` | `REGULAR` or `REPLAY` — the key to writing replay-safe handlers |
| `@ReplayContext` | the context object you supplied when starting the replay |
| `QueryUpdateEmitter` | push updates to subscription queries |

### Query handlers

First parameter (the query payload), `QueryMessage`, `Metadata`, `@MetadataValue`,
`@MessageIdentifier`, `ProcessingContext`, `CommandDispatcher`, `EventAppender`, and any
Spring bean. Note that `CommandDispatcher` and `EventAppender` are *allowed* but
discouraged — a query with side effects is a smell.

### Aggregate-specific parameters

The docs also list `@AggregateType`, `@SequenceNumber`, and `@SourceId` for event
handlers, and immediately note that none of them apply under the dynamic consistency
boundary principle, where events are not aggregate-specific. These are Axon Framework 4
`@Aggregate` concepts. In Axon Framework 5 with an event-sourced entity, the equivalent
information is the **tag** you put on the event (`@EventTag`) — see
[`04-events.md`](04-events.md).

## Correlation: following one request through the system

Axon ships a `MessageOriginProvider` that automatically stamps two metadata entries on
every message it publishes:

- **`correlationId`** — the same for every message triggered by the same originating
  request.
- **`causationId`** — the identifier of the message that directly caused this one.

The resulting chain looks like this:

```
Command  1                                    (correlationId: -,              causationId: -)
Event    2  correlationId 8231323  causationId 1
Command  3  correlationId 8231323  causationId 2
Event    4  correlationId 8231323  causationId 3
```

Every message from one user action shares a `correlationId`, and `causationId` forms a
parent-child chain. When a customer asks why their order is in a weird state, this is how
you find out. The `LoggingInterceptor` — registered by default — writes all of it to SLF4J
if you need it in a log.

> **Axon Framework 4 difference:** AF4's `correlationId` corresponds to AF5's
> `causationId`. `MessageOriginProvider` is the default `CorrelationDataProvider` in
> *both* 4.13 and 5.3 — so this is a changed default, not a new bridging type. If you're
> comparing log output from two systems, override the provider; the IDs are not
> otherwise interchangeable.

## Interceptors

An **interceptor** wraps a point in the message's path. Axon Framework 5 has two
distinct kinds, and the distinction matters:

- A **dispatch interceptor** runs *before* routing. It can modify the message. The
  `ProcessingContext` is `@Nullable` here, because it runs before a context necessarily
  exists.
- A **handler interceptor** runs *around* the handler, after routing. The
  `ProcessingContext` is always present.

Both are now asynchronous-first, returning a `MessageStream<?>`. You short-circuit a chain
by returning `MessageStream.empty()`; you fail it with `MessageStream.failed(e)`. Neither
call `chain.proceed(...)`, the chain stops there.

Register them globally, per message type, or on a single handler class:

```java
configurer.registerCommandHandlerInterceptor(myInterceptor);
configurer.registerEventHandlerInterceptor(myInterceptor);
configurer.registerDispatchInterceptor(myInterceptor);
```

In Spring Boot, declaring an interceptor bean is enough — they're auto-discovered and
ordered by `@Order`. A generic `MessageDispatchInterceptor<Message<?>>` bean applies to
commands, events, **and** queries.

For per-class interception, the annotations are `@CommandHandlerInterceptor`,
`@EventHandlerInterceptor`, and `@QueryHandlerInterceptor`, on a method inside a handling
component. Two shapes: a *before* interceptor with no chain parameter (the framework
proceeds for you), or a *surround* interceptor that takes the chain and decides whether
to call it. Note there is **no** interceptor support for `@EventSourcingHandler` methods.

> **Axon Framework 4 difference:** same concepts, synchronous signatures. Note the AF4
> method on the interceptor interface is `handle` — not `onDispatch`/`onHandle`, which is a
> commonly repeated error. And `CommandHandlerInterceptor` did not "become" an annotation:
> AF4 had *both* a `MessageHandlerInterceptor` interface and a `@CommandHandlerInterceptor`
> annotation, and AF5 keeps both.

## Exception handling

Three layers, from narrowest to widest:

1. **Throw from the handler.** For commands and queries, the exception becomes the result
   the sender sees. For events, it fails the stream.
2. **`@ExceptionHandler` on the handling component.** Reacts to exceptions from handler
   methods *in the same class*. Narrow it with `resultType`, and optionally
   `messageType`. (Axon Framework 4's `payloadType` attribute is gone.)
3. **A `PropagatingErrorHandler`** on a streaming event processor, for failures during
   background event processing.

The base exception types you'll see in stack traces: `HandlerExecutionException`, with
`CommandExecutionException` and `QueryExecutionException` as its command and query
specialisations. Event handling has no equivalent result channel.

## In the code

```java
@CommandHandler
public void handle(EnrollStudentCommand command,
                   EventAppender appender,
                   @MetadataValue("userId") String userId,
                   ProcessingContext context) {

    appender.append(new StudentEnrolled(command.courseId(), command.studentId()));

    context.runOnCommit(ctx -> emailService.sendConfirmation(userId, command));
}

@EventHandler
public void on(StudentEnrolled event,
               @Timestamp Instant when,
               @MetadataValue("userId") String userId) {

    auditLog.record(event, when, userId);
}
```

Two things to notice. The command handler *appends* and returns; it does not assign
fields. The event handler reads metadata and the original timestamp. Neither touches
entity state — that's the entity's job, and it's covered in
[`03-entities-and-aggregates.md`](03-entities-and-aggregates.md).

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `UnitOfWork`, `CurrentUnitOfWork.get()` | `ProcessingContext`, passed as a handler parameter |
| `Serializer`, `JacksonSerializer` | `Converter`, `JacksonConverter` |
| `axon.serializer.*` properties | `axon.converter.*` properties |
| `traceId` → `correlationId` → `causationId` | same three, but the *defaults* changed |
| `onDispatch` / `onHandle` on interceptors | `interceptOnDispatch` / `interceptOnHandle`, returning `MessageStream<?>` |
| `@ProcessingGroup` | `@Namespace` |
| Upcasters for payload drift | `Converter` for commands; event transformation for stored events |

### Packages, for the ones you'll actually type

| Type | Axon Framework 5 package |
|---|---|
| `ProcessingContext` | `org.axonframework.messaging.core.unitofwork` |
| `Converter` | `org.axonframework.serialization` |
| `JacksonConverter` | `org.axonframework.conversion.jackson` |
| `EventBus`, `EventSink` | `org.axonframework.messaging.eventhandling` |
| `EventGateway`, `EventAppender` | `org.axonframework.messaging.eventhandling.gateway` |
| `MessageType` | `org.axonframework.messaging.core` |
| `CommandDispatcher` | `org.axonframework.messaging.commandhandling.gateway` |
| `EventAppender` is injectable in | command, event, and query handlers |

### Three corrections to a tidy-sounding story

**Correlation.** The `traceId` → `correlationId` → `causationId` chain is real and documented,
and the *defaults* changed between versions. But `MessageOriginProvider` is **not** a new
Axon 5 bridging type — it is the default `CorrelationDataProvider` in **both** 4.13 and 5.3.
The documentation's only advice is that you can "override the `MessageOriginProvider` to use
the old format". So if you're migrating, that's the lever — and it's an override, not a new API.

**Interceptor method names.** `interceptOnDispatch` and `interceptOnHandle` are the Axon 5
spellings and they do return `MessageStream<?>`. The Axon 4 method on the interceptor interface
is `handle` — not `onDispatch`/`onHandle`, which is a commonly repeated error.

**`@CommandHandlerInterceptor`.** It's tempting to tell this story as "a class became an
annotation". It didn't. Axon 4 had *both* a `MessageHandlerInterceptor` **interface** and a
`@CommandHandlerInterceptor` **annotation**, and Axon 5 keeps both. What's new is that the
annotation is now a specialization of `@MessageHandlerInterceptor`:

```
org.axonframework.messaging.core.interception.annotation.MessageHandlerInterceptor
  └── org.axonframework.messaging.commandhandling.interception.annotation.CommandHandlerInterceptor
```

**`AxonConfiguration`.** It still exists in Axon 5, as an interface extending
`Configuration`. What was replaced is the *other* thing: Axon 4's `Configurer` /
`DefaultConfigurer`, which became `MessagingConfigurer` / `ModellingConfigurer` /
`EventSourcingConfigurer`. See
[`10-configuration.md`](10-configuration.md).

## See also

- [`02-commands.md`](02-commands.md) — the first and most common message type.
- [`04-events.md`](04-events.md) — why events behave so differently.
- [`10-configuration.md`](10-configuration.md) — where buses and resolvers get registered.
