# Script — 11: Axon Server

**Format:** conversational explainer, single presenter. Roughly 5–6 minutes.
**Audience:** a Java developer who has been handed a connection string to a service they
don't know, and needs to know what it does and why it exists.
**Source material:** upload `11-axon-server.md` alongside this script.

---

## Segment 1 — What it is (0:00–0:55)

[VISUAL: Your application box, and beside it a separate larger box labelled "AXON SERVER",
with an arrow between them.]

**NARRATOR:**

Axon Framework is a library you embed in your application. Axon Server is something else
entirely: a separate service you run next to it.

[VISUAL: The Axon Server box, opening to reveal three things inside.]

An event store. A command and query router. And a UI for looking at what's actually in your
streams.

[VISUAL: A list of five capabilities, appearing one by one.]

The capabilities worth knowing: a single ordered place where all events live. Multi-node
clustering, so the store survives a node dying. A router, so a command sent by one instance
can be handled by another. Consumer coordination, so ten instances of a processor share one
stream without stepping on each other. And a UI.

[VISUAL: The UI, zoomed in.]

That last one is more valuable than people expect. Being able to look at actual events answers
"did that event get published?" — a question logging answers unreliably, because a log line
tells you the code ran, not that the event landed.

---

## Segment 2 — Contexts (0:55–2:00)

[VISUAL: One large box splitting into three labelled compartments: TENANT-1, TENANT-2,
TENANT-3.]

**NARRATOR:**

The concept that matters most in a current Axon Server is the **context**.

[VISUAL: The three compartments, each with its own streams inside.]

A context is a named, isolated event store. Its own streams, its own data, its own
permissions. Since Axon Server 2024.0 a single deployment can hold several.

[VISUAL: A single-server-per-customer layout, then a one-server-many-customers layout.]

And the reason to want that is multi-tenancy. Instead of running one Axon Server per customer,
you run one and give each customer a context. That's the difference between an architecture
that scales operationally to a hundred customers and one that doesn't.

[VISUAL: A config snippet: `context: tenant-42`.]

An application picks its context by name, in the Spring properties. So `context` selects which
isolated event store your application reads and writes.

[VISUAL: A correction card: "server-connector.server-name is NOT real".]

And here's a correction worth making out loud, because you'll meet the wrong version repeated
everywhere: `axon.axonserver.server-connector.server-name` is **not** a real Axon Server
property. The property is `axon.axonserver.context`, and it has not been renamed. Outside
Spring, you set the same value via `defaultContext` on the connection manager's builder, or
`.context(...)` on the configuration builder.

---

## Segment 3 — Clusters (2:00–3:00)

[VISUAL: Three nodes forming a triangle, labelled CLUSTER-A. Events flowing in; each event
landing on two or three nodes.]

**NARRATOR:**

Several nodes sharing one context form a **cluster**, identified by a cluster name.

[VISUAL: "Replication factor: 2" — one event appearing on two nodes.]

Two properties matter. The **replication factor** — how many nodes hold a copy of each event.
And **consumers** — named reader positions that split the stream between nodes.

[VISUAL: Three application instances connecting to one cluster; a stream splitting three
ways.]

This is the mechanism that makes running several instances of your application safe. All of
them connect to the same context, register as consumers of the same streams, and each event
is handled exactly once across the fleet.

[VISUAL: A licensing note, deliberately vague: "editions differ — check current terms".]

One note I won't overstate: Axon Server comes in editions, and clustering, single sign-on, and
fine-grained permissions differ between them. Check the current terms for the edition you're
deploying — an old blog post is not a reliable source for that.

---

## Segment 4 — Which store is this codebase using? (3:00–4:10)

[VISUAL: A comparison table filling in.]

**NARRATOR:**

Here's the question I'd ask first about any Axon codebase: **does it use Axon Server, or a
database event store?**

[VISUAL: The table rows appearing.]

Both are supported, and lots of teams run one locally and the other in production, which is a
perfectly sensible arrangement. Axon Server gives you global ordering and clustering. A
database gives you SQL and no extra service to operate.

[VISUAL: A warning triangle: "drift".]

The danger is **drift** — a feature that works in development because the database is
forgiving, and fails in production because Axon Server is stricter about ordering.

[VISUAL: Three numbered differences.]

Three differences bite in practice.

One: **global ordering**. Axon Server gives every event a global position. A database event
store generally doesn't, so cross-aggregate ordering is only as good as the implementation.

[VISUAL: Two version counters colliding.]

Two: **optimistic concurrency**. With global positions, concurrent writes to *different*
aggregates can conflict in ways a simple per-aggregate version check would never surface.

[VISUAL: A unit-of-work box, with an EventAppender feeding into a "commit" boundary.]

Three, and this is the one that breaks on a migration: **transactions**. A database event store
can join your application's transaction boundary directly. Axon Server doesn't work that way —
events appended through an `EventAppender` are published when the processing context commits,
and that commit is what forms the boundary with the command being handled.

[VISUAL: A struck-through name: "TransactionAwareEventStore".]

There's no type by that name in any official version, incidentally. It's another one that
circulates without existing. If a codebase references it, trace the source.

---

## Segment 5 — The UI, and how to use it (4:10–5:00)

[VISUAL: The UI, navigating contexts → clusters → streams → events.]

**NARRATOR:**

Let me make the UI concrete, because "just look at it" solves a whole class of problem.

[VISUAL: Each use case appearing as a click.]

