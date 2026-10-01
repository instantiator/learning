# Script — 03: Entities (aggregates)

**Format:** conversational explainer, single presenter. Roughly 7–8 minutes.
**Audience:** a Java developer who has just opened a codebase full of `@Aggregate`
annotations, or is about to write their first event-sourced entity.
**Source material:** upload `03-entities-and-aggregates.md` alongside this script.

---

## Segment 1 — The name changed, the idea didn't (0:00–0:50)

[VISUAL: A large word on screen. `AGGREGATE`. A wipe transition. The same word, now reading
`ENTITY`. Small caption: "Axon Framework 4 → Axon Framework 5".]

**NARRATOR:**

First, the thing that confuses new people most.

If you're reading an Axon Framework 4 codebase, you'll see the word **aggregate**
everywhere — `@Aggregate` in Spring, and the `AggregateRepository` concept. In Axon Framework
5, that same object is called an **entity**: `@EventSourcedEntity` in plain Java, or
`@EventSourced` if you're on Spring Boot.

Same idea, different word. Axon dropped "aggregate" because it read as a citation of a DDD
book rather than a description of what the thing does. The behaviour is identical. So the
first question when you open an unfamiliar Axon codebase is always: *which version is this?*
Everything downstream depends on the answer.

---

## Segment 2 — What an entity is for (0:50–2:00)

