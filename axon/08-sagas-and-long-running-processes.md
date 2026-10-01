# 08 — Sagas and long-running processes

This is the page where Axon's versioning story bites hardest, because the answer is not "renamed
to X". The answer is: **the feature was removed, and there is no drop-in replacement in the
core framework.**

## Terms you'll meet

| Term | Meaning |
|---|---|
| Saga | A multi-step business transaction kept consistent by compensating events |
| `@Saga` | AF4 annotation on a *prototype* field of an event-sourced entity. **Not in AF5** |
| `@StartSaga` / `@EndSaga` | AF4 lifecycle annotations. **Not in AF5** |
| `SagaStore` / `SagaRepository` | AF4 storage for saga instances. **Not in AF5** |
| `EventStreamableSagaStore` | **Does not exist in any official version.** Common invention |
| Deadline manager | AF4 time-based scheduling. **Not in AF5** |
| `@Schedule` / `ScheduleToken` | AF4 time-based scheduling. **Not in AF5** |
| `EventScheduler` | AF4 scheduler interface. **Not in AF5** |
| `axon-legacy` | An AF5 module that restores the AF4 saga APIs. Migration aid only |
| `@Workflow` | Axoniq Framework (commercial, preview) long-running process support |
| Deadline projection | The documented community replacement for the deadline manager |

## The idea

Some business processes span more than one aggregate, and can't be a transaction because they
span more than one consistency boundary. Ordering an item involves checking stock, taking
payment, and requesting shipping — three aggregates, possibly three services.

A **saga** handles this by keeping the process *eventually* consistent through
**compensating actions**. You can't roll back across services, but you can publish "cancel the
order" after "the order was created". The compensation is itself an event, itself auditable,
itself replayable.

The name comes from the database concept: each step has a compensating step that undoes it, and
you can't have a real transaction, only a chain of compensations.

## What Axon Framework 5 actually did

This is the part people get wrong, so here it is stated plainly and sourced.

> "Axon Framework 5 has no `Saga` construct. Replace it with existing core framework building
> blocks. The familiar `@Saga` stereotype and related APIs **will not be ported to the Axon
> Framework 5 core**."
> — <https://docs.axoniq.io/axon-framework-reference/5.3/migration/paths/sagas/>

Read that carefully. **Removed from core, not relocated.** The earlier belief — that sagas moved
into "Axon Framework" or "Axon Platform" — is not what the documentation says.

Gone from the AF5 core: `@Saga`, `@SagaEventHandler`, `@StartSaga`, `@EndSaga`,
`SagaLifecycle`, `SagaStore`, `SagaRepository`. And there is no
`EventStreamableSagaStore` in *any* official version of the documentation — if a codebase
references it, trace where the idea came from before trusting it.

`SagaStore` and `SagaRepository` map, per the migration guide, onto "your regular event store,
a repository of your own, an event-sourced entity, or nothing". That list is the whole
migration guidance: there is no saga-specific storage any more, so you choose.

## The AF4 mechanism, for reading old code

You will still meet this in AF4 codebases, and in documentation of uncertain vintage.

```java
@EventSourced
class OrderProcessManager {

    @Saga
    private String pmId;                       // the prototype

    private final CommandGateway commandGateway;

    @Constructor
    OrderProcessManager(String pmId, CommandGateway commandGateway) { ... }

    @EventHandler
    void on(OrderCreated event) {
        commandGateway.send(new ReserveStock(event.orderId()), "reserve-" + event.orderId());
    }

    @EndSaga
    void on(StockReserved event) {
        commandGateway.send(new TakePayment(event.orderId()), "pay-" + event.orderId());
    }
}
```

The mechanics, because they explain the design:

- **`@Saga` marks a prototype field.** The framework creates a new instance of the class per
  distinct value of that field — effectively one instance per order.
- **The correlation key is a second command parameter.** `commandGateway.send(command, "key")`
  carries a correlation key, and the framework uses it to route *incoming events* to the right
  instance. That's why the `@EndSaga` method above takes no correlation key — it's determined
  by the instance.
- **`@EndSaga` disposes of the instance** when the process finishes.
- **A `SagaStore` holds the instances**, usually as an event-sourced repository, so process
  state is restartable and inspectable.

## What to use in Axon Framework 5

The migration guide's answer is to use "existing core framework building blocks". The
documented patterns, all of them plain components:

| Approach | Shape |
|---|---|
| State in a repository | Your own repository holds the process state; handlers are ordinary beans |
| State derived from context events | Build what you need from the events in a `ProcessingContext` |
| State from process events | An event-sourced entity modelling the process, without saga machinery |
| Vertical slices | Split the process so each step lives in the aggregate that owns it |

The common thread: **there is no framework construct left.** Correlation, which is the thing
sagas actually solved, becomes something you design.

And where correlation *is* solved for you, it's commercial:

> **`@Workflow`** is the Axoniq Framework (commercial, preview) answer to long-running
> processes. Note that "preview" is doing real work in that sentence — it is not something to
> build a production migration on without talking to Axoniq.

## The `axon-legacy` module

AF5 does restore the AF4 APIs, via a module called **`axon-legacy`**, targeted at 5.4.0. Its
own documentation is careful about its status, and the caveats matter:

- It is **"a migration aid, not a supported way to write new processes."**
- It **"does not start new saga instances"** — `@StartSaga` is deprecated even there.
- Until it lands, there is **"no supported way to upgrade an application with sagas in
  flight"**.

So a codebase using `@Saga` on Axon Framework 5 is either on `axon-legacy` for the transition
period, or using a version of the guide that predates this. Either way, treat it as technical
debt with a deadline on it.

## Timeouts: also removed

Time-based steps are a common requirement: "if payment isn't confirmed in 30 minutes, cancel
the order".

In AF4 this was `@Schedule`, backed by the **deadline manager** (`DeadlineManager`, with
`SimpleDeadlineManager`, `QuartzDeadlineManager`, `SpringDeadlineManager`). AF4 also had an
`EventScheduler` interface and a `ScheduleToken`.

The official AF5 statement:

> "Axon Framework 5 has no built-in deadline scheduling. Use other capabilities to get the same
> effect." / "The same applies to the `DeadlineManager` and related APIs."
> — <https://docs.axoniq.io/axon-framework-reference/5.3/migration/paths/sagas/>

Gone in AF5: `@Schedule`, `DeadlineManager`, `@DeadlineHandler`, `EventScheduler`,
`ScheduleToken`.

**There is no Axon replacement.** This is the single most commonly mis-stated fact in
Axon-adjacent blog posts, which routinely claim "scheduled events replaced `@Schedule`". They
did not. The two documented replacements are:

1. **Axoniq Framework Workflows** — `sleep(…)` and explicit timeouts. Commercial, preview
   status, licence required.
2. **A deadline projection** — a projection of outstanding work, built purely from events,
   plus a periodic sweep that sends a command whose handler is idempotent. The documentation
   describes this as replacing "a deadline manager with a deadline projection". It is a
   pattern, not a type.

> **A documentation trap worth knowing about.** The deadlines *guide* served under the 5.3
> path at `https://docs.axoniq.io/deadlines-guide/5.3/` is, at the time of writing, stale AF4
> content — byte-identical prose to the 4.13 version, still instructing you to use a
> `DeadlineManager`. Do not read it as a 5.3 statement.
>
> Related: the `@Scheduled` annotation you'll see in that guide is **Spring's**
> `org.springframework.scheduling.annotation.Scheduled`, not an Axon annotation.

## Why sagas needed machinery in the first place

Worth restating, because it explains why the removal was possible at all.

Without correlation you get combinatorial noise. A `PaymentFailed` event carries no indication
of *which* order it belongs to, so a single handler can't tell whether to cancel order 1 or
order 2. Sagas exist to carry identity through the flow.

Since AF5 gives you no construct for that, **carrying identity is now an explicit design
decision you have to make**. Which is why the four approaches in the table above are all
"build it yourself, here's where the state can live".

The trade is that this identity-carrying machinery is genuinely complex, and the AF5 redesign
reflects a view that most applications don't need it. If a codebase has three process managers
and forty event handlers, that's a healthy ratio. If it has thirty, the architecture deserves a
second look — and in AF5 it is thirty of *hand-rolled* process managers.

## Reading a codebase

Signals for **Axon Framework 4**:

- `@Saga` on a field
- `@StartSaga`, `@EndSaga`, `SagaLifecycle`
- A `SagaStore` or `SagaRepository` bean
- `@Schedule`, `DeadlineManager`, `@DeadlineHandler`, `EventScheduler`
- A class with `@EventSourced` and a prototype field whose only job is sending commands

Signals for **Axon Framework 5**:

- `@Workflow` (commercial Axoniq Framework) — or nothing at all
- Handlers that are plain beans, with process state in a repository of your own
- No saga annotations anywhere
- Deadlines handled by a projection plus a periodic sweep

Signals for **mid-migration**: `axon-legacy` on the classpath, with `@Saga` still in the code
and `@StartSaga` deprecated. The import lines and `pom.xml` settle it quickly.

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `@Saga` prototype field | not ported to core; `axon-legacy` in 5.4.0 |
| `@StartSaga`, `@EndSaga` | not ported; `@StartSaga` deprecated even in `axon-legacy` |
| `SagaStore`, `SagaRepository` | your event store, your repository, an event-sourced entity, or nothing |
| `EventStreamableSagaStore` | does not exist in any official version |
| `@Schedule`, `ScheduleToken` | no replacement |
| `DeadlineManager`, `@DeadlineHandler` | no replacement; use a deadline projection |
| `EventScheduler` | not ported |
| `ProcessManager` class | no framework equivalent; `@Workflow` is commercial |
| Correlation key as the second `send` argument | you design it |
| Compensation as a compensating event | you design it |
| `QuartzDeadlineManager` | not ported |

## See also

- [`03-entities-and-aggregates.md`](03-entities-and-aggregates.md) — why a saga is needed at
  all: one entity is one consistency boundary.
- [`02-commands.md`](02-commands.md) — the commands a process manager dispatches.
- [`10-configuration.md`](10-configuration.md) — licensing, which decides whether
  `@Workflow` is available to you.
