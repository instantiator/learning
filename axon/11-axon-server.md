# 11 — Axon Server

Axon Framework is a library you embed in your application. **Axon Server** is a separate
service you run alongside it: an event store, a command/query router, and a UI for looking at
what's actually in your streams.

## Terms you'll meet

| Term | Meaning |
|---|---|
| Axon Server | Standalone event store + message routing, with a management UI |
| Context | A named, isolated event store within Axon Server |
| Cluster | Several Axon Server nodes sharing one context |
| `clusterName` | The name a set of nodes share to form a cluster |
| Consumer | A named reader position within a cluster, for distributing load |
| `AxonServerConfiguration` | Client-side connection settings. Carries the context name |
| `AxonServerConnectionManager` | Manages the connection. Carries `defaultContext` |
| `AxonServerEventStorageEngine` | Axon Server-backed event storage engine |
| `AxonServerContainer` | Testcontainers-based Axon Server, for tests |
| `ProcessingContext` | The unit of work. Events append on commit |

## The idea

Axon Server exists because the interesting part of an event-sourced system isn't the code in
your aggregates — it's having a single, ordered, inspectable place where all events live and
where multiple application instances can coordinate.

It gives you:

- **An event store** with global ordering, so an event has a position independent of which
  stream it's in.
- **Multi-node clustering** with replication, so the store survives a node failing.
- **A command and query router**, so a command sent by one instance can be handled by another.
- **Consumer coordination**, so N instances of a streaming processor share one stream without
  stepping on each other.
- **A UI**, for looking at what is actually in your streams.

That last one is more valuable than people expect. Being able to look at the actual events is
how you answer "did that event get published?" without adding logging.

## Contexts

Since Axon Server 2024.0, a single Axon Server can hold **multiple contexts**. A context is a
named, isolated event store: its own streams, its own data, its own cluster.

The point of contexts is **multi-tenancy** — one Axon Server deployment serving several
customers, each with isolated data, instead of one deployment per customer.

An application selects its context by name. The Axon Server multi-context documentation puts
it like this:

> "Axon Framework applications can connect to it by setting the `axon.axonserver.context`
> property when using Spring Boot, or setting the `defaultContext` on the builder of
> `AxonServerConnectionManager`."
> — <https://docs.axoniq.io/axon-server-reference/v2026.1/axon-server/administration/multi-context/>

```yaml
axon:
  axonserver:
    enabled: true
    context: tenant-42
```

Outside Spring:

```java
AxonServerConfiguration config = AxonServerConfiguration.builder()
        .context("tenant-42")
        .build();
```

> **A correction worth making explicitly**, because you will find the wrong version repeated:
> `axon.axonserver.server-connector.server-name` is **not** a real Axon Server property. It
> appears in circulating blog posts. The property is `axon.axonserver.context`, and it has not
> been renamed.
>
> Also note that these types live in `io.axoniq.framework.axonserver.connector.api` — so
> importing them is a *licensing* signal, not a version signal. See
> [`10-configuration.md`](10-configuration.md).

## Clusters

Several Axon Server nodes sharing one context form a **cluster**, identified by a
`clusterName`. Within it:

- Each event is written to *N* nodes, where *N* is the **replication factor**.
- **Consumers** split the stream between nodes, so processing load scales horizontally.
- Nodes can be added or removed, and the cluster rebalances.

This is the mechanism that makes running three instances of your application safe. All three
connect to the same context, register as consumers of the same streams, and each event is
handled exactly once across the fleet.

> **Licensing note:** Axon Server is available in editions with different capabilities —
> clustering, single sign-on, and fine-grained permissions vary. Check the current terms for
> the edition you're deploying rather than trusting an old blog post. This document doesn't
> assert a specific edition matrix.

## The connection

There is **no type called `AxonServerConnector`** in Axon Framework 5. That name comes from the
Maven artifact `axon-server-connector`, which is registered by a
`ServerConnectorConfigurationEnhancer`. The actual types are:

| Type | Role |
|---|---|
| `AxonServerConfiguration` | Connection settings, including the context name |
| `AxonServerConnectionManager` | Manages the connection; carries `defaultContext` |
| `AxonServerEventStorageEngine` | Event storage backed by Axon Server |
| `AggregateBasedAxonServerEventStorageEngine` | Aggregate-oriented storage engine |
| `PersistentStreamEventSourceFactory` | Builds stream sources over persistent streams |

> **Version marker:** in Axon Framework 4, `AxonServerConfiguration` lived in
> `org.axonframework.axonserver.connector`. In Axon Framework 5 it is in
> `io.axoniq.framework.axonserver.connector.api`.

## Transactions

There is **no `TransactionAwareEventStore`** in either version — a name that circulates without
appearing in the official documentation.

