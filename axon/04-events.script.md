# Script — 04: Events

**Format:** conversational explainer, single presenter. Roughly 6–7 minutes.
**Audience:** a Java developer reading an event class for the first time and wondering why
it has an unusual annotation on it.
**Source material:** upload `04-events.md` alongside this script.

---

## Segment 1 — A fact, not a request (0:00–0:50)

[VISUAL: Two class names side by side. `EnrollStudent` — a cursor icon, a request. Then
`StudentEnrolled` — a static, sealed shape, a fact.]

**NARRATOR:**

Events are the odd one out among Axon's three message types, and almost everything
surprising about them follows from that.

Look at the naming. `EnrollStudent` is a request — imperative, somebody's asking. Now look
at the event: `StudentEnrolled`. Past tense. A fact.

And a fact behaves differently from a request in three specific ways. It's in the past and
it can't be un-past-ed. Nobody is waiting for an answer to it. And once it's stored, it is
never modified, ever.

[VISUAL: The event, printed on a card, sliding into a sealed box labelled "append-only".]

That third one is the one that changes how you work. **A stored event is never edited.**

Which means your event classes are not just code. They're part of your *data format*. Adding
a field to `CourseCreated` looks exactly like a refactor, and it isn't. It's a schema
migration. Everyone gets bitten by this once. Let's spend the next few minutes making sure
it's not you.

---

## Segment 2 — Domain events and application events (0:50–1:50)

[VISUAL: A split. Left: `OrderPlaced`, `PaymentReceived` — labelled "domain events".
Right: `OrderExportRequested`, `NotificationSent` — labelled "application events".]

**NARRATOR:**

First, a distinction you'll see in basically every real codebase: **domain events** and
**application events**.

A domain event is something that happened in the *domain*. An order was placed. A payment
arrived. These are the interesting ones.

An application event is something the *application* did. Somebody requested an export. A
notification got sent. Usually plumbing.

