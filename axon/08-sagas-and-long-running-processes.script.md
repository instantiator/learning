# Script — 08: Sagas and long-running processes

**Format:** conversational explainer, single presenter. Roughly 6–7 minutes.
**Audience:** a Java developer who found `@Saga` or a "process manager" in a codebase and
needs to know which version's machinery they're looking at, and whether they should be
worried.
**Source material:** upload `08-sagas-and-long-running-processes.md` alongside this script.

---

## Segment 1 — The problem (0:00–1:00)

[VISUAL: Three separate boxes — Stock, Payment, Shipping — with a single order arrow trying
to touch all three. A wall between them.]

**NARRATOR:**

Start with the problem. Ordering something involves checking stock, taking payment, and
requesting shipping. Three aggregates. Possibly three services. And a database transaction
cannot span them, because a transaction can't cross a service boundary.

[VISUAL: A chain: reserve stock → take payment → request shipping. One link breaks. A
backwards arrow appears: cancel stock.]

So what do you do? You don't roll back. You **compensate**. You publish "release the stock"
as a new event. The compensation is itself an event — auditable, replayable, visible.

[VISUAL: The word SAGA, with a footnote: "from the database concept: each step has a step
that undoes it".]

That's a saga. The name comes from the database transaction concept, where you can't have a
real atomic transaction across these operations, only a chain of compensations that leaves
you consistent in the end.

[VISUAL: A headline card: "and then Axon Framework 5 deleted the whole thing."]

Now the part that catches people out, and the reason this page exists.

---

## Segment 2 — What AF5 actually did (1:00–2:10)

[VISUAL: The official migration page, with the key sentence highlighted verbatim.]

**NARRATOR:**

Here is the official statement, and I want to read it rather than paraphrase it, because the
paraphrases are where this goes wrong.

[VISUAL: The sentence, large, on screen: "Axon Framework 5 has no Saga construct. Replace it
with existing core framework building blocks. The familiar @Saga stereotype and related APIs
will not be ported to the Axon Framework 5 core."]

Three words in there matter. "No saga construct." "Building blocks." And: **will not be
ported to the core.**

[VISUAL: A big cross over "moved to Axon Platform".]

So let's kill a very common misconception. A lot of blog posts, and a lot of confident
Stack Overflow answers, say sagas "moved to Axon Framework" or "to Axon Platform". They did
not. **The feature was removed.** Not relocated, not deprecated, not renamed. Removed.

[VISUAL: A struck-through list of gone types: @Saga, @StartSaga, @EndSaga, SagaLifecycle,
SagaStore, SagaRepository.]

Gone from the core: `@Saga`, `@StartSaga`, `@EndSaga`, `SagaLifecycle`, `SagaStore`,
`SagaRepository`.

[VISUAL: A struck-through name: EventStreamableSagaStore.]

And one more, because it's a name that has spread around the internet without appearing in
any official version of the Axon documentation: `EventStreamableSagaStore`. If you meet it in
a codebase, trace where the idea came from before you trust it.

[VISUAL: A quote card: "your regular event store, a repository of your own, an event-sourced
entity, or nothing".]

So what does `SagaStore` map to? Read that list again, because it *is* the migration guidance:
your regular event store, a repository of your own, an event-sourced entity, or nothing. There
is no saga-specific storage any more. You choose.

---

## Segment 3 — The AF4 mechanism, for reading old code (2:10–3:10)

[VISUAL: An AF4 process manager class, appearing in stages.]

**NARRATOR:**

You will still meet this in Axon 4 codebases, and in documentation of uncertain vintage. So
here's the mechanism.

[VISUAL: Highlight `@Saga` on the field. Zoom: "a prototype".]

`@Saga` is on a *field*, and the framework creates a new instance of the class per distinct
value of that field. Effectively one instance per order.

[VISUAL: Highlight the correlation key argument. Show the event arriving and being routed to
the right instance.]

The second argument on `send` is a **correlation key**, and it routes the *incoming* event to
the correct instance. Notice the last handler takes no correlation key — because the handler
*is* the instance for that order.

[VISUAL: Highlight `@EndSaga`. The instance fades out.]

`@EndSaga` disposes the instance. A `SagaStore` holds the instances, usually event-sourced, so
process state survives a restart and you can inspect it.

---

## Segment 4 — What to use instead (3:10–4:20)

[VISUAL: Four plain boxes, no framework branding.]

**NARRATOR:**

The migration guide's answer is "existing core framework building blocks". And the documented
patterns are all, notably, **plain components with no framework construct involved**.

[VISUAL: Each of the four approaches appearing in turn.]

State in a repository of your own. State derived from the events in the processing context.
State in an event-sourced entity modelling the process. Or vertical slices — restructure so
each step lives in the aggregate that owns it.

[VISUAL: The common thread, spelled out.]

The common thread is that **there's no construct left**. Correlation — the thing sagas actually
existed to solve — is now something you design yourself.

[VISUAL: `@Workflow` — with a "commercial / preview" stamp.]

Where correlation *is* solved for you, it's commercial. `@Workflow`, in the Axoniq Framework.
And note that "preview" is doing real work in that sentence. That is not something to plan a
production migration around without talking to Axoniq first.

---

## Segment 5 — `axon-legacy`, and a deadline (4:20–5:10)

[VISUAL: A module labelled `axon-legacy`, version 5.4.0, with three caveats stacked beside it.]

**NARRATOR:**

Axon 5 *does* restore the AF4 APIs, via a module called `axon-legacy`, targeted at 5.4.0. Its
own documentation is careful about its status, and the caveats matter, so let me read them.

It is "a migration aid, not a supported way to write new processes." It "does not start new
saga instances" — `@StartSaga` is deprecated even in there. And until it lands, there's "no
supported way to upgrade an application with sagas in flight."

[VISUAL: A red stamp: "technical debt with a deadline".]

So if you find `@Saga` in an Axon 5 codebase, you're either on `axon-legacy` for the
transition, or the codebase predates this. Either way: technical debt, with a date attached.

---

## Segment 6 — Timeouts, and the most-repeated error (5:10–6:20)

[VISUAL: A clock. "If payment isn't confirmed in 30 minutes, cancel the order."]

**NARRATOR:**

Time-based steps are common, and here's where the single most repeated error in Axon writing
lives.

[VISUAL: `@Schedule`, `DeadlineManager`, `EventScheduler` — all struck through for AF5.]

In Axon 4 that was `@Schedule`, backed by the deadline manager, with a family of
implementations. In Axon 5, the official statement is: "Axon Framework 5 has no built-in
deadline scheduling. Use other capabilities to get the same effect. The same applies to the
DeadlineManager and related APIs."

[VISUAL: A big correction card: "scheduled events did NOT replace @Schedule".]

So let me be blunt, because this is wrong all over the internet: **scheduled events did not
replace `@Schedule`.** There is no Axon replacement. If you read otherwise, that source is
wrong.

[VISUAL: The two documented replacements.]

There are two documented replacements, and both are honest about their nature. One is
Axoniq Framework Workflows — `sleep` and explicit timeouts, commercial, preview. The other is
a pattern, not a type: a **deadline projection** built purely from events, plus a periodic
sweep that sends an idempotent command. The docs describe it as replacing "a deadline manager
with a deadline projection". Notice that wording — nothing named, because nothing is named.

[VISUAL: A screenshot of the deadlines guide, with a red "STALE" stamp.]

And a documentation trap. The deadlines *guide* served under the 5.3 path is, right now, stale
AF4 content — it's byte-identical to the 4.13 version, and it still tells you to use a
`DeadlineManager`. Don't read it as a 5.3 statement.

[VISUAL: `@Scheduled` with a label: "this one is Spring's".]

Related: the `@Scheduled` annotation in that guide is **Spring's** annotation, not an Axon one.
Easy to misread as an Axon replacement for `@Schedule`. It isn't.

---

## Segment 7 — The takeaway (6:20–6:50)

[VISUAL: An event arriving at a single handler that cannot tell which order it refers to. A
question mark.]

**NARRATOR:**

Just to close the loop on *why* this mattered. Without correlation, a "payment failed" event
carries no indication of which order it belongs to. One handler instance can't tell whether to
cancel order one or order two. That was the entire problem sagas solved.

[VISUAL: The ratio counter: "3 process managers, 40 handlers" — healthy. Then "30
hand-rolled process managers".]

And since Axon 5 gives you no construct for that, it's now an explicit design decision. A
handful alongside many handlers is healthy. Thirty hand-rolled ones is a design smell — and in
Axon 5 it's thirty of *hand-rolled*.

[VISUAL: Final card: "AF5 has no saga construct. It was removed, not renamed. Correlation is
now yours to design."]

Axon Framework 5 has no saga construct. It was removed, not renamed. And correlation is now
yours to design.

---

## Key terms for the glossary

- **Saga** — a multi-step business transaction kept consistent through compensating events
  rather than a database transaction.
- **Compensation** — an action that *undoes* a completed step, published as a new event.
  Can't roll back across services; you can compensate.
- **@Saga** — AF4 annotation on a *prototype field*. One instance per distinct field value.
  **Not ported to the AF5 core.**
- **Correlation key** — the identity that routes an incoming event to the correct process
  instance. In AF4, the second argument to `commandGateway.send`.
- **@StartSaga / @EndSaga** — AF4 lifecycle annotations. Not ported; `@StartSaga` is
  deprecated even in `axon-legacy`.
- **SagaStore / SagaRepository** — AF4 storage for saga instances. Not ported. Map onto
  "your event store, a repository of your own, an event-sourced entity, or nothing".
- **EventStreamableSagaStore** — appears in blog posts but in **no** official version of the
  Axon documentation.
- **@Schedule / ScheduleToken / EventScheduler** — AF4 time-based scheduling. Not ported.
- **DeadlineManager / @DeadlineHandler** — AF4 deadline scheduling. Not ported, and with **no
  Axon replacement**.
- **@Workflow** — Axoniq Framework (commercial, **preview**) long-running process support.
- **axon-legacy** — an AF5 module restoring the AF4 saga APIs, targeted at 5.4.0. Explicitly
  "a migration aid, not a supported way to write new processes", and it cannot start new saga
  instances.
- **Deadline projection** — the documented pattern replacing the deadline manager: a
  projection of outstanding work, plus a periodic sweep sending an idempotent command.
- **Vertical slices** — restructuring so each step of a process lives in the aggregate that
  owns it, removing the need for cross-aggregate coordination.

## Guardrails — do not say

- Do **not** describe a saga as running inside a database transaction. It exists precisely
  *because* a transaction cannot span the aggregates or services involved.
- Do **not** call a saga "self-healing" or "automatically consistent". Consistency is
  eventual and depends on compensations being correctly written and correctly triggered.
- Do **not** say sagas "moved to Axon Platform" or "to Axon Framework". **Removed from the AF5
  core.** Only `@Workflow` (commercial, preview) offers supported long-running processes, and
  deadlines have no Axon replacement at all.
- Do **not** say scheduled events replaced `@Schedule`. They did not. AF5 has no built-in
  deadline scheduling.
- Do **not** present `@Workflow` as a stable production option. It is documented as preview.
- Do **not** mention `EventStreamableSagaStore` as a real type.
- Do **not** cite the deadlines guide's 5.3 path as a 5.3 statement. It currently serves stale
  AF4 content.
- Do **not** present Spring's `@Scheduled` as an Axon replacement for `@Schedule`.
- Do **not** describe saga state as transient. In AF4 it was event-sourced in a `SagaStore`
  precisely so it could survive restarts.
- Do **not** imply the correlation key is optional. Without it, incoming events cannot be
  routed to the right instance.
