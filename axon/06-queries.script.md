# Script — 06: Queries

**Format:** conversational explainer, single presenter. Roughly 4–5 minutes.
**Audience:** a Java developer who wants to serve a screen that stays current without
polling, and needs to know why a `List` isn't enough.
**Source material:** upload `06-queries.md` alongside this script.

---

## Segment 1 — The simple one (0:00–0:50)

[VISUAL: A magnifying glass over a table. Label: "READ, DON'T WRITE".]

**NARRATOR:**

Queries are the simplest of Axon's three message types, so this one's short. A query asks a
question. It has no side effects. That's the rule, and it's enforced by convention rather
than by the type system — the framework *will* let you inject an event appender into a query
handler, and the documentation says that's generally discouraged. But if your query handler
changes something, you didn't write a query.

[VISUAL: Two rules, appearing as a list.]

Two things to hold onto. One: a query has no side effects, so it's safe to call from
anywhere, at any time, and it never takes a lock. That's why the read side is cheap. Two:
exactly one handler per query. Two handlers for the same query name is a startup error, not
a pick-one situation.

[VISUAL: A cross through "broadcast to many subscribers".]

And notice what's *not* there: no fan-out. Some query frameworks let you send one query to
several services and merge the answers. Axon Framework 5 removed that — it's called
scatter-gather, and it's gone. If you need it, issue separate queries, or aggregate in one
handler.

---

## Segment 2 — Declaring and handling (0:50–1:50)

[VISUAL: A query record, then a matching handler method, connected by a line.]

**NARRATOR:**

A query is a record, and a handler is a method. By default Axon matches them by the fully
qualified class name of the query — so you write a query class, you write a handler method
that takes it, and it just works.

[VISUAL: A hand-written handler.]

The handler returns the result. It can return a plain value, a `CompletableFuture`, or a
`Publisher`, so a slow query doesn't have to block a thread.

[VISUAL: A version comparison: "ResponseTypes.instanceOf(X.class) → query(q, X.class)".]

While you're reading older code: Axon Framework 4 required you to wrap the expected result
type in something called `ResponseTypes`. If you see that in the code, you're on version 4.
In 5 you just pass the class.

---

## Segment 3 — The problem with snapshots (1:50–3:00)

[VISUAL: A screen showing "3 seats left". A clock icon. The screen does not change even
though events are flowing. Then a thought bubble: "the data is stale on arrival."]

**NARRATOR:**

Now, here's the problem. A query gives you a **snapshot at one moment**. You ask, you get an
answer, and that answer starts ageing immediately.

[VISUAL: A polling animation: the screen refreshes every two seconds, with a red
"load on your database" meter beside it.]

The naive fix is polling. And notice what polling actually costs: you've just built a
read-side query path that hammers your read database on a timer, for every open screen,
forever. In a system with many users that's a self-inflicted load problem, and it grows with
your user count.

[VISUAL: A "query update" bridge appears, spanning from a projector to the screen. No
polling. A green "load: proportional to change" meter.]

Axon Framework 5 has a better answer, and it's called a **subscription query**. The idea: the
projector is *already* being told about changes, because that's its job. So let it tell your
screen too.

[VISUAL: The emitter, with its three arguments labelled: query, filter, supplier.]

The server side is a `QueryUpdateEmitter`, and it takes three arguments: the query class, a
**filter**, and a **supplier**. The middle one is the interesting one.