[VISUAL: A decision rule appears: "If a business rule could reject it, it's a domain
event."]

Here's the test, and it's a good one to apply in code review: **could a business rule
reject this?** If yes, it's a domain event. If it's just "the system did a thing", it's an
application event.

This distinction isn't academic. Application events are much cheaper to change, because
nothing is supposed to be making decisions from them. If you're nervous about changing an
event class, ask which side of this line it's on.

---

## Segment 3 — Streams and tags (1:50–3:00)

[VISUAL: A vertical stream, events stacked with sequence numbers 0 through 47. Each event
bears a small tag: `courseId=c-1`.]

**NARRATOR:**

Now, how events are physically organised.

The event store is **append-only**, and it's organised into **streams**. One stream per
entity, and an event belongs to a stream because of its **tag**.

[VISUAL: The code for a tagged event.]

So every event that concerns course c-one carries a tag saying `courseId` equals `c-one`.
And the entity declares which tag key to filter on — `@EventSourcedEntity(tagKey =
"courseId")`. That string has to match the field name in the tag. The docs suggest setting
it explicitly so it stays stable if you rename the class.

The reason tags matter is that they make a *partial* read possible. When Axon loads an
entity, it doesn't read the whole store — it filters to just this entity's stream. Tags are
also how Axon Server partitions events across a cluster, which we'll come to if there's
time.

[VISUAL: A comparison box: "append to the event store ≠ publish to the event bus."]

One distinction that confuses people: **appending to the event store is not the same as
publishing.** Appending puts an event in the stream, and processors pick it up from there.
Publishing bypasses the store entirely and puts something on the wire.

In a well-formed Axon application you append, and you let the processors find it. If you
find code that publishes from inside a command handler, that's usually a smell — you
probably wanted to append.

---

## Segment 4 — The hard part: compatibility (3:00–5:20)

[VISUAL: Title card: "YOU CANNOT CHANGE A STORED EVENT. SO WHAT DO YOU DO?" Three
solution cards fan out below.]

**NARRATOR:**

Here's the question that every event-sourced codebase has to answer eventually, so let's
answer it properly. The world moves on. Your event class needs to change. You can't go back
and edit what you already wrote. So what now?

Three answers, in increasing order of how much thinking they require.

[VISUAL: Card one.]

**Answer one: payload conversion.** And this is the pleasant surprise in Axon Framework 5.

When a handler receives a stored event, Axon converts the payload to whatever type that
handler declares. The stored event keeps its original form and its message type metadata;
the conversion happens on read.

Which means the most common case — *I added a field, and the old events don't have it* —
mostly just works. The handler gets the new type, the missing field gets its default, nobody
has to think about it. This is a genuine improvement over Axon Framework 4, where this was
the main job of upcasters.

[VISUAL: Card two.]

**Answer two: event transformation.** This is for when you've *reshaped* the event, not
just extended it. Renamed a field. Split one event into two. Changed a nested structure.
Conversion can't do that.

Event transformation rewrites the event as it's read out of the store, so the rest of your
system sees the new shape. One thing to know: this is an Axoniq Framework feature, so it
lives under the `io.axoniq.framework` package and needs a commercial licence. It's not in
the open-source core.

[VISUAL: Card three, with a warning.]

**Answer three: write a new event.** When the *meaning* changed, not the shape — you don't
transform. You append a new event type and let the old one be history.

[VISUAL: A separate warning banner: "Axon Server also has server-side transformation. That
one is a permanent mutation of your data. It is not undoable."]

And a warning about Axon Server specifically, because it's genuinely important. Axon Server
has its own server-side equivalent, called persistent event transformation. The difference
is that it applies the rewrite *once, permanently*, rather than on every read. That is a
mutation of your stored data with no undo. Treat it with corresponding respect.

[VISUAL: All three cards, summarised in one line: "add a field → conversion · reshape →
transformation · changed meaning → new event".]

To summarise all three: added a field, conversion. Reshaped it, transformation. Changed the
meaning, write a new event.

[VISUAL: A practical heuristic card: "In a real codebase you'll meet events nobody has
touched in four years. The useful question isn't 'is this still correct?' — it's 'who reads
this, and would they be surprised?'"]

One practical heuristic, for when you're staring at an event class in a codebase you don't
know. The useful question isn't "is this event still correct?" Almost all of them are, in
their own way. The useful question is: **who reads this, and would they be surprised by
the current shape?** Usually the answer is one projector, and it hasn't changed since the
event was written.

---

## Segment 5 — One consumer, three readers (5:20–6:20)

[VISUAL: A single event `StudentEnrolled` in the middle, with three arrows fanning out to
three panels: a projector, a notification handler, and the entity's own event sourcing
handler.]

**NARRATOR:**

Let's look at what a single event actually does, because the multiplicity is the whole
point.

[VISUAL: Code panel.]

One event — `StudentEnrolled` — and three consumers, with completely different reasons for
caring.

The **projector** increments a counter in a read-side table. The **notification handler**
sends an email, and note it needs no state, so it needs no entity, so it loads nothing. And
the **entity's own event sourcing handler** bumps its count — that's the write side keeping
its own state in sync.

[VISUAL: The three panels, with a closing line: "the same event, referenced from files in
packages that have nothing to do with each other."]

Three files, in packages that have nothing to do with each other, all referencing the same
event class. That's normal, and once you're used to it, you navigate a codebase like this
by following the events rather than the code.

---

## Segment 6 — Sequence numbers (6:20–6:50)

[VISUAL: A short aside card.]

**NARRATOR:**

One quick aside, because it trips people up.

Older Axon Framework 4 code often injects a sequence number or a source id into an event
handler, to get the event's position within its stream. With event-sourced entities, don't
expect that to work — the documentation is explicit that those aggregate-specific
parameters don't apply, because events aren't aggregate-specific any more.

If you need the position, or the entity id, use the **tag** on the event instead. That's the
equivalent information, and it's the one that's actually there.

---

## Key terms for the glossary

- **Event** — an immutable statement of fact about something that has already happened.
  Always past tense.
- **Append-only** — events are never modified or deleted. Ever.
- **Stream** — an ordered sequence of events. One per entity, identified by tag.
- **@EventTag** — marks the identifier field on an event so it can be found in a stream.
- **tagKey** — the attribute on `@EventSourcedEntity` naming the tag key to filter on. Must
  match the `@EventTag` field name.
- **Domain event** — a fact about the domain. Business rules can depend on these.
- **Application event** — a fact about what the application did. Plumbing. Cheaper to change.
- **EventAppender** — the context-aware way to append events. Must be injected as a handler
  parameter, never stored.
- **EventSink** (Axon 4: `EventBus`) — the component that publishes events to handlers.
  Distinct from appending to the store.
- **Payload conversion** — converting a stored event's payload to the type a handler
  declares. Handles additive changes.
- **Event transformation** — rewriting a stored event's shape on read. An Axoniq Framework
  (commercial) feature. Axon Framework 4's equivalent was the `EventUpcaster`.
- **Persistent event transformation** — the Axon Server equivalent. Applies once,
  permanently. Not undoable.

## Guardrails — do not say

- Do **not** say events "return a result" or "can be rejected". They can't. An event
  handler that throws fails the stream, not a caller.
- Do **not** say appending and publishing are the same thing. They are distinct, and the
  distinction explains why handlers eventually run.
- Do **not** promise that event transformation is available in the open-source Axon
  Framework. It lives in `io.axoniq.framework` and needs a licence. Say so.
- Do **not** describe Axon Server's persistent event transformation as reversible. It is a
  permanent write to your data.
- Do **not** suggest a stored event can be "fixed" by editing the class. The stored bytes
  don't change when you edit Java.
- Do **not** claim `@SequenceNumber` works with event-sourced entities. The documentation
  explicitly says aggregate-specific parameters don't apply — use the tag.
- Do **not** tell people an event class is "just a POJO". It's a schema.
