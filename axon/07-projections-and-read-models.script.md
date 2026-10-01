# Script — 07: Projections and read models

**Format:** conversational explainer, single presenter. Roughly 6–7 minutes.
**Audience:** a Java developer joining a codebase with `@EventHandler` methods that write to
tables, who needs to know what's allowed in that code.
**Source material:** upload `07-projections-and-read-models.md` alongside this script.

---

## Segment 1 — Two sides, two jobs (0:00–0:55)

[VISUAL: The application split into two halves. Left: a heavy, cautious machine with a padlock
reading "WRITE SIDE". Right: a fast, open machine reading "READ SIDE".]

**NARRATOR:**

Axon gives you two different representations of the same data, because they optimise for
incompatible things.

[VISUAL: Close-up on the left side: rules being checked, events being appended, a lock
turning.]

The **write side** optimises for correctness. It loads the entity, checks every rule,
appends events, stores them atomically. Slow, and it should be.

[VISUAL: Close-up on the right side: a single indexed lookup, no lock, no rules.]

The **read side** optimises for speed of retrieval. One indexed lookup, no rules, no locks.

You can't build both from the same code. The write side's representation is full of structure
a reader doesn't care about. The read side throws away everything the reader doesn't need.
That's the whole argument for CQRS.

[VISUAL: Word on screen: PROJECTION — "the read side's representation". Then: PROJECTOR —
"the code that maintains it".]

Two words to get straight, because both docs use them: a **projection** is the data, and a
**projector** is the handler that maintains it. The reference manual says "projection"; the
getting-started guides say "read model". Same thing.

---

## Segment 2 — Why a separate table (0:55–2:05)

