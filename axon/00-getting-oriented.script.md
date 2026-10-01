# Script — 00: Getting oriented with Axon

**Format:** conversational explainer, single presenter. Roughly 5–7 minutes.
**Audience:** an experienced Java developer who has just joined a team that uses Axon and
needs to sound literate in a code review by Friday.
**Source material:** upload `00-getting-oriented.md` alongside this script.

---

## Segment 1 — Cold open (0:00–0:40)

[VISUAL: A plain relational table, `COURSE` with columns ID, TITLE, CAPACITY, ENROLLED.
A cursor hovers over the number 47 in the ENROLLED column.]

**NARRATOR:**

You know this table. You've written it a hundred times. Course number one, capacity fifty,
enrolled forty-seven.

Now here's the awkward question. If a customer phones up and says "I don't think I signed
up for that" — can you answer them? With a row like this, you can't. You know the number
forty-seven. You don't know *which* forty-seven students, in what order, or who asked for
each one. That information existed for about ten seconds and then got thrown away.

Axon Framework is built around a different answer to that question.

[VISUAL: The row dissolves. In its place, a vertical stack of dated entries scrolls:
`CourseCreated`, `StudentEnrolled(s-9)`, `StudentEnrolled(s-2)`, … continuing for
forty-seven lines.]

Instead of storing the current value, you store the *history of changes*. Every event that
happened, in order. That's event sourcing, and it's the foundation everything else in Axon
sits on.

---

## Segment 2 — The two halves (0:40–2:10)

[VISUAL: Screen splits into two labelled columns. Left: "WRITE SIDE". Right: "READ SIDE".
An arrow labelled `commands` enters the left column. An arrow labelled `queries` enters the
right column. A single arrow labelled `events` crosses from left to right, through a box
labelled "EVENT STORE".]

**NARRATOR:**

Axon implements two patterns at once, and if you only understand one of them you'll find
yourself confused later.

The first is **CQRS** — Command Query Responsibility Segregation. Most software does two
very different jobs: *changing* state, where you have to enforce rules against everything
you know, and *reporting* on state, where you just need an answer shaped nicely for the
reader. CQRS says: stop mixing them.

In Axon, the split is enforced by the type system, not by convention. The left half is the
**write side**. It receives **commands** — an expression of intent, like "enroll this
student in this course." It loads whatever state it needs, checks the business rules, and
if the rules hold, appends **events** saying what happened.

The right half is the **read side**. It answers **queries** — "how many seats are left?" —
and it does that from a purpose-built table it maintains itself.

[VISUAL: The arrow between the halves thickens. The right column is visibly *behind* the
left; a small badge reads "eventually consistent".]

Notice the direction of the arrow. It only ever points left to right. Events flow out of
the write side and into the read side. Nothing flows back. And because that arrow is
asynchronous, the read side lags. That lag is called **eventual consistency**, and — this
matters — it is not a defect. It is the design. The command handler returns as soon as the
event is stored; the table catches up a moment later.

If you're ever in a code review and someone asks "but is the read model guaranteed to be
up to date?" — no, and it shouldn't be. What it *is* guaranteed to be is **rebuildable**.
Because the read model contains no information that isn't already in the event store, you
can throw it away and rebuild it from scratch. That property is why replay exists, and
we'll come back to it at the end.

---

## Segment 3 — Vocabulary you'll actually see (2:10–3:30)

[VISUAL: A clean two-column glossary card fades in, one row at a time.]

**NARRATOR:**

Here's the vocabulary. Five terms, and you'll meet all of them in your first hour in the
codebase.

[VISUAL: Glossary rows appear, one per beat.]

**Command.** A request to change something. "Enroll a student." It names an intention, not
an action. If you see a class called `EnrollStudentCommand`, that's exactly what it is.

**Event.** A statement of fact about something that already happened. Past tense, always.
`StudentEnrolled`. Events are the only thing Axon stores.

**Query.** A request for information. No side effects. If a "command" doesn't change
anything, in Axon it should probably be a query.

**Entity.** The thing that holds state and enforces the rules. This is the word Axon
Framework 5 uses. If the codebase you joined is on an older version, the same concept is
called an **aggregate**, and you'll see `@Aggregate` annotations everywhere.

**Projection.** The read-side table. Also called a **read model**. The two words mean the
same thing; Axon's own documentation uses both.

And the container they all live in: the **event store**. Append-only, the source of truth.

[VISUAL: All five rows highlighted together, then the word "aggregate" gets a small
"= entity in Axon 5" annotation appended.]

One more piece of vocabulary, and it's the one that trips up newcomers hardest: **bounded
context**. That's a DDD term for a region where one model of the domain is valid. An
"Order" in the sales context and an "Order" in the fulfilment context are genuinely
different types with different fields, and that's intentional. Axon maps a bounded context
to an application, and when you use Axon Server, to something called a *context*.

---

## Segment 4 — Should you care about this? (3:30–4:40)

[VISUAL: A title card: "WHY EVENT SOURCING IS WORTH THE COST". Three cards flip up
one at a time.]

**NARRATOR:**

Fair question — event sourcing is not free. Reading current state means reading a stream,
which is slower than reading a row. Axon mitigates this with snapshots. So why do it?

Three reasons, and these are the reasons teams actually care about once they're in.

