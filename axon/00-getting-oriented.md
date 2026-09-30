# 00 — Getting oriented

**Read this first.** It gives you the shape of the whole system and the vocabulary map
you'll use for the other twelve notes.

## Terms you'll meet

| Term | Meaning |
|---|---|
| CQRS | Command Query Responsibility Segregation — splitting writes from reads |
| Event sourcing | Storing state as a sequence of events rather than as a row |
| Event store | The append-only store where events live |
| Write side / read side | The side that decides; the side that answers |
| Bounded context | A DDD boundary within which a model is consistent |
| Consistency boundary | The region of state that must be updated atomically |
| Projection | A derived, read-optimised view built from events |
| Axon Framework | The Java library (open source, `org.axonframework`) |
| Axon Server | The Axoniq server that stores events and routes messages (commercial) |
| Axoniq Framework | The commercial distribution (`io.axoniq.framework`) |

## The idea

Axon is a framework built around one decision: **an event is the primary unit of
information in your system.** Not a table row, not a DTO — an event.

The framework is easier to understand if you read it as implementing two well-known
architectural patterns at once.

### CQRS: two responsibilities, two sides

**CQRS** (Command Query Responsibility Segregation) is the observation that most
software does two fundamentally different jobs, and that they are usually tangled
together:

1. **Changing** state, where correctness depends on enforcing rules against everything
   you currently know about that state.
2. **Reporting** on state, where the only requirement is to return an answer shaped for
   the reader.

CQRS separates them. In Axon this separation is not a suggestion — it is enforced by the
type system. The two sides have different message types, different buses, and different
components, and they meet only at the event store.

- The **write side** receives **commands**, enforces business rules, and appends
  **events**. It does not answer questions.
- The **read side** receives nothing. It reads events, builds a **projection**, and
  answers **queries** from that projection.

Note the asymmetry: the write side *produces* events, the read side *consumes* them, and
nothing flows the other way. That is the whole architecture.

### Event sourcing: the log is the truth

**Event sourcing** is a specific way of persisting state. Instead of writing the current
value of a thing, you write down every change that happened to it, in order. Reconstructing
the current state means replaying those changes from the beginning.

```
Row storage:        Course(id=1, capacity=50, enrolled=47)          ← one mutable row
Event-sourced:      CourseCreated(1, capacity=50)
                    StudentEnrolled(1, s-9)
                    StudentEnrolled(1, s-2)
                    ... 47 times ...
```

These look similar until you ask questions. With a row you know the number 47. With a log
you know *which* 47 students, in what order, who triggered each one, and — if you want it
— the exact state at any point in the past. You can also reconstruct the number 47 by
replaying.

The cost is that reading the current state means reading a stream. Axon manages that with
snapshots, and this is why you'll meet them in a codebase that feels slower than it
should.

**Why bother?** Three reasons, in the order teams usually discover them:

1. **The audit trail is free.** "How did this account get a negative balance?" is a
   question you answer by reading the log, not by reverse-engineering a table.
2. **Time travel is free.** Read the stream up to last Tuesday to answer "what did the
   dashboard look like then?" — genuinely hard with a mutable table.
3. **Mistakes are correctable.** If a bad event is in the log, you can project it away.
   With a row, the evidence is gone.

## Two sides, in practice

A single user action travels this path:

```
REST controller
      │  commandGateway.send(EnrollStudentCommand)
      ▼
   CommandBus ─────────► Command handler on an entity
                              │  loads state, checks "is the course full?"
                              │  appends events
                              ▼
                          EventAppender
                              │
                              ▼
                        ┌──────────────┐
                        │ Event Store  │  append-only, the source of truth
                        └──────────────┘
                              │  an event processor reads forward from a token
                              ▼
                    Projector / query handler / saga
                              │  writes a row, or dispatches another command
                              ▼
                    ┌──────────────────────┐
                    │  Read model (table)  │  the projection
                    └──────────────────────┘
                              │
                              ▼
                      QueryGateway ──────► REST response
```

Two things to take away. First, the round trip through the event store is **asynchronous**:
a command handler returns as soon as the event is appended, so the read side may be behind.
This is **eventual consistency**, and it is not a bug to be fixed — it's the architecture.