[VISUAL: A question at the top of the screen: "courses with fewer than 5 seats, sorted by
title".]

**NARRATOR:**

Here's a question a course admin screen would ask: list all courses with fewer than five
seats remaining, ordered by title.

[VISUAL: Left path — a long winding road through many event streams. Right path — a single
straight arrow into a table with a highlighted index.]

Two ways to answer it. Against the write side: load every course stream, replay every event,
count enrolments, filter, sort. Against a table with an index on seats-remaining and title:
one query.

But the real point is the second one. **Queries on the write side are expensive and they take
locks.** Every screen load would be replaying streams and contending with the write path. And
that's not a tuning problem — it's structural. You can't optimise your way out of it.

---

## Segment 3 — A projector, line by line (2:05–3:30)

[VISUAL: The projector code, revealed line by line.]

**NARRATOR:**

Here's a complete projector. Three handlers, a truncate, and a query handler to serve it.

[VISUAL: Highlight `repository.incrementEnrolled(...)`.]

Three things worth pointing out.

First: it **increments**. It doesn't load the stream and count. Incrementing a column is
constant time per event, and it's only correct if the projector *never misses an event*. That
whole dependency is why sequencing policies and the dead-letter queue matter as much as they
do.

[VISUAL: Highlight the `@ResetHandler`. Then a replay animation that would otherwise double
every count.]

Second: there's a `@ResetHandler` that truncates. Without it, a replay adds every historical
enrolment to rows that already have counts, and everything doubles. The truncate has to happen
*before* the replay starts, and `@ResetHandler` is the hook for exactly that.

[VISUAL: Highlight the third handler, with a "no rules here" stamp.]

Third: **there is no logic beyond arithmetic.** No validation, no decisions, no rules. A
projector that can reject an event is a projector that will eventually block a stream.

---

## Segment 4 — The cost, honestly (3:30–4:40)

[VISUAL: A timeline. Click, handled, 200 OK, refresh — and the number is one behind. Then, a
few hundred milliseconds later, the projector catches up and the number corrects itself.]

**NARRATOR:**

Now the cost, concretely rather than vaguely.

[VISUAL: The timeline, with each step labelled.]

User clicks enrol. Five milliseconds later the command is handled, the event is appended, and
the user gets their 200 OK. One millisecond later they refresh the page — and the number
they see is one enrolment short. Their enrolment *worked*. The screen just doesn't know yet.

[VISUAL: The projector catching up, correcting the display.]

Thirty-odd milliseconds later, the projector processes the event and the number is right.

[VISUAL: The timeline stretched enormously. Then compressed. Label: "under load, or during a
replay, this gap can be minutes."]

On a quiet system that's nothing. Under load, or with a lagging processor, or during a replay,
that gap can be minutes.

[VISUAL: Four remedies, one by one.]

So the answer isn't to make the read side synchronous — that defeats the architecture. It's
four things: design screens that tolerate staleness. Push updates instead of polling, which
is query updates. Return the authoritative value *from the command* so you never have to
query for it — that's why creational command handlers return the new id. And show pending
state optimistically where the UX allows.

---

## Segment 5 — The distinction to internalise (4:40–5:40)

[VISUAL: A single box labelled "one entity = one consistency boundary". Next to it, a
dotted box labelled "a projection" with the dotted line deliberately broken.]

**NARRATOR:**

Here's the distinction I would internalise above all others.

[VISUAL: The box labelled "one entity = one consistency boundary".]

A **consistency boundary** is the region of state that changes atomically. In an event-sourced
system, one entity is one consistency boundary.

[VISUAL: The broken dotted box: "a projection is not a consistency boundary".]

A projection is **not**. A projector takes an event and updates a row. There's no group of
rows that must move together.

[VISUAL: A rule attempted inside a projector, and rejected.]

And the consequence is sharp: **a projection cannot enforce a business rule.** If your rule is
"an order and its invoice are created together or not at all", you cannot implement that in a
projector. It belongs on the write side, in an entity.

[VISUAL: A checkmark: "if you want a rule in a projector, that rule belongs on the write
side".]

If you catch yourself wanting a rule in a projector, that's the signal.

---

## Segment 6 — Rules of thumb (5:40–6:50)

[VISUAL: Six checkboxes, appearing one at a time.]

**NARRATOR:**

Six rules of thumb for reading a projector in a codebase.

[VISUAL: Checkbox 1: "disposable". Checkbox 2: "no business rules".]

One: a projection is **disposable**. Delete the table, replay, and it's back. If deleting a
table would lose data, it wasn't a projection.

Two: no business rules. Only arithmetic and writes.

[VISUAL: Checkbox 3: "rebuildable". Checkbox 4: "sequence by entity id".]

Three: it must rebuild correctly. Replaying has to produce the same table, which is what the
reset handler and truncate are for.

Four: sequence by entity id, unless there's a specific reason not to.

[VISUAL: Checkbox 5: "tolerate what you didn't see". Then a partial-replay animation: an
enrolment event arriving with no preceding CourseCreated.]

Five: **tolerate events you didn't expect to see.** During a *partial* replay, your handler
gets an event whose predecessors it never saw. The documentation is explicit about this. An
incrementing projector is fine. A projector that assumes it already saw the course created is
not.

[VISUAL: Checkbox 6: "never write to it from application code".]

Six: the table is not a source of truth. Never write to it from application code. If you need
a write, send a command.

---

## Segment 7 — Local vs external (6:50–7:20)

[VISUAL: Two small diagrams, as before.]

**NARRATOR:**

And the vocabulary that tells you how a projection is wired: **local**, read only by your own
application, which is the default and needs no configuration. Or **external**, published for
other services to query, which needs a distributed bus and a running Axon Server.

[VISUAL: Final card: "Projection = derived, disposable, eventually consistent. Projector =
arithmetic only. If it needs a rule, move it to the write side."]

The takeaway in one line: a projection is derived, disposable, and eventually consistent. A
projector does arithmetic and nothing else. And if it needs a rule, that rule belongs on the
write side.

---

## Key terms for the glossary

- **Projection / read model** — a derived, read-optimised view built from events. Axon
  documents call it both.
- **Projector** — the event handler that maintains a projection. Does arithmetic, not rules.
- **Denormalisation** — deliberately duplicating data so reads are simple and fast.
- **Eventual consistency** — a projection may lag the write side, usually by milliseconds but
  longer under load or during a replay.
- **Consistency boundary** — the region of state that changes atomically. In an
  event-sourced system, one entity.
- **A projection is not a consistency boundary** — a projector updates a row; no group of rows
  changes together.
- **A projection cannot enforce a business rule** — the direct consequence of the above.
- **Local projection** — read only by its owning application. The default.
- **External projection** — published for other services to query. Needs
  `DistributedQueryBus` and Axon Server.
- **@ResetHandler** — runs before a rebuild; in a projector, usually truncates the table.
- **Idempotent projector** — one that produces the same table whether run incrementally or
  replayed from the start.
- **Partial replay** — resetting to a point mid-history, so handlers receive events whose
  predecessors they never saw. Handlers must tolerate this.

## Guardrails — do not say

- Do **not** describe projections as a cache, a denormalised duplicate, or a "materialised
  view you can drop and rebuild casually" without qualification. They are disposable by
  design, but they are the *only* copy of that read-side shape, and they're a deliberate
  architectural component — not an optimisation to be added later.
- Do **not** say query updates make the read side synchronous. They narrow the staleness
  window; they don't close it.
- Do **not** present the incrementing projector as an optimisation. It trades cost-per-event
  for a hard dependency on never missing an event. Name the trade.
- Do **not** say a partial replay is rare or an edge case. The docs call out handler
  leniency specifically for it.
- Do **not** suggest a projector can be used to validate anything. If a handler can reject an
  event, it will eventually block a stream.
- Do **not** imply projections are optional. They are the read side; without them there is
  nothing to query.
- Do **not** call a projection a "cache of the aggregate". It is built from *all* events of
  all entities that affect the view, which is a different thing.