[VISUAL: A close-up on the filter, with the arrow traced to "which subscribers does this
apply to".]

The filter is a predicate. It decides which *subscribers* an update goes to. That's how a
subscriber says "I only care about this one course" — and the filtering happens on the server,
once, rather than in every client.

[VISUAL: The same emitter serving two roles: initial result, and live updates.]

And the same emitter does both jobs. Registering it against a query supplies the *initial*
result to a new subscriber. Emitting an update pushes *incremental* results to everyone whose
filter matches.

[VISUAL: A version table, then the "gotcha" stamp.]

Two version notes here, because this pattern changed. In version 4 the emitter was *injected
as a field*. In version 5 it is a *handler parameter* — you cannot field-inject it. And there
is no `@QueryUpdateHandler` annotation in version 5 at all. Updates come from ordinary event
handlers that take the emitter as a parameter. If you see that annotation in an Axon 5
codebase, be suspicious: it isn't a real thing.

[VISUAL: The full round trip: a REST controller returning a stream of updates.]

Put together, a REST endpoint that returns a stream stays current without polling. The
client subscribes, gets the initial value, and then gets pushed updates as the projector
processes events.

[VISUAL: A warning, delivered calmly: "the updates come from event handlers — so they're
eventually consistent."]

And the honest caveat, because it's inherent to the architecture: those updates come from
*event handlers*, which means they're eventually consistent. A course you just created won't
appear in your subscription until the projector has caught up. Slightly stale, and
completely consistent. That's the trade you get for not polling.

---

## Segment 4 — Local vs external projections (3:00–4:00)

[VISUAL: Two diagrams. Left: a database inside a single application box, queried directly.
Right: the same database with arrows arriving from three other services across a network.]

**NARRATOR:**

One piece of vocabulary that determines how you configure queries: **where does the data
live?**

A **local projection** lives in your own database. Your own query handlers read it. There's
no network involved. This is the normal case, and it's auto-configured — you usually don't
write any code for it.

[VISUAL: A second bus appears, bridging services. Label: "DistributedQueryBus".]

An **external projection** is read by *other* services, not just yours. That needs a
**distributed query bus**, and it's an Axoniq Framework feature, so it needs a licence and a
running Axon Server.

The question to ask when you see query configuration in a codebase: is this reading our
table, or are we publishing our table for other people to read? Different answer either way.

---

## Segment 5 — Version map (4:00–4:30)

[VISUAL: A compact version table.]

**NARRATOR:**

The version map in one slide. `ResponseTypes.instanceOf` became a plain class argument.
`multipleInstancesOf` became `queryMany`. Scatter-gather was removed. The query package moved
from `org.axonframework.queryhandling` to `org.axonframework.messaging.queryhandling`.

[VISUAL: A correction card: "SimpleQueryBus is NOT a v5 rename".]

And one correction that trips people up: `SimpleQueryBus` is *not* a version 5 rename. Version
4.13 already documented it. And `DirectQueryBus`, which you'll find in blog posts, isn't in
any official version of the documentation at all.

---

## Key terms for the glossary

- **Query** — a request for information. No side effects, no locks, safe to call from
  anywhere.
- **@QueryHandler** — answers a query, supplying the initial result.
- **QueryUpdateEmitter** — `org.axonframework.messaging.queryhandling`. In AF5 it is a *handler
  parameter*, not an injected field. Both serves initial results and emits incremental ones.
- **emit(query, filter, supplier)** — the three-argument call. The filter is a predicate
  deciding which subscribers the update applies to.
- **Subscription query** — a long-lived stream of results: an initial result followed by live
  updates. Replaces polling.
- **QueryGateway** — the client-side entry point for dispatching queries.
- **QueryBus** — the low-level component behind the gateway.
- **SimpleQueryBus** — the local, in-process query bus. Existed in AF4.13 as well; not a v5
  rename.
- **DirectQueryBus** — a name that appears in blog posts but in *no* official version of the
  Axon documentation.
- **Local projection** — a read model in your own database, read by your own handlers. No
  network. The normal case.
- **External projection** — a read model published for other services to query. Needs
  `DistributedQueryBus` (Axoniq Framework) and Axon Server.
- **Scatter-gather** — fanning one query out to several handlers and merging results.
  **Removed** in Axon Framework 5; the reference states it does not support it.
- **DuplicateQueryHandlerSubscriptionException** — two handlers for the same query name.
  Thrown at startup.
- **ResponseTypes** — AF4 only. Wrapping a result type. Gone in AF5.

## Guardrails — do not say

- Do **not** describe subscription query updates as real-time. They arrive via event
  handlers, so they are eventually consistent. A just-created entity will not appear
  immediately.
- Do **not** describe subscription queries as replacing push notification or a websocket in
  general. They replace *polling*.
- Do **not** claim queries can fan out to multiple handlers. Scatter-gather was removed in
  Axon Framework 5. One query, one handler.
- Do **not** say a query handler may freely append events. It may be *given* the appender,
  and the docs call that generally discouraged. Don't imply it's a supported pattern.
- Do **not** suggest a distributed query bus is needed for an ordinary application. It is not;
  a `SimpleQueryBus` is the default and covers almost every case.
- Do **not** quote `ResponseTypes` as current API. It is Axon Framework 4 and is replaced by a
  plain class argument.
- Do **not** mention `@QueryUpdateHandler`. No such annotation exists in Axon Framework 5.
  Updates come from event handlers taking a `QueryUpdateEmitter` parameter.
- Do **not** present `SimpleQueryBus` as an Axon 5 rename, or `DirectQueryBus` as a real type.
  Both are common misconceptions.
- Do **not** say the filter is a list of updates. It is a *predicate* that decides which
  subscribers each update applies to.