Second, the read model can be **deleted and rebuilt** at any time, because it contains no
information that isn't in the event store. That single property makes replay possible,
and it is covered in [`09-data-loading-and-replay.md`](09-data-loading-and-replay.md).

## Bounded contexts and consistency boundaries

Two related DDD terms that Axon uses in distinct ways.

A **bounded context** is a boundary within which one model of the domain is valid. An
`Order` in the sales context and an `Order` in the fulfilment context are different types
with different fields, and that is correct. In Axon, a bounded context maps to an
application, and — when you use Axon Server — to a **context**. See
[`11-axon-server.md`](11-axon-server.md).

A **consistency boundary** is the region of state that must change atomically or not at
all. Axon Framework 4's `Aggregate` was the unit of this. Axon Framework 5 renamed it
**entity**, and the concept is unchanged. One entity is loaded, changed, and saved under
a single lock, so two commands that touch the same entity are serialised.

This is also the "when do I need an entity?" test: if a command needs to check state
before deciding, it needs an entity. If it doesn't, it should be a **stateless command
handler** — no loading, no locking, cheaper. See
[`02-commands.md`](02-commands.md) and
[`03-entities-and-aggregates.md`](03-entities-and-aggregates.md).

## The four message types

Almost everything in Axon is one of these. They're worth memorising in a table:

| Message | Direction | Changes state? | Has a result? |
|---|---|---|---|
| **Command** | inbound | Yes — or refuses to | Yes, or an exception |
| **Event** | outbound | Already has | No |
| **Query** | inbound | No | Yes, always |
| **Message** | — | The abstract parent of all three | — |