Axon Framework 5 gets transactionality from the unit of work instead. The rule is that events
appended through an `EventAppender` are published when the `ProcessingContext` commits, and
that commit forms "part of the same transactional boundary as the command being handled".

So the model is: a command handler receives a `ProcessingContext` (directly, or wrapped as an
`EventAppender`), appends events, and the context's commit publishes them atomically. For JPA
specifically, `org.axonframework.messaging.core.unitofwork.transaction.jpa.JpaTransactionalExecutorProvider`
is the piece that bridges to a real database transaction.

This is worth understanding properly, because it's the thing that breaks when a codebase
switches event stores — see the comparison below.

## Axon Server or a database event store?

Both are supported, and which one a codebase uses is one of the most important facts about it.

| | Axon Server | JPA event store |
|---|---|---|
| Storage | Purpose-built | Relational database |
| Global ordering | Native | Not across aggregates |
| Clustering | Built in | Application-level |
| Inspecting data | UI | SQL |
| Local dev | Harder to inspect | Easy |
| Transaction boundary | `ProcessingContext` / `EventAppender` commit | Joins `@Transactional` directly |
| Operational burden | Another service | None extra |

Developers routinely run one locally and the other in production, and that's a perfectly
sensible arrangement. The danger is *drift* — a feature that works in development because the
database is forgiving and fails in production because Axon Server is stricter about ordering.

Three things that differ in ways which matter:

1. **Global ordering.** Axon Server assigns every event a global position. A database event
   store generally does not, so cross-aggregate ordering is only as good as your
   implementation.
2. **Optimistic concurrency conflicts.** With global positions, concurrent writes to
   *different* aggregates can still conflict in ways a per-aggregate version check wouldn't
   catch.
3. **Transaction boundaries.** A database event store can join your application's
   `@Transactional` boundary directly. Axon Server publishes on `ProcessingContext` commit, so
   the two compose differently — and code that assumed the database's behaviour is the code
   that breaks on a switch.

## What the UI is for

Worth naming explicitly, because "just look at the UI" solves a whole class of problem:

- **Which events exist** in a given stream, in order, with full payloads.
- **Whether an event was published at all** — the question that logging fails to answer
  reliably.
- **Consumer positions**, i.e. how far each processor has got.
- **Context contents**, for multi-tenant deployments.

Default ports, per the Axon Server configuration reference:

| Port | Purpose | Property |
|---|---|---|
| **8024** | HTTP / management UI | `server.port` |
| **8124** | gRPC (the protocol clients use) | `axoniq.axonserver.port` |
| **8224** | Internal | `axoniq.axonserver.internal-port` |

> **A correction worth making explicitly:** the gRPC port is **8124**, not 8084. The
> server's own `Dockerfile` exposes exactly `8024/tcp 8124/tcp 8224/tcp`. If you see 8084
> anywhere, it came from somewhere other than the official reference.

## Testing against Axon Server

There is no `AxonServerExtension` or `AxonServerTestExtension` in any official version. What
exists:

- **`AxonServerContainer` / `AxonServerContainerUtils`** in `io.axoniq.framework.testcontainer`
  (was `org.axonframework.test.server` in 5.0; moved in Axoniq Framework 5.1). This is a
  **Testcontainers**-based approach, which is the documented way to run Axon Server in tests.
- **`AxonFrameworkExtension`** with `@ProvidedAxonTestFixture` and `AxonTestFixtureProvider`
  for supplying a fixture into a JUnit 5 test.
- In Axon Framework 4, **`StubAggregateLifecycleExtension`**.

There is no documented `Transactor` for clearing Axon Server state between tests. In practice
isolation comes from the container being per-test or per-run.

## Version notes

| Older | Current |
|---|---|
| One context per Axon Server instance | Multiple named contexts (Axon Server 2024.0+) |
| `axon.axonserver.context` | `axon.axonserver.context` — **unchanged** |
| `AxonServerConfiguration` in `org.axonframework.axonserver.connector` | `io.axoniq.framework.axonserver.connector.api` |
| `AxonServerConnector` | not a real type; the artifact is `axon-server-connector` |
| `TransactionAwareEventStore` | not a real type; `EventAppender` + `ProcessingContext` commit |
| gRPC on 8084 | gRPC on **8124**; internal 8224 |
| `AxonServerExtension` | `AxonServerContainer` (Testcontainers) |
| `StubAggregateLifecycleExtension` | `AxonFrameworkExtension` + `@ProvidedAxonTestFixture` |

Axon Server and Axon Framework version independently. Axon Framework 5 works with current
Axon Server releases, and Axon Server releases are not tied to framework major versions.

## See also

- [`10-configuration.md`](10-configuration.md) — the properties and the `io.axoniq`
  licensing boundary.
- [`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md) — consumers and
  how they coordinate.
- [`12-testing-and-observability.md`](12-testing-and-observability.md) — the test fixture.