[Card one.]

**The audit trail is free.** "How did this account get a negative balance?" is a question
you answer by reading the log, in order, like a transcript. With a mutable table the
evidence is simply gone.

[Card two.]

**Time travel is free.** Read the stream up to last Tuesday and you know exactly what the
dashboard said last Tuesday. With a row, reconstructing that is a genuinely unpleasant
exercise.

[Card three, held longest.]

**Mistakes are correctable.** This is the one that wins teams over. If a bad event is in
your log — a bug, a bad import, a fat-fingered data fix — you can *project it away*. You
write a handler that skips it, you rebuild the read model, and it's gone. With a mutated
row, that option doesn't exist. You fix forward and hope.

And because the read model is disposable, so is every derived thing you build on top of
it. Reports, caches, search indexes. If the event store is the truth, everything else is
a convenience you can throw away and rebuild.

---

## Segment 5 — The version warning (4:40–6:10)

[VISUAL: A version-comparison card. Left column slides in first, labelled
"AXON FRAMEWORK 4", then a second column slides in beside it, labelled
"AXON FRAMEWORK 5". Rows animate between the two.]

**NARRATOR:**

Last thing, and it's the one that will save you the most time.

Axon Framework 5 came out and **renamed a large fraction of its public API**. The ideas
didn't change. The words did. So if you google something and find an answer that doesn't
match the code in front of you, check the version first.

A few you'll meet constantly. In Axon Framework 4 the consistency-boundary class is called
an `Aggregate`, annotated `@Aggregate`. In Axon Framework 5 it's called an **entity**,
annotated `@EventSourcedEntity`, or `@EventSourced` if you're on Spring Boot.

The identifier annotation changed too. `@TargetAggregateIdentifier` became
`@TargetEntityId`. The way you publish an event, `AggregateLifecycle.apply`, became
`EventAppender.append`. The thing that processes events in the background was
`TrackingEventProcessor` and is now `StreamingEventProcessor`.

[VISUAL: A warning banner slides in across the bottom: "ALSO: `@Saga` DOES NOT EXIST IN
AXON FRAMEWORK 5."]

And this one deserves emphasis because it isn't a rename — it's a **removal**.

Axon Framework 4 had `Saga`. It was the standard way to model a long-running business
process: order received, wait for payment, wait for shipping, ship. In Axon Framework 5
core, `Saga` **does not exist**. Neither does the deadline scheduler. You build long-running
processes out of ordinary event handlers instead, or you use the commercial Workflows
feature.

So: if you see `@Saga` in a codebase, you are looking at Axon Framework 4. That's actually
useful information — it's a reliable signal of which half of the vocabulary applies to
everything else you're about to read.

One more tell. The package name tells you which *distribution* you're on. Anything under
`org.axonframework` is the open-source core. Anything under `io.axoniq.framework` needs a
commercial licence from Axoniq.

---

## Segment 6 — How to read an unfamiliar codebase (6:10–6:50)

[VISUAL: A numbered list, checking itself off as it goes.]

**NARRATOR:**

Finally, the practical bit. Given a codebase you've never seen, read it in this order.

One: grep for `@CommandHandler`. That gives you the list of things the system can *do*.
Two: pick the simplest one and follow it all the way through — where does it get its
state, what does it append. Three: grep for `@EventHandler`, that's the read side and the
process managers. Four: find the table the read side writes to, that's your projection.
Five, and do this first if you can: check the dependency version, because it decides which
vocabulary applies to all four.

---

## Key terms for the glossary

- **CQRS** — splitting the code that changes state from the code that reports on it.
- **Event sourcing** — persisting the sequence of changes rather than the current value.
- **Command** — a request to change state, named for intent ("EnrollStudent").
- **Event** — an immutable statement of fact about something that already happened.
- **Query** — a request for information, with no side effects.
- **Entity** (Axon 4: *aggregate*) — the object that holds state and enforces business rules.
- **Projection / read model** — a read-optimised table derived from events.
- **Event store** — the append-only store where events live; the source of truth.
- **Bounded context** — a DDD boundary within which one domain model is valid.
- **Consistency boundary** — the region of state that must change atomically.
- **Eventually consistent** — the read side catches up after the write side, not with it.
- **Axon Server** — Axoniq's server for storing events and routing messages.
- **Replay** — re-running events from the start to rebuild derived state.

## Guardrails — do not say

- Do **not** call the write side "the API" or the read side "the API". They're different
  things and conflating them is the exact confusion this video is trying to remove.
- Do **not** present event sourcing as a silver bullet. Say plainly that reading current
  state is slower and that snapshots mitigate it.
- Do **not** say sagas were renamed. They were **removed** from Axon Framework 5 core.
  Renamed implies a findable equivalent; there isn't one in the core framework.
- Do **not** give a specific version number as "current". Say "Axon Framework 5" and let
  the reader check the release notes. If pressed, note that Axoniq also ships a commercial
  distribution under `io.axoniq.framework`.
- Do **not** claim the read model can be made synchronous. It can't, without giving up the
  architecture.
- Do **not** describe the event store as "a table" or "a log file". It's an append-only
  store optimised for streaming reads.
- If uncertain about any specific annotation name, say "something like this" rather than
  inventing a name. Wrong class names are worse than vague ones.