The critical asymmetry: **events have no result and never fail loudly.** You cannot wait
for an event to be handled and find out whether it worked. That is why the read side is
eventually consistent, why the dead-letter queue exists
([`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md)), and why
event handlers are not supposed to contain business logic.

## The Axon Framework 4 → 5 rename map

**This is the most useful page in this directory if you're reading an unfamiliar
codebase.** Axon Framework 5 renamed a large fraction of the public API. Same idea,
different word. If you're in an Axon Framework 4 codebase you'll see the left column; in
an Axon Framework 5 codebase, the right.

| Concept | Axon Framework 4 | Axon Framework 5 |
|---|---|---|
| Consistency-boundary class | `@Aggregate` | `@EventSourcedEntity` (plain Java) or `@EventSourced` (Spring) |
| Identifier on a command payload | `@TargetAggregateIdentifier` | `@TargetEntityId` (which instance to load) **and** `@Command(routingKey = "…")` (where to route) |
| Identifier on an event | `@AggregateIdentifier` | `@EventTag` |
| `CreationPolicy` | `@CreationPolicy(…)` | **removed** — use a stateful/stateless command handler, or `@ForcedEntityCreator` |
| Publishing an event | `AggregateLifecycle.apply(…)` | `EventAppender.append(…)` |
| Handler name | `@ProcessingGroup` | `@Namespace` |
| Tracking event processor | `TrackingEventProcessor` | `StreamingEventProcessor` |
| Token persistence | `TokenStore` | `TokenStore` (same name, new package) |
| Which event store to read | `EventProcessingConfigurer` | `StreamingEventProcessor` over a `StreamableEventSource` |
| Revising an event class | `@Revision` | `@Event(version = "…")` |
| Payload serialisation | `Serializer`, `XStreamSerializer`, `JacksonSerializer` | `Converter`, `JacksonConverter`; properties `axon.serializer.*` → `axon.converter.*` |
| Changing a stored event's shape | `SingleEventUpcaster`, `EventUpcasterChain` | `EventTransformation`, `EventTransformerChain` (Axoniq Framework, commercial) |
| Configuration root | `AxonConfiguration`, `Configurer` | `ApplicationConfigurer`, `MessagingConfigurer` |
| Cross-cutting customisation | `ConfigurerModule` | `ConfigurationEnhancer` |
| Dispatch a command from a handler | `CommandGateway` | `CommandDispatcher` |
| Event sink | `EventBus` | `EventSink` — but `EventBus` still exists and now *extends* it, so this is not a rename |
| Test fixture | `AggregateTestFixture`, `SagaTestFixture` | `AxonTestFixture` (one fixture for both) |
| Snapshot trigger | `SnapshotTriggerDefinition` | `SnapshotPolicy` |
| Long-running process | `@Saga` | **removed** — see [`08-sagas-and-long-running-processes.md`](08-sagas-and-long-running-processes.md) |
| Deadlines | `DeadlineManager` | **removed** — bring your own scheduler |
| Async result type | `CompletableFuture` | `CompletableFuture` / `Publisher` / `MessageStream` |
| Entity/aggregate caching | `EntityCache`, `@Aggregate` attributes | **unresolved in the docs** — see the caching caveat in [`03`](03-entities-and-aggregates.md) |

### Two more differences that aren't renames

**Sagas and deadlines are gone from Axon Framework 5 core.** Not renamed — removed. A
`Saga` construct, `SagaStore`, `DeadlineManager`, and `@DeadlineHandler` do not exist.
Long-running processes are now built from ordinary event handlers and a repository of your
own, or from the commercial Workflows feature. If a codebase has `@Saga` in it, it is Axon
Framework 4 (or using the `axon-legacy` migration aid). This is covered in full in
[`08-sagas-and-long-running-processes.md`](08-sagas-and-long-running-processes.md).

**The test API shrank.** `AxonTestFixture` replaced the old fixtures, but it also dropped
capabilities: `expectState` is unavailable, and so is time manipulation
(`whenTimeElapses` and friends) — because deadlines went with it. `SagaTestFixture` has no
replacement. See
[`12-testing-and-observability.md`](12-testing-and-observability.md).

**Configuration is lazy in Axon Framework 5.** Components are built on demand from
declared builders rather than constructed eagerly, which is why you'll see `config ->`
lambdas and `config.getComponent(…)` calls where you might have expected a constructor.
See [`10-configuration.md`](10-configuration.md).

### The `io.axoniq` trap

Axon Framework 5 core is still `org.axonframework`. The `io.axoniq.framework` namespace is the
**commercial Axoniq Framework modules** — the Axon Server connector, distributed messaging, the
dead-letter queue, message transformation, data protection, and testcontainers. The framework
comparison guide puts it directly: "Axon Framework modules are marked with
`org.axonframework`, whereas Axoniq Framework modules are marked with `io.axoniq.framework`."

So `io.axoniq.framework` in an import tells you someone holds a licence. It does **not** tell
you which major version of Axon Framework they're on.

### Which distribution?

Axon ships in two flavours, and the package name tells you which you're in:

| | Axon Framework | Axoniq Framework |
|---|---|---|
| Licence | Apache 2.0 | Commercial |
| Package prefix | `org.axonframework` | `io.axoniq.framework` |
| Contains | Core messaging, modelling, event sourcing, test fixtures | Adds Axon Server connectivity, PostgreSQL event store, distributed messaging, sequenced dead-letter queue, data protection, event transformation, multi-tenancy, Workflows |

So: **`org.axonframework` is open-source core; `io.axoniq.framework` needs a licence.**
If you see an import you can't resolve and it starts with `io.axoniq`, you're looking at a
commercial API.

## Orienting yourself in a codebase

Practical order of attack, assuming you need to understand rather than change something.

**1. Find the command side first.** Grep for `@CommandHandler` in Axon Framework 4, or
`@CommandHandler` in both. These tell you the vocabulary of the system — commands are
named after business intent, so the list of commands is close to a list of use cases.
`02-commands.md`.

**2. Follow one command end to end.** Pick a simple one, find its handler, and read the
events it appends. That single path teaches you entity loading, event appending, and
transaction boundaries at once. `03-entities-and-aggregates.md`, `04-events.md`.

**3. Find the event handlers.** Grep for `@EventHandler`. This is where the read side,
notifications, and process managers live. `05-event-handlers-and-processors.md`.

**4. Find the projections.** Look for classes with `@EventHandler` methods that write to
a repository or a JPA entity, and for the read-side table. This is what queries read from.
`07-projections-and-read-models.md`, `06-queries.md`.

**5. Check the version.** Look at the Maven/Gradle coordinates. `axon-spring-boot-starter`
4.x means Axon Framework 4; 5.x means Axon Framework 5. This determines which half of the
rename map applies to everything above.

## See also

- [`01-messaging-core.md`](01-messaging-core.md) — the `Message` abstraction all three
  message types build on.
- [`10-configuration.md`](10-configuration.md) — how all of this gets wired together.
- [`11-axon-server.md`](11-axon-server.md) — where the event store lives in production.
