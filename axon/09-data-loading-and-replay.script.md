# Script — 09: Data loading and replay

**Format:** conversational explainer, single presenter. Roughly 5–6 minutes.
**Audience:** a Java developer planning a projection rebuild, or trying to work out whether
something called "loading" and something called "replay" are the same thing.
**Source material:** upload `09-data-loading-and-replay.md` alongside this script.

---

## Segment 1 — The distinction (0:00–0:45)

[VISUAL: Two labels on opposite sides of a line. LEFT: "LOADING — data going in". RIGHT:
"REPLAY — data already there, being re-delivered".]

**NARRATOR:**

First, the distinction that everything else depends on, because these two get conflated
constantly.

**Loading** means getting data *into* the store. **Replay** means re-delivering data that's
already in the store. They fail differently, they mean different things, and a rebuild is a
replay, never a load.

[VISUAL: Three stacked layers: event store at the bottom, a stream in the middle, a token on
top.]

Three things to keep straight. The **event store** is the source of truth — append-only,
ordered, permanent. A **stream** is a view of that store for a particular aggregate. And a
**token** is a position within the stream.

[VISUAL: A tracked stream with a cursor; an untracked stream with the words "starts at the
beginning every time".]

A stream is either **tracked** — it carries a position, so a processor can resume — or
**untracked**, which always starts at the beginning. The natural example of untracked is a
list of countries: those never change, so there's no "latest" event, and re-reading from the
start each time is cheap and correct.

[VISUAL: A token split into two states: MARKED and UNCOMMITTED.]

And a token is either **marked**, meaning you're done with it, or **uncommitted**, meaning
you've handed it out but haven't finished. That distinction is what makes two processors
reading the same stream safe.

---

## Segment 2 — What a replay is (0:45–1:40)

[VISUAL: A processor's cursor jumping backwards to the start of a stream, then racing forwards
again. The same events being delivered a second time.]

**NARRATOR:**

A **replay** resets a processor's position and re-delivers every event from that point to the
end of the stream. Same handlers, same code, run again.

[VISUAL: A list of four reasons, appearing one by one.]

You need one for four reasons. You added a handler to an existing projector. You changed how
a projector computes something. You found a projector bug and don't want to work out which
events were mis-processed. Or you changed an event's shape and the stored data no longer
converts.

[VISUAL: A version comparison table.]

And a quick version note, because this is a common source of confusion in a mixed codebase.
In Axon Framework 4 you had to stop the engine, call `resetTrackingTokens`, and start it
again. In Axon Framework 5 it's a single `resetTokens` call, directly on the streaming
processor. Which matters, because the 4.x mechanism couldn't express a *partial* replay, and
the 5.x one can — through an argument called a `ResetContext`.

[VISUAL: A "names that don't exist" card.]

Two names worth calling out as *not real*, because both spread around and both waste time.
There is no `BoundaryStreamableEventSource` type. And there is no `XEventStore` — Axon 5 uses
`EventStore`, and so did Axon 4, so that one isn't even a rename.

[VISUAL: A status panel: REGULAR on the first pass, REPLAY only after a reset.]

And one behaviour change: in version 5, a processor's *first* pass over a stream reports
`REGULAR`, not `REPLAY`. So if you see a status of `REPLAY`, a replay genuinely happened. That
matters for reset handlers that truncate on any non-null token.

---

## Segment 3 — Making handlers replay-safe (1:40–3:00)

[VISUAL: A projector with a `@ResetHandler`, then a replay animation with a truncate first.]

**NARRATOR:**

Re-running a handler is only safe if the handler can survive being re-run. Two mechanisms help.

[VISUAL: Highlight the `@ResetHandler`.]

`@ResetHandler` runs *before* the replay, with the processor paused. A projector uses it to
truncate its table. Without it, you re-add every historical event to rows that already have
counts, and everything doubles.

[VISUAL: `ReplayAware` highlighted, with a handler suppressing an email during replay.]

Then there's **replay-awareness**. By default handlers receive everything, but
`@DisallowReplay` exists for the rare handler that genuinely cannot be re-run. And the
`ReplayAware` interface lets a handler ask, at runtime, "am I being called for a replay?" —
which is how a handler suppresses an outbound email while still processing real traffic.

[VISUAL: A partial-replay animation: the cursor resets to the middle of history, and a
StudentEnrolled event arrives with no preceding CourseCreated.]

Now the one that bites people. A **partial** replay resets to a point in the *middle* of
history. So your handler gets an event whose predecessors it never saw. The documentation is
explicit about this: handlers must be lenient, or tolerant of missing data.

[VISUAL: Two projectors compared: "increments a column" (passes) vs "assumes the course was
created" (fails).]

An incrementing projector is fine. A projector that assumes a course was already created is
not, and it will fail — or worse, silently produce wrong numbers.

---

## Segment 4 — The operational sequence (3:00–4:15)

[VISUAL: A seven-step checklist, ticking off.]

**NARRATOR:**

What a rebuild actually looks like in production. Seven steps.

[VISUAL: Step 1 highlighted hard: "STOP EVERY INSTANCE".]

**One: stop every instance of the projector.** All of them. This is the step people skip. One
instance left running with a live token will interleave with the replay, and you'll end up with
a table that is neither the old one nor the new one.

[VISUAL: Steps 2-4 ticking quickly.]

Two: clear the token. Three: the reset handler runs and truncates the table. Four: start the
processor, and it re-reads from the reset point.

[VISUAL: Step 5 highlighted: ReplayStatus, showing "start token" and "current token".]

**Five: watch `ReplayStatus`.** It gives you the token where the replay started and where it is
now. The difference between those two numbers is your estimate of how long this will take.
This is the step people forget, and it's the one that turns a rebuild from a leap of faith into
something you can plan.

[VISUAL: A latency graph spiking, then flattening.]

Six: expect latency to spike and capacity to saturate, and remember the read model is stale
the entire time. Seven: when it catches up, it's correct again.

---

## Segment 5 — Loading, for contrast (4:15–5:10)

[VISUAL: A left-to-right pipeline: legacy row → initialization event → event store → projector
→ read model.]

**NARRATOR:**

Now loading, for contrast — because that's the other thing people mean by "data loading".

[VISUAL: Three options, stacked.]

There are three routes in. **Event sourcing**, which is the normal one: you don't load events,
you send commands and the framework appends them. **Snapshotting**, which stores an entity's
current state periodically so loading its stream is fast — a pure optimization that doesn't
change semantics. And **bootstrapping**, which is what "data loading" usually means in an
Axon project.

[VISUAL: The bootstrapping pipeline, arrows animating left to right.]

Bootstrapping is importing a legacy database into an event-sourced model. Each row becomes an
**initialization event** — a creation event carrying its current state — which the projectors
then build the read model from.

[VISUAL: The two read models, side by side, with a hard "must be identical" stamp.]

And the discipline that makes this safe: the read model built from initialization events must
be **identical** to the one built by replaying real history. If they differ, you've built two
sources of truth that disagree — and you won't find out until production.

Note the direction: bootstrapping *appends* to the store. Replay *re-reads* from it. Replay
never modifies the event store.

---

## Segment 6 — Is it safe to replay? (5:10–6:00)

[VISUAL: A table filling in, one row at a time.]

**NARRATOR:**

The question that decides everything: is it safe to replay *these* handlers?

[VISUAL: The projector row, marked YES.]

A projector is safe — it's derived state, you truncate and rebuild. A query handler is
irrelevant, it's not event-driven, there's nothing to replay.

[VISUAL: The subscribing side-effect row, marked NO, in red.]

A **subscribing** side-effect handler is *not* safe. The effect already happened once.
Re-running it repeats it.

[VISUAL: The streaming side-effect row, marked DANGEROUS, in red.]

A **streaming** side-effect handler is worse: also not safe, and *guaranteed* to be
re-delivered, because streaming is exactly what makes it replayable.

[VISUAL: The entity row, marked YES with a footnote.]

An event-sourced entity is safe — re-applying events converges, and snapshotting makes it
fast.

[VISUAL: Final card: "projector and an email-sender behind the same annotation = design
smell".]

And that's the entire reason subscribing and streaming processors are different types. It's
also why a projector and an email sender sitting behind the same annotation is a design smell
worth pointing out in a review.

---

## Key terms for the glossary

- **Event store** — the append-only, ordered, permanent log of everything that happened.
  The source of truth.
- **Stream** — a view of the event store, one per aggregate, in order.
- **Tracked stream** — a stream that carries a position, so a processor can resume.
- **Untracked stream** — a stream with no position; every read starts at the beginning. The
  natural fit for static reference data like a list of countries.
- **Token** — a position in a stream. Either *marked* (done) or *uncommitted* (handed out,
  not finished) — the distinction that makes concurrent processors safe.
- **Replay** — reset a processor's position and re-deliver events from that point. Re-reads;
  never modifies the event store.
- **resetTokens()** — AF5 mechanism, a method on `StreamingEventProcessor`, that truncates
  tokens. Replaces AF4's stop / `resetTrackingTokens()` / start sequence, and — importantly —
  can express a *partial* replay.
- **ReplayToken** — marks where a replay started, so progress and ETA are measurable.
- **@ResetHandler** — invoked before a replay with the processor paused. A projector's job is
  usually to truncate its table. Without it, replays double-count.
- **Replay awareness** — `@AllowReplay` / `@DisallowReplay`, plus the `ReplayAware` interface
  so a handler can ask at runtime whether it's handling a replay.
- **Partial replay** — a replay that resets mid-history, so handlers receive events whose
  predecessors they never saw. Handlers must tolerate missing data.
- **Bootstrapping** — importing a legacy database by publishing creation events that represent
  current state. The usual meaning of "data loading" in an Axon project.
- **InitializingEvent** — the event type used for bootstrapping an entity.
- **Snapshotting** — periodically storing an entity's current state so stream loading is fast.
  An optimization, not a semantic change.

## Guardrails — do not say

- **Do not** name `BoundaryStreamableEventSource` or `XEventStore` as real types. Neither
  exists. The stream types are `StreamableEventSource` and `MultiStreamableEventSource`; the
  store is `EventStore` in both versions.
- Do **not** say the first pass over a stream is a replay. In AF5 it reports `REGULAR`.
- Do **not** conflate loading and replay. Loading appends to the event store; replay re-reads
  from it and never modifies it.
- Do **not** say replay is free or cheap. It's a full re-delivery, and the read model is stale
  for the duration.
- Do **not** say every handler is replay-safe. Subscribing and streaming side-effect handlers
  are not, and that asymmetry is the reason the two processor types exist.
- Do **not** imply a projection can be rebuilt without stopping *all* instances of its
  processor. A live instance interleaves with the replay and corrupts the table.
- Do **not** describe a partial replay as an edge case. It is a supported operation, and the
  docs specifically instruct handler authors to tolerate it.
- Do **not** present bootstrapping as a migration shortcut that skips the domain model. The
  initialization events are real domain events and must satisfy the same invariants.
- Do **not** claim the read model built from initialization events and from real history may
  differ slightly. They must be identical.
- Do **not** say snapshotting changes consistency. It does not; it changes load time only.