Navigate contexts, then clusters, then streams, then events. With that you can see which
events exist and in what order, with full payloads. You can see whether an event was published
at all. You can see consumer positions — how far each processor has got. And for multi-tenant
deployments you can confirm what's in each tenant's context.

[VISUAL: A port table: 8024 HTTP/UI, 8124 gRPC, 8224 internal.]

Default ports: `8024` for HTTP and the UI, **`8124`** for gRPC, `8224` internal. You can
confirm this from the server's own Dockerfile, which exposes exactly those three.

[VISUAL: A correction card: "gRPC is 8124, not 8084".]

And note: gRPC is **8124**, not 8084. If you meet 8084 in an article, it didn't come from the
official reference.

---

## Segment 6 — Testing, and the final note (5:00–5:40)

[VISUAL: A Testcontainers-based Axon Server, started per test.]

**NARRATOR:**

One testing note, because a couple of names here are wrong in common circulation. There is no
`AxonServerExtension` or `AxonServerTestExtension`, and no `Transactor`, in any official
version. What's actually documented is **`AxonServerContainer`** — a **Testcontainers**-based
Axon Server, in the `io.axoniq.framework.testcontainer` package. That's how you run Axon
Server in tests, and isolation comes from the container's scope rather than from a transactor.

[VISUAL: A final note: two independent version lines.]

And a structural point worth keeping: Axon Server and Axon Framework version
*independently*. Framework 5 works with current Axon Server releases, and Axon Server
releases aren't tied to framework major versions. So you can have a newer server than you
expected, and the supported combinations are documented in the platform reference.

[VISUAL: Final card: "context = which store. cluster = which nodes. replication = how many copies."]

Three questions: which store, which nodes, how many copies.

---

## Key terms for the glossary

- **Axon Server** — a standalone service providing an event store, command/query routing,
  and a management UI. A separate product from Axon Framework, with its own version line.
- **Axon Framework** — the library embedded in your application.
- **Context** — a named, isolated event store within Axon Server. Own streams, own data, own
  cluster. The unit of data separation, and the basis of multi-tenancy. Available since
  Axon Server 2024.0.
- **`axon.axonserver.context`** — the Spring property selecting which context an application
  connects to. Unchanged name; the current documentation uses it.
- **`server-connector.server-name`** — **not a real property.** A common error in blog posts.
- **Cluster** — several Axon Server nodes sharing one context, identified by a `clusterName`.
- **Replication factor** — how many nodes hold a copy of each event.
- **Consumer** — a named reader position within a cluster, used to split processing load
  across nodes.
- **Global ordering** — Axon Server assigns every event a global position independent of its
  stream. A database event store generally does not.
- **`ProcessingContext`** — the unit of work. Events appended through an `EventAppender` are
  published when it commits, forming one boundary with the command being handled.
- **`EventAppender`** — how a handler appends events inside the current unit of work.
- **`JpaTransactionalExecutorProvider`** — bridges a `ProcessingContext` commit to a real JPA
  transaction.
- **`TransactionAwareEventStore`** — **not a real type** in any official version. A commonly
  circulated error.
- **`AxonServerConfiguration`** — connection settings, including the context name. In AF4 it
  was in `org.axonframework.axonserver.connector`.
- **`AxonServerConnectionManager`** — manages the connection; carries `defaultContext`.
- **`AxonServerConnector`** — **not a real type.** The name comes from the Maven artifact
  `axon-server-connector`.
- **`AxonServerContainer`** — Testcontainers-based Axon Server, in
  `io.axoniq.framework.testcontainer`. The documented way to run Axon Server in tests.
- **`AxonFrameworkExtension` / `@ProvidedAxonTestFixture`** — AF5's JUnit 5 approach to
  supplying a test fixture. AF4 used `StubAggregateLifecycleExtension`.
- **`Transactor` / `AxonServerExtension`** — **not real types.** Commonly cited, absent from
  the documentation.
- **Ports** — `8024` HTTP/UI, `8124` gRPC, `8224` internal. Confirmed by the server's own
  `Dockerfile`.
- **Drift** — a behaviour that works against one event store and fails against the other,
  typically around ordering or transaction boundaries.

## Guardrails — do not say

- Do **not** describe Axon Server as part of Axon Framework. It's a separate product with its
  own version line.
- Do **not** say Axon Server is required. A database event store is fully supported, and is
  common in local development and small deployments.
- Do **not** present contexts as a naming convention. They are data isolation, and two
  applications pointed at different contexts cannot see each other's events.
- Do **not** name `axon.axonserver.server-connector.server-name` as a real property. It is not.
  The property is `axon.axonserver.context`.
- Do **not** name `AxonServerConnector` or `TransactionAwareEventStore` as real types. Neither
  exists in the official documentation.
- Do **not** name `AxonServerExtension` or `Transactor` as real test types. There is no such
  extension; use `AxonServerContainer`.
- Do **not** state a specific licensing or edition matrix. Editions and terms change; point at
  the current documentation.
- Do **not** suggest switching between Axon Server and a database event store is a
  configuration detail. The three differences — global ordering, concurrency conflicts, and
  transaction boundaries — are the ones that actually break.
- Do **not** describe the UI as a debugging convenience. It's the primary tool for answering
  whether an event was published, which logs cannot.
- Do **not** state the gRPC port as 8084. It is **8124**. The UI is 8024; the internal port is
  8224.
