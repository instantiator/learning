# 06 — Queries

A **query** is a request for information. It's the read side's front door, and the simplest of
the three message types — with one genuinely interesting complication.

## Terms you'll meet

| Term | Meaning |
|---|---|
| Query | A request for data. No side effects |
| `@QueryHandler` | Marks the method that answers a query |
| `QueryGateway` | The public entry point for dispatching queries |
| `QueryBus` | The low-level component behind the gateway |
| `SimpleQueryBus` | The local, in-process query bus |
| `QueryUpdateEmitter` | Emits initial results and live updates to a subscriber |
| Subscription query | A long-lived stream of results for a registered query |
| `QueryUpdateMessage` | The envelope for an update delivered to a subscriber |
| `ResponseTypes` | **AF4 only.** The wrapper for result types. Gone in AF5 |
| `DuplicateQueryHandlerSubscriptionException` | Two handlers for the same query name |

## The idea

A query asks a question. The dispatcher is `QueryGateway` in Axon Framework 5, backed by a
`QueryBus`.

Two rules the documentation states clearly:

1. **A query has no side effects.** The framework will let you pass an `EventAppender` or a
   `CommandDispatcher` into a query handler, and the docs say plainly that this is
   "generally discouraged". If a query changes something, it's a command.
2. **Exactly one handler per query name.** Two `@QueryHandler` methods for the same query name
   is a startup error — `DuplicateQueryHandlerSubscriptionException`.

And the thing that is **not** there: fan-out. The AF5 reference is explicit that the framework
"does not support scatter-gather queries where multiple handlers respond to the same query",
and the feature-comparison table marks it as removed. If you need several sources merged,
issue separate queries, or aggregate in one handler.

Note what "no side effects" buys you: a query handler is safe to call at any time, from
anywhere, and it never takes a lock. That's why the read side is cheap.

## Declaring and handling

```java
@Query(namespace = "faculty", name = "CourseStatistics", version = "1.0.0")
public record CourseStatistics(String courseId) { }
```

```java
@QueryHandler
public CourseStatisticsRow handle(CourseStatistics query) {
    return repository.findById(query.courseId())
                     .orElseThrow(() -> new QueryExecutionException("No such course"));
}
```

By default Axon matches a handler to a query by the **fully qualified class name** of the
first parameter. To answer the same query from a differently-typed payload, name it:

```java
@QueryHandler(queryName = "faculty.CourseStatistics")
public CourseStatisticsRow handle(CourseStatisticsQueryDto dto) { ... }
```

Handler return types can be a plain value, a `CompletableFuture`, or a `Publisher`.

## Dispatching

`QueryGateway` is what application code uses:

| Method | Returns |
|---|---|
| `query(q)` | a single result |
| `query(q, R.class)` | a single result, converted to `R` |
| `queryMany(q)` | multiple results, as a `List` |
| `streamingQuery(q)` | a `Publisher<QueryResultMessage>` — many results over time |
| `subscriptionQuery(q, initial, update)` | a `Publisher<QueryUpdateMessage>` — initial result, then live updates |

> **Version markers.** In Axon Framework 4 you wrapped the expected type in `ResponseTypes`:
> `query(q, ResponseTypes.instanceOf(CourseStatisticsRow.class))`, and
> `ResponseTypes.multipleInstancesOf(…)` for the list form. Scatter-gather (`queryAll` with
> `ResponseTypes.multipleResults()`) existed and is **removed** in 5. If you see
> `ResponseTypes` in the code, you're on 4.

## The interesting part: query updates

A plain query gives you a snapshot at one moment. `queryMany` gives you a list at one moment.
Neither is much use for a screen that needs to stay current.

The answer is a **subscription query**, and the server side is a `QueryUpdateEmitter`.

```java
@EventHandler
public void on(StudentEnrolled event, QueryUpdateEmitter emitter) {
    emitter.emit(CourseStatistics.class,                       // the query
                q -> q.courseId().equals(event.courseId()),    // the filter
                () -> repository.findById(event.courseId()));   // the supplier
}
```

Read the three arguments carefully, because the middle one is the interesting one:

1. **the query class** — which query this update is for;
2. **the filter** — a predicate deciding which *subscribers* the update applies to. This is how
   a subscriber says "I only care about this one course";
3. **the supplier** — produces the fresh result on demand.

The emitter serves both roles. Registering it against a query supplies the **initial** result
for a new subscriber; emitting an update pushes **incremental** results to everyone whose
filter matches.

