# 07 — Projections and read models

A **projection** is a derived view of your data, built from events and shaped for reading.
Axon's own documentation uses two words for it: **projection** in the reference material,
**read model** in the getting-started guides. They mean the same thing.

## Terms you'll meet

| Term | Meaning |
|---|---|
| Projection / read model | A derived, read-optimised view maintained from events |
| Projector | An event handler that builds or maintains a projection |
| Projecting event processor | The streaming processor that drives projectors |
| Denormalisation | Deliberately duplicating data so reads are simple and fast |
| Local projection | Read only by the application that owns it |
| External projection | Published for *other* services to query |
| Consistency boundary | The unit that changes atomically. A projection is *not* one |
| `@ResetHandler` | Prepares a projector for a rebuild |
| `EventSourcedRepository` vs a plain repository | Write side vs read side storage |

## The idea

The write side optimises for *correctness*. It loads an entity, checks every rule, appends
events, and stores them atomically. It is slow, and it should be.

The read side optimises for *speed of retrieval*. It answers "how many seats are left?"
with a single indexed lookup, and it never checks a rule or takes a lock.

You cannot build both from the same code. The write side's representation is full of
structure the reader doesn't care about; the read side's representation throws away
everything the reader doesn't need. That's why CQRS insists on two sides.

A projection is the read side's representation, and the code that maintains it is a
**projector** — an ordinary `@EventHandler` (or a few of them) that writes to a table.

## Why the read side needs its own tables

The strongest version of this argument is about what queries actually need.

Consider "list all courses with fewer than five seats remaining, ordered by title". Against
an event-sourced write side, answering that means: load every course stream, replay every
event, count enrolments, filter, sort. Against a table with an index on
`(seatsRemaining, title)`, it's one query.

More importantly: **queries on the write side are expensive and acquire locks.** Every time
a screen loads, you'd be replaying streams and contending with the write path. That's not
an optimisation problem, it's an architecture problem.

## Building a projection

Here's a complete, realistic projector. The domain is courses and student enrolments.

```java
@Entity
@Table(name = "course_statistics")
class CourseStatisticsRow {

    @Id
    private String courseId;

    @Column(nullable = false)
    private int enrolled;

    @Column(nullable = false)
    private int capacity;

    // ...
}
```

```java
@Component
class CourseStatisticsProjector {

    private final CourseStatisticsRepository repository;

    CourseStatisticsProjector(CourseStatisticsRepository repository) {
        this.repository = repository;
    }

    @EventHandler
    void on(CourseCreated event) {
        repository.save(new CourseStatisticsRow(
                event.courseId(), 0, event.capacity()));
    }

    @EventHandler
    void on(StudentEnrolled event) {
        repository.incrementEnrolled(event.courseId());
    }

    @EventHandler
    void on(EnrollmentDropped event) {
        repository.decrementEnrolled(event.courseId());
    }

    @ResetHandler
    void prepareForRebuild() {
        repository.truncate();
    }
}
```

And the query handler that serves it:

```java
@QueryHandler
List<CourseStatisticsRow> handle(CoursesWithSeatsRemaining query) {
    return repository.findWithSeatsRemainingLessThan(query.maxRemaining());
}
```

Three details in the projector worth noticing.