[VISUAL: A memory block labelled "STATE", feeding into a rulebook labelled "BUSINESS
RULES", with an incoming command arrow.]

**NARRATOR:**

So what *is* an entity? The documentation's definition is precise, and it's worth reading
slowly because it answers most of your questions.

An entity is a *stateful component on the command side that accumulates state from prior
commands and uses it to enforce business rules when handling new ones.*

Three things fall out of that.

One: if a command needs state in order to decide, it needs an entity.

Two: if it doesn't, it should be a plain stateless handler instead — no entity, no loading,
no lock. Cheaper, and simpler. The docs push you towards this harder than you'd expect.

[VISUAL: A callout box: "Don't invent an entity to hold a flag that gets set once and
never changes. That's a signal the command didn't need an entity."]

That's an actual quotation, and it's worth internalising, because a single-field
single-flag aggregate in a real codebase is almost always a mistake.

Three: an entity is a **consistency boundary**. It's loaded, changed, and saved under a
single lock. So two commands that touch the same entity are serialised. That's the property
that makes it safe to check "is the course full?" and then act on the answer.

---

## Segment 3 — The one rule (2:00–3:40)

[VISUAL: A split screen. Left, red, labelled "COMMAND HANDLER: validate + append, never
assign". Right, blue, labelled "EVENT SOURCING HANDLER: assign, never decide".]

**NARRATOR:**

Now the single most important rule in this entire area, and the docs state it twice.

Command handlers **validate and append events**. Event sourcing handlers **update state**
and contain **no business logic**.

Notice that neither one does both. A command handler must never write to a state field. An
event sourcing handler must never make a decision.

[VISUAL: A replay animation. The event stream for course-1 replays from the beginning;
`on(CourseCreated)` and `on(StudentEnrolled)` fire in sequence.]

Here's why, and this is the part that takes a minute to sink in.

Event sourcing handlers run in **two** situations. They run when a command is handled, to
apply the event that was just appended. And they run when the entity is **loaded** —
replaying the whole stream from the beginning to rebuild state.

Those second runs are the problem. If you put a business rule in an event sourcing handler
— "if capacity is exceeded, throw" — that rule doesn't fire once. It fires *every time the
entity is loaded*. Which is every command that touches this entity. Including years later,
on historical events, in contexts that have nothing to do with the original decision.

You'll get exceptions about events that already happened, in places that make no sense.

[VISUAL: A "smell" annotation appears on the code: business logic inside an
`@EventSourcingHandler` — highlighted red.]

So the rule has a diagnostic form: *if an `@EventSourcingHandler` contains an `if`, it is
probably a bug.* State assignment and nothing else.

[VISUAL: A second annotation on the entity: "fields never read by a command handler don't
belong here — that's read-side state. Put it in a projection."]

And the corollary from the docs: an entity should hold only the state it needs to make
decisions. If no command handler ever reads a field, you don't need to track it on the
write side. That's read-side state. It belongs in a projection.

---

## Segment 4 — Three identifiers (3:40–5:20)

[VISUAL: Three labelled tags float around a single command. `@TargetEntityId`, `@EventTag`,
`routingKey`. Each lights up in turn with its question.]

**NARRATOR:**

Now the thing that genuinely confuses people, and it's a naming problem: there are **three**
different identifiers involved, answering three different questions, and they're easy to
confuse because two of them point at the same value.

[VISUAL: Question one.]

`@TargetEntityId` goes on the **command** payload. It answers: *which entity instance do I
load before I call this handler?*

```java
public record EnrollStudentCommand(@TargetEntityId String courseId, String studentId) {}
```

You don't need it on a creational handler, because there's nothing to load yet.

[VISUAL: Question two.]

`@EventTag` goes on the **event** payload. It answers: *which entity's stream does this
event belong to?*

```java
public record CourseCreated(@EventTag String courseId, String title, int capacity) {}
```

And the entity declares the key to filter on: `@EventSourcedEntity(tagKey = "courseId")`.
That key has to match the field name in the `@EventTag`. The docs suggest setting it
explicitly so it stays stable if you rename the class.

[VISUAL: Question three, and a warning banner.]

And then there's `routingKey` on the command. It answers a completely different question:
*which node in the cluster should receive this?*

The documentation is very explicit on this point: routing key does **not** affect which
entity instance is loaded.

So on a single command you can have all three, pointing at the same id, and they mean
genuinely different things. Load-target, stream-membership, and cluster-placement. Getting
these confused is the most common mistake in this area, so if you remember one thing from
this video, make it this slide.

---

## Segment 5 — Entity creators, and why the choice matters (5:20–6:30)

[VISUAL: Three doors, labelled "no-arg", "identifier", "first event". A note underneath:
"mutable ← — — → immutable".]

**NARRATOR:**

Every event-sourced entity needs to be constructible before its events are replayed. Axon
offers three ways, and the choice is really a choice about *mutability*.

[VISUAL: Door one.]

The **no-argument creator**. Axon calls a plain empty constructor, state starts empty, and
events fill it in. This is the mutable style.

[VISUAL: Door two.]

The **identifier-based creator**. You pass the id into the constructor. And here's a
practical detail — you must annotate the parameter with `@InjectEntityId`. Without it, Axon
can't tell the identifier apart from an event payload and assumes the latter.

[VISUAL: The payoff animation: `private final String courseId` locks, and a stamp appears:
"identity is fixed at construction, never touched by a handler".]

The payoff: your identifier can be `final`. It's set once and never mutated.

[VISUAL: Door three.]

And the **first-event-based creator**, where the initial state comes from the first event in
the stream. This is the fully immutable style. Each subsequent event produces a *new*
instance returned from the event sourcing handler — so your handlers have to be split into
static creational ones and instance ones.

[VISUAL: The whole three-door diagram, with a summary line: "identifier-based and
first-event-based creators are the foundation for immutable entities."]

The docs put it neatly: the second and third of these are the foundation for immutable
entities. Pass the state you need into the constructor and the fields can be `final`.

---

## Segment 6 — Child entities, and the performance trap (6:30–7:20)

[VISUAL: A Course box containing forty small Enrollment boxes. An arrow labelled "load this
one child" points in — and the *whole* Course box highlights.]

**NARRATOR:**

Briefly, hierarchies — a parent entity owning child entities, like a course owning its
enrolments. You declare the children with a `@EntityMember` annotation and give them a
routing key, then commands route straight to the right child.

[VISUAL: The warning, given real space and a beat of silence.]

But there's a performance trap, and the docs are unusually direct about it. **Child entities
share their parent's consistency boundary.** A command targeting one child loads the *entire
parent hierarchy* first.

[VISUAL: The Course box grows to ten thousand Enrollment boxes. A warning light flashes.]

So children are for small, bounded structures. A course's enrolments — fine. Ten thousand
enrolments — bad idea. The docs say it directly: for large or independently managed
collections, use a separate entity with its own lifecycle.

One more rule, and it's a nice one: children are created in the parent's *event sourcing
handler*, never in a command handler.

---

## Segment 7 — Version map (7:20–7:50)

[VISUAL: The two-column version table from the notes, animating in.]

**NARRATOR:**

Last, the quick map. If you're grepping an unfamiliar codebase, these are the pairs.

`@Aggregate` becomes `@EventSourcedEntity` or `@EventSourced`. `@AggregateIdentifier`
becomes `@EventTag`. `@TargetAggregateIdentifier` splits into `@TargetEntityId` and
`routingKey`. `@CreationPolicy` disappears — you choose a factory instead.
`AggregateLifecycle.apply` becomes `EventAppender.append`.

And notably, Axon Framework 5 **removed** the concurrency-conflict resolution strategy
from Axon Framework 4. That job is now done by routing and sequencing instead.

---

## Key terms for the glossary

- **Entity** (Axon 4: *aggregate*) — a stateful component on the command side that enforces
  business rules.
- **Consistency boundary** — the region of state that must change atomically. One entity is
  loaded, changed, and saved under a single lock.
- **Event-sourced entity** — an entity whose state is rebuilt by replaying its event stream
  rather than read from a table.
- **@EventSourcedEntity** — marks a class as an event-sourced entity (plain Java).
  `@EventSourced` is the Spring Boot equivalent.
- **@EventSourcingHandler** — applies an event to a state field. Must contain no business
  logic, because it also runs on every entity load.
- **@EntityCreator** — the constructor or factory Axon calls before replaying an entity's
  events.
- **@TargetEntityId** — on a command payload: *which entity instance to load*.
- **@EventTag** — on an event: *which entity stream this event belongs to*.
- **tagKey** — the attribute on `@EventSourcedEntity` naming the key used in `@EventTag`.
- **routingKey** — on a command: *where in the cluster to route this*. Does not affect
  which entity is loaded.
- **EventSourcedRepository** — loads and stores entities. Created for you when you register
  an entity.
- **Entity creator forms** — no-argument (mutable), identifier-based, or first-event-based
  (immutable). The latter two enable `final` fields.
- **Entity hierarchy** — a parent owning child entities, sharing one consistency boundary.
  Suitable only for small collections.
- **@EntityMember** — declares a child entity collection inside a parent.
- **ChildEntityNotFoundException** — no child matched the routing key; usually the child
  hasn't been created yet.
- **Polymorphic entity** — an abstract parent with concrete subtypes, chosen once at
  creation and never changed.

## Guardrails — do not say

- Do **not** say the routing key determines which entity is loaded. It does not. Loading is
  `@TargetEntityId`; routing key is cluster placement. This is the highest-value accuracy
  point in the video.
- Do **not** say `@EventTag` and `tagKey` are the same thing. One is on the event, one is on
  the entity, and the strings must match.
- Do **not** say event sourcing handlers can "safely" contain validation. They cannot — the
  rule exists precisely because they run on every load.
- Do **not** recommend child entities for large collections. The docs explicitly warn that
  a command to one child loads the whole parent.
- Do **not** imply state-stored (non-event-sourced) entities are available in Axon Framework
  5. Event-sourced is what's documented.
- Do **not** suggest aggregating by putting one entity inside another as a field without
  thinking about the shared consistency boundary. That is the performance trap.
- Do **not** state a specific default value for anything version-dependent without hedging.
  Say "check the version".