> **Version markers, and a real API change.** In Axon Framework 4 this emitter was
> **injected as a field** in a saga or handler. In Axon Framework 5 it is **a handler
> parameter** — you cannot field-inject it. If you see a `QueryUpdateEmitter` field in an
> Axon 5 codebase, it's either version 4 code or a mistake.
>
> There is also **no `@QueryUpdateHandler` annotation** in Axon Framework 5. Updates come from
> ordinary event handlers that take the emitter as a parameter, as above.

Because the emitter must be a parameter, the pattern is: an event handler, taking the emitter,
calling `emit`. There is no separate annotation to mark it.

The client half is `subscriptionQuery`:

```java
subscriptionQuery(new CourseStatistics("course-1"), CourseStatisticsRow.class,
                  row -> { /* initial */ },
                  row -> { /* updates */ })
```

which returns a `Publisher` of `QueryUpdateMessage`.

The design is nice because one handler serves subscribers with different interests, and the
filtering happens server-side instead of in every client.

The catch, and it's inherent to the architecture: the updates come from **event handlers**, so
they're eventually consistent. A newly-created course won't appear in your subscription until
its projector has caught up. See
[`07-projections-and-read-models.md`](07-projections-and-read-models.md) for the timeline.

## Configuration

Queries are typically local — they read the read model, which is in your database. The
default, and in practice what you want:

```java
@Bean
QueryBus queryBus(QueryHandler queryHandler) {
    return SimpleQueryBus.create(queryHandler);
}
```

`SimpleQueryBus` is `org.axonframework.messaging.queryhandling.SimpleQueryBus`.

> **Version marker, and a common misremembering:** `SimpleQueryBus` is **not** an Axon 5 rename.
> Axon Framework 4.13 already documented `SimpleQueryBus`, alongside `AxonServerQueryBus` for
> the Axon Server variant. And `DirectQueryBus` — a name that appears in blog posts and
> Stack Overflow answers — does not appear in any official version of the documentation. If
> you see it, check where it came from.

When queries need to reach data in *another* service — an **external projection** — you need a
distributed bus: `io.axoniq.framework.messaging.queryhandling.distributed`, registered through
an Axoniq Framework `QueryBusConnector`. That is a commercial module, so it requires a licence
and a running Axon Server.

| | Local projection | External projection |
|---|---|---|
| Where the data lives | your database | another service's database |
| What reads it | your application's query handlers | other services' query handlers |
| Transport | none, direct | distributed bus, needs Axon Server |
| Bus type | `SimpleQueryBus` | `DistributedQueryBus` (Axoniq Framework) |

## In the code

The full round trip, which is the shape you'll see in a REST controller:

```java
@RestController
class CourseController {

    private final QueryGateway queries;

    @GetMapping("/courses/{id}")
    CourseRow get(@PathVariable String id) {
        return queries.query(new CourseStatistics(id), CourseRow.class);
    }

    @GetMapping("/courses/{id}/live")
    Flux<CourseRow> live(@PathVariable String id) {
        return queries.subscriptionQuery(
                new CourseStatistics(id),
                CourseRow.class,      // initial result
                row -> { }            // subsequent updates
        );
    }
}
```

The second method is the interesting one: a REST endpoint that stays current without polling,
fed by the read model's projector rather than by polling the write side.

## Exceptions

| Exception | Meaning |
|---|---|
| `QueryExecutionException` | Thrown by, or wrapping a failure from, a query handler |
| `DuplicateQueryHandlerSubscriptionException` | Two handlers for the same query name. Thrown at startup |

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `ResponseTypes.instanceOf(X.class)` | `query(q, X.class)` |
| `ResponseTypes.multipleInstancesOf(X.class)` | `queryMany(q)` |
| `ResponseTypes.multipleResults()` + `queryAll` | **removed** (scatter-gather) |
| `QueryUpdateEmitter` as an injected field | `QueryUpdateEmitter` as a handler parameter |
| `AxonServerQueryBus` for the Axon Server variant | `SimpleQueryBus` / `DistributedQueryBus` |
| `LocalQueryBus`, `DirectQueryBus` | not official names; `SimpleQueryBus` is |
| `org.axonframework.queryhandling` | `org.axonframework.messaging.queryhandling` |
| — | no `@QueryUpdateHandler` annotation exists |

## See also

- [`07-projections-and-read-models.md`](07-projections-and-read-models.md) — what queries
  actually read from, and why updates are eventually consistent.
- [`01-messaging-core.md`](01-messaging-core.md) — the message envelope, and why queries can
  be context-aware.
- [`10-configuration.md`](10-configuration.md) — registering query handling.