**It increments, it doesn't recompute.** A projector that loaded the whole stream and
counted would be correct but slow. A projector that increments a column is O(1) per event and
depends entirely on never missing an event. That dependency is why sequencing and the
dead-letter queue matter so much — see
[`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md).

**It has a `@ResetHandler` that truncates.** This is what makes a rebuild work. Without it,
a replay would add every enrolment to rows that already exist and double every count. The
truncate has to happen *before* the replay starts, and `@ResetHandler` is the hook for
exactly that.

**It has no logic beyond arithmetic.** No rules, no validation, no decisions. A projector
that rejects an event is a projector that will eventually block a stream.

## Eventual consistency, concretely

This is the cost, and it's worth being specific about it rather than hand-wavy.

```
t=0ms     User clicks "Enroll student"
t=5ms     Command handled, StudentEnrolled appended, HTTP 200 returned
t=6ms     User's browser refreshes the course page
t=7ms     Query returns: 46 enrolled        ← the user sees stale data
...
t=40ms    Projector processes the event
t=41ms    Query returns: 47 enrolled        ← now correct
```

Forty milliseconds is nothing. On a busy system, under load, or with a lagging processor, it
could be seconds. And during a replay it could be minutes.

The design response is not to make the read side synchronous — that's not possible without
giving up the architecture. It's:

1. **Don't require immediate consistency.** Design screens that tolerate it.
2. **Push instead of poll.** Query updates, as in
   [`06-queries.md`](06-queries.md), close the gap without hammering the read database.
3. **Return the authoritative result from the command when the user needs it.** A creational
   command handler returns the new identifier precisely so you don't have to query for it
   afterwards.
4. **Show pending state optimistically** where the UX allows it.

## Consistency boundaries and why a projection isn't one

A consistency boundary is the region of state that changes atomically. In an event-sourced
system, **one entity is one consistency boundary**.

A projection is not, and this distinction is the one to internalise. A projector takes an
event and updates a row. There's no set of rows that must change together, and no
transaction spanning them beyond the unit of work for that single event.

This has a concrete consequence: **a projection cannot enforce a business rule.** If your
rule is "an order and its invoice must both be created or neither", you cannot implement that
in a projector. It's a write-side rule, and it belongs in an entity.

If you catch yourself wanting a rule in a projector, that rule belongs on the write side.

## Local vs external projections

| | Local | External |
|---|---|---|
| Read by | your own query handlers | other services |
| Where | your database | your database, reached over a distributed bus |
| Transport | direct | `DistributedQueryBus` (Axoniq Framework) + Axon Server |
| Typical use | the application's own screens | powering a downstream service |

A codebase will have several of each, and it's often not obvious which a given projection is
meant to be. The tell is whether there's a distributed query bus registered — which is an
Axoniq Framework feature, so it also needs a licence — or a `@Namespace`-annotated handler set
suggesting a published API. The `@Namespace` annotation, formerly `@ProcessingGroup`, is how a
group of handlers is exposed as a coherent set.

## Projector rules of thumb

Things that hold across most well-built Axon codebases:

1. **A projector is disposable.** Delete the table, replay, and it's back. If deleting a
   table would lose data, it's not a projection.
2. **A projector contains no business rules.** Only arithmetic and writes.
3. **A projector must be idempotent or must be rebuilt correctly.** Replaying must produce
   the same table. That's what `@ResetHandler` plus truncate is for.
4. **A projector must be sequenced by entity id** unless there's a specific reason not to.
5. **A projector must tolerate events it doesn't recognise** — future events, and events from
   a partial replay where earlier events haven't been handled yet.
6. **A projector's table is not a source of truth.** Never write to it from application
   code. If you need a write, send a command.

Point 5 deserves elaboration, because it's the least intuitive. During a **partial** replay —
resetting to a point in the middle of history — your handler will be invoked with an event
whose predecessors it never saw. The docs are explicit: "event handlers may handle an event
in the middle of model construction" and should be made lenient, or tolerate missing data.
An incrementing projector handles this fine. A projector that assumes a `CourseCreated` was
already seen does not.

## When to rebuild a projection

Reasons to trigger a rebuild, roughly in order of how often they come up:

1. **You added a handler to an existing projector.** It has no idea about historical events.
2. **You changed how a projector computes something.** Your historical data is now wrong.
3. **You found a bug in a projector** and don't want to reason about which events were
   mis-processed.
4. **You changed an event's shape** and the stored data no longer converts cleanly.

If none of those apply, you don't need a rebuild. This matters because rebuilds are not free:
the read model is stale for the duration, latency spikes, and you need all instances of the
processor stopped. See [`09-data-loading-and-replay.md`](09-data-loading-and-replay.md).

## In the code

The whole read side, end to end:

```java
// 1. The projector: events → table
@Component
class CourseStatisticsProjector {
    @EventHandler void on(CourseCreated e)      { repository.insert(e); }
    @EventHandler void on(StudentEnrolled e)    { repository.increment(e); }
    @EventHandler void on(EnrollmentDropped e)  { repository.decrement(e); }
    @ResetHandler   void onRebuild()             { repository.truncate(); }
}

// 2. The query: table → answer
@QueryHandler
CourseStatisticsRow handle(CourseStatistics query) {
    return repository.findById(query.courseId())
                     .orElseThrow(() -> new QueryExecutionException("No such course"));
}

// 3. Register the projector with a named processor, so it can be reset and monitored
@Configuration
class ProcessingConfiguration extends ConfigurationEnhancer {

    @Override
    public void enhanceConfiguration(AxonConfiguration config) {
        config.messagingConfigurer(mc -> mc.eventProcessing(ep ->
            ep.pooledStreaming(Processors.pooledStreaming("course-statistics", c -> c
                .sequencingPolicy(PropertySequencingPolicy.builder()
                                      .propertyName("courseId")
                                      .build())
                .eventHandlingComponents(c -> c.declarative("courseStatistics",
                        cfg -> new CourseStatisticsProjector(repository)))))));
    }
}
```

> **Shape caveat.** The *nesting* is what the AF5 documentation describes: a
> `ConfigurationEnhancer` → `MessagingConfigurer#eventProcessing(…)` → `pooledStreaming(…)` →
> per-processor configurer. The exact spelling of the `pooledStreaming` helper and the exact
> package of `EventProcessingConfigurer` are not printed in the docs, so let your IDE confirm
> them. What matters conceptually is the three decisions visible here: **pooled**,
> **sequenced by `courseId`**, and **named**.

Three components, three different jobs, and they only meet at the table.

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `EventHandler` in a `@ProcessingGroup` named after the projection | same, with `@Namespace` instead of `@ProcessingGroup` |
| `TrackingEventProcessor` | `StreamingEventProcessor` |
| `ProcessEventStore` selecting the store for a processing group | the processor reads a `StreamableEventSource` directly |
| read side usually a separate JPA entity per projection | same |
| `AxonConfiguration.eventTracking(…)` | `MessagingConfigurer#eventProcessing(…)` with per-processor configurers |
| `DomainEventStream` hand-rolled replay for a projection | `resetTokens()` on the processor |
| rebuilding meant truncating by hand and resetting tokens | `@ResetHandler` + `resetTokens()` |

## See also

- [`09-data-loading-and-replay.md`](09-data-loading-and-replay.md) — the rebuild mechanics.
- [`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md) — the
  machinery that runs projectors.
- [`06-queries.md`](06-queries.md) — serving from the projection.
