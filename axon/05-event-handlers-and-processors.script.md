# Script — 05: Event handlers and processors

**Format:** conversational explainer, single presenter. Roughly 6–7 minutes.
**Audience:** a Java developer who needs to know which kind of event handler they're
writing, and why.
**Source material:** upload `05-event-handlers-and-processors.md` alongside this script.

---

## Segment 1 — The question that decides everything (0:00–0:50)

[VISUAL: A single event arrives at a fork in the road. Left branch: a hook labelled "does
something to the outside world". Right branch: a table labelled "data this system owns".]

**NARRATOR:**

There are two kinds of event handler in Axon, and the choice between them matters more than
almost anything else you'll decide.

So before we look at the machinery, here's the question that decides it. Does this handler do
something to the *outside world* — send an email, call a payment provider, post to a
webhook? Or does it only change data that this system owns?

[VISUAL: If the answer is "outside world", a stamp appears: SUBSCRIBE. If "data we own":
STREAM.]

If it touches the outside world, you want a **subscribing** processor. If it only changes
data this system owns, you want a **streaming** processor.

Hold onto that rule. It explains every difference that follows.

---

## Segment 2 — Subscribing processors (0:50–2:10)

[VISUAL: An arrow from a command handler directly into a notification handler. Same
process box drawn around both.]

**NARRATOR:**

A subscribing processor is called *live* — at the moment the event is published, in the same
process that published it. Look at the diagram: there's no hop. The arrow goes straight
from where the event was produced to where it's handled.

That has three consequences, and they're all consequences of the same thing: **there's no
position recorded anywhere.**

One: events published while the processor isn't running are simply lost. There was no
"where did I get to" to resume from.

Two: it can't be replayed. For the same reason.

Three: no parallelism, because it runs on the publishing thread.

[VISUAL: A replay animation: a stream rewinds to the beginning, and a notification is sent
a second time. A hand slams down on the diagram.]

And *that* is the reason for the rule. A streaming handler will see that event again every
time you replay. A subscribing handler saw it once, and it either worked or it didn't.

So: if your handler sends an email, and it gets replayed, you've emailed the customer
again. If it just increments a counter in a table, replaying it is fine — in fact it's the
whole point, because it fixes the counter.

[VISUAL: Caption: "Side effect → must happen once → subscribe. Data we own → must be
rebuildable → stream."]

One line to remember: **side effects must happen once, so subscribe. Data you own must be
rebuildable, so stream.**

---

## Segment 3 — Streaming processors and the token (2:10–3:40)

[VISUAL: A long stream of events. A cursor sits on it, labelled "TrackingToken". The cursor
is shown dropping into a small database box labelled "TokenStore".]

**NARRATOR:**

A streaming processor reads from the stream and **tracks its position** with something called
a tracking token. That token is persisted in a token store.

[VISUAL: The token cursor, zoomed in: "token = a position in the event stream".]

A token is just a position. In Axon Server it's a global sequence number. In a database event
store it's typically a timestamp plus a sequence number, which is why there's also a "give me
the token at this moment" API — that's what makes partial replay possible.

[VISUAL: The token cursor, with a spotlight: "The token store is the most important piece of
operational state after the event store itself."]

Now — this is worth saying carefully, because it's a real operational lesson. **The token
store is the second most important thing in the system after the event store.**

Lose the tokens, and every processor restarts from the beginning and rebuilds every
projection. That's usually survivable, because the read models are disposable. But lose them
and your side effects that *were* subscribing handlers are fine, and your latency goes
through the roof.

Freeze the tokens, and something quieter and worse happens: a projection silently stops
advancing, and nothing errors. The dashboard just shows a lag that keeps growing.

[VISUAL: A parallel-processing animation: the stream splits into four lanes, each with its
own cursor. Label: "segment".]

And because the token is per-*position*, not per-thread, a streaming processor can process
in parallel. The stream is divided into **segments**, and each segment is processed
independently. You can change how many there are at runtime — split them, merge them — and
Axoniq Platform will even scale the count to match your replica count for you.

---

## Segment 4 — Sequencing: the bug everyone hits (3:40–5:00)

[VISUAL: Two events for the same entity arriving at a projector. The projector writes
"enrolled = 2" then "enrolled = 1". A red flash: "the read model is now permanently
wrong."]

**NARRATOR:**

Here's a bug that is specific to this architecture, and it's worth spending a minute on
because it's easy to introduce and hard to diagnose.

Two events for the *same* entity. If a projector handles them out of order, the read model
becomes **permanently wrong**. Not slow — wrong. And because the projector is streaming, it
won't self-heal. It'll just carry the error forward forever.

[VISUAL: A "sequencing policy" gate inserted between the segments and the handler.]

This is what a **sequencing policy** is for. It decides which events must be handled in order
relative to each other, and which are free to run in parallel.

Events with the same sequence identifier: strictly one after another. Events with different
identifiers: parallel.

[VISUAL: A configuration table. Three policies compared.]

There are three useful choices. **Property-based** — sequence by a property on the event,
normally the entity's tag. **Fully sequential** — everything in strict order. Or your own
implementation.

[VISUAL: The property-based lane highlighted: "per-entity ordering — what correctness
actually requires".]

Here's the guidance, and it's the single most valuable piece of tuning advice in Axon. Your
default for a projector should almost always be **sequence by entity id**.

That gives you strict ordering *within* an entity — which is the only ordering correctness
actually requires — while still running different entities fully in parallel. Globally
sequential processing is the safe default that people leave in from a template, and it's the
most common reason an Axon system is slower than it needs to be.

[VISUAL: A properties file, with the `eventhandling` misspelling circled.]

[VISUAL: A "documentation defect" card, half-warning half-amateur-hour.]

[VISUAL: A defaults animation: SequentialPerAggregatePolicy → HierarchicalSequencingPolicy.]

Two practical notes if you're configuring this in Spring Boot. First, the property name is
`eventhandling` — one word, no hyphen. Easy to typo.

And note the *default* changed in version 5: the default sequencing policy moved from
sequential-per-aggregate to `HierarchicalSequencingPolicy`, and the interface itself now takes
a message and a processing context. So "what happens if I configure nothing" has a different
answer than it used to.

Second, a genuine documentation defect worth flagging, because it'll bite anyone copying from
the docs. One page in the current Axon Framework 5 reference shows `mode=tracking`. That is
not a valid 5.x value — it's left over from the old `TrackingEventProcessor`. Everywhere else
on that same page it's `pooled-streaming`. Copy the wrong line and you configure a processor
type that doesn't exist.

---

## Segment 5 — When a handler fails (5:00–6:10)

[VISUAL: An event hits a handler. The handler throws. The publisher, several steps back,
doesn't notice. A question mark hangs in the air.]

**NARRATOR:**

Now the structural problem, and it's the thing to carry away from the whole read side.

**An event handler has nobody to report failure to.**

Think about it. Commands and queries have a caller waiting, so an exception propagates and
somebody finds out. But an event handler is called *after* the fact. The publisher finished
its work and moved on ten seconds ago. Nobody is waiting.

So a failure has to surface somewhere else, and Axon gives you two main mechanisms.

[VISUAL: A holding pen labelled "dead-letter queue", with failed events inside.]

The **dead-letter queue**. Events that can't be handled get parked there rather than
blocking everything behind them. You look at the queue, fix the underlying problem, and
replay the failed events.

This is the escape hatch that stops one bad event from stalling an entire projection. If a
codebase has a DLQ configured, expect to meet it in an operations runbook — usually with a
script to drain it.

[VISUAL: A "per-processor" switch labelled `PropagatingErrorHandler`, with three positions:
propagate and stop, log and continue, skip.]

The other mechanism is the `PropagatingErrorHandler`, which is a **per-processor** decision:
when a handler throws, do you stop the processor, log and carry on, or skip the event?

And getting this wrong is how you end up with a projection that silently skips events and
therefore quietly disagrees with the event store forever.

[VISUAL: A two-way recommendation: "projections → propagate, because dropping an event
corrupts the model. Side-effect handlers → be more forgiving."]

[VISUAL: A licence badge on the DLQ box: "Axoniq Framework — commercial".]

And one licensing note, because it matters operationally: **Axon Framework 5's open-source
core has no dead-letter queue at all.** It's an Axoniq Framework feature, so it needs a
licence — which matches the `io.axoniq` namespace it lives in. If a codebase has a DLQ and no
Axoniq Framework licence, that is worth understanding *before* the first incident, not
during it.

[VISUAL: A struck-through name: "PropagatingErrorHandler — the AF4 name".]

And a naming caveat: `PropagatingErrorHandler` is the version 4-era name. It doesn't appear in
the current version 5 reference. If you meet it in an import, expect the modern equivalent to
look different.

The rough guidance: propagate for projections, because dropping an event corrupts the model.
Be more forgiving for notification-style side effects, where one failure shouldn't stall
everything behind it.

[VISUAL: Package names, with the two sub-packages shown side by side and clearly NOT
parallel. A warning triangle.]

One implementation note while we're here, because it wastes people an afternoon: in Axon
Framework 5 the dead-letter queue lives under `io.axoniq.framework`, not
`org.axonframework`. And the two sub-packages aren't parallel to each other — one
configuration class is in one, the main type is in the other. Your IDE's auto-import will
guess wrong.

---

## Segment 6 — Knowing what a processor is doing (6:10–6:50)

[VISUAL: A dashboard. Three gauges: LATENCY, CAPACITY, COUNTER — per segment.]

**NARRATOR:**

Finally, how you tell whether any of this is working. A streaming processor exposes its
status per segment. Is it caught up? Is it replaying? Is it in an error state? Where is it
now, and where did the replay start — and the difference between those two numbers is your
estimate of how long the replay will take.

[VISUAL: Three gauges labelled: LATENCY, CAPACITY, COUNTER.]

And three metrics worth watching on a dashboard.

**Latency** — the gap between an event being published and being handled. High latency means
the processor is behind. Normal during a replay, alarming otherwise.

**Capacity** — how busy it is. The docs suggest that 0.8 on a single thread is a warning
sign: either you've got a performance problem, or that segment should be split.

**Counter** — events per minute. A drop outside your normal range deserves an
investigation.

[VISUAL: Final summary card: "Side effect → subscribe. Data you own → stream. Sequence by
entity id. And watch latency."]

If you remember four things: side effects subscribe, data you own streams, sequence by
entity id, and watch latency.

---

## Key terms for the glossary

- **Event handler** — a method annotated `@EventHandler` that reacts to an event. Nothing
  calls it and waits for a result.
- **Event processor** — the runtime that delivers events to handlers.
- **Subscribing processor** — called live as events are published. No token, no replay, no
  parallelism. Right for side effects, which must happen exactly once.
- **Streaming processor** — reads from a stream, tracking a position. Replayable, parallel,
  right for projections and anything rebuildable.
- **TrackingToken** — the processor's position in the event stream.
- **TokenStore** — where a streaming processor persists its tokens. The second most
  important piece of operational state after the event store.
- **Segment** — a slice of the event stream processed independently. Segment count is
  adjustable at runtime.
- **SequencingPolicy** — decides which events must be handled in order and which may run in
  parallel. Sequence by entity id for correctness plus parallelism.
- **PropertySequencingPolicy** — sequences by a property on the event, normally the entity's
  tag. The usual right answer.
- **@ResetHandler** — runs before a replay, to prepare state. A projector rebuilding a table
  truncates it here.
- **@ReplayContext** — injects the context object you passed when triggering the reset.
- **ReplayStatus** — tells a handler at runtime whether it's being called for a live event or
  a replay.
- **@AllowReplay / @DisallowReplay** — opt an event in or out of replay.
- **Dead-letter queue** — where events that cannot be handled are parked for later replay.
  Stops one bad event stalling a whole projection. **Axoniq Framework only — commercial. Not
  in the AF5 open-source core.**
- **`HierarchicalSequencingPolicy`** — the AF5 *default* sequencing policy, replacing AF4's
  `SequentialPerAggregatePolicy`.
- **`SequencingPolicy`** — AF5 takes `(Message, ProcessingContext)` and returns
  `Optional<Object>`, and is now shared with command handling.
- **Error handler** — per-processor policy for what to do when a handler throws.
  `PropagatingErrorHandler` is the AF4-era name and is absent from the AF5 reference.
- **`io.axoniq.framework`** — the *commercial* Axoniq Framework namespace. The DLQ lives here,
  which is why it needs a licence. Not an Axon 5 version signal.
- **Processing group** — the Axon Framework 4 term for a group of handlers sharing one
  processor. `@ProcessingGroup` became `@Namespace` in Axon Framework 5.

## Guardrails — do not say

- Do **not** present subscribing vs streaming as "simple vs advanced". They're different
  capabilities for different purposes, and streaming is required precisely where you need
  replay.
- Do **not** say a subscribing processor catches up on restart. It doesn't — events
  published while it was down are lost. Say that plainly; it's a common and expensive
  misunderstanding.
- Do **not** say a lost token store is catastrophic. Projections are disposable and will
  rebuild. Say "loud and expensive", not "data loss".
- Do **not** suggest globally-sequential processing as a reasonable default. It's correct
  but usually far slower than per-entity sequencing, which is what correctness requires.
- Do **not** quote `mode=tracking` as a valid property value. It appears in the official docs
  and it is wrong.
- Do **not** say the dead-letter queue is in `org.axonframework`. It is in
  `io.axoniq.framework`, in two non-parallel sub-packages.
- Do **not** suggest replaying is always safe. Re-running a handler with a side effect
  repeats the side effect. That is the entire reason for the two processor types.
- Do **not** describe the token store as a cache or an optimisation. It is the processor's
  only record of its position; losing it means starting over.
- Do **not** claim `SequentialPerAggregatePolicy` is still the default. AF5 defaults to
  `HierarchicalSequencingPolicy`.
