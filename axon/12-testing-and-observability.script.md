# Script — 12: Testing and observability

**Format:** conversational explainer, single presenter. Roughly 6–7 minutes.
**Audience:** a Java developer writing their first tests in a codebase with a
`CourseTest`, who wants to understand the pattern — and who will hit a wall if the notes
don't tell them which framework version the test API belongs to.
**Source material:** upload `12-testing-and-observability.md` alongside this script.

---

## Segment 1 — The shape of a test (0:00–1:05)

[VISUAL: A test class. `given` → `when` → `then()`.]

**NARRATOR:**

Event-sourced testing has one big advantage and one big complication.

[VISUAL: The advantage: a test reads like a script.]

The advantage: a test is a *script*. You describe what happened, you do one thing, you assert
what followed. No mock setup, no arranging a container.

[VISUAL: The complication: "the state was thrown away, so you must rebuild it".]

The complication: you've thrown away the object, so you have to construct its history before
you can test it.

[VISUAL: A `CourseTest` class, line by line.]

Here's the shape. Build a fixture for the aggregate. `given` establishes prior state. `when`
dispatches. `then()` asserts.

[VISUAL: A rename arrow: AggregateTestFixture → AxonTestFixture, with packages on either
side.]

And a version note, because this is the single biggest change in the whole test API. In
version 4 the fixture was `AggregateTestFixture`, in `org.axontest`… no, in
`org.axonframework.test.aggregate`. In version 5 it's a single unified type called
`AxonTestFixture`, in `org.axonframework.test.fixture`. The old fixture and the saga fixture
were both replaced by it.

[VISUAL: Two package names struck through: org.axontest, io.axoniq.test.]

And while we're here: two package names that appear all over the internet and in **no** version
of the official documentation. `org.axontest` and `io.axoniq.test`. Neither is real. If a
codebase imports either, it's working from a third-party source.

---

## Segment 2 — Why `given` takes events (1:05–2:10)

[VISUAL: Two setup paths. Left: setters, producing a course with a negative enrollment count.
Right: events, producing the same state honestly.]

**NARRATOR:**

Here's the part I'd internalise, because it's more than a style preference.

[VISUAL: The setter path, with an impossible state appearing.]

You can build prior state with setters. Don't. A test that calls a setter can construct a state
the real system can never reach — a course with a negative enrollment count, or one that exists
without ever having been created. That test passes. It tells you nothing.

[VISUAL: The event path.]

Building it with events means the test constructs the state production would actually construct.
And every test setup is itself a claim that those events are valid — if a test needs an
impossible state, you find out immediately, because the event that would produce it gets
rejected.

[VISUAL: A summary card.]

So a good event-sourced suite does double duty: it tests the commands, and it tests that the
events can build the state.

---

## Segment 3 — What AF5 took away (2:10–3:40)

[VISUAL: A large "REMOVED IN AF5" panel, filling in item by item.]

**NARRATOR:**

This is the segment to pay attention to, because these are capabilities you will genuinely
miss — and the documentation is unusually clear about them.

[VISUAL: Item 1: "time manipulation".]

**One: time manipulation is gone.** Version 4's test executor had `whenTimeElapses`,
`whenTimeAdvancesTo`, `givenCurrentTime`, and deadline assertions. The version 5 documentation
says time manipulation "is not yet available, as deadline are not yet supported." And that
chains straight back to the deadline removal we covered earlier. There is no `TestScheduler`
in any version, and no replacement.

[VISUAL: Item 2: "expectState".]

**Two: `expectState` is gone.** It existed in version 4 and took a lambda over the resulting
state. Version 5 says it is not available "as state-stored entities are not yet available." So
asserting on the state of a state-stored entity — which is how you'd test a projector with this
fixture — isn't currently possible.

[VISUAL: Item 3: "no whenRebuilt".]

**Three: there's no `whenRebuilt`.** That name appears in no official version. And **four**:
`SagaTestFixture`, the saga test fixture, has no version 5 replacement at all.

[VISUAL: A screenshot of the deadlines guide, with a red "STALE" stamp.]

And the trap: the deadlines guide served under the 5.3 path is stale version 4 content —
byte-identical to 4.13, still showing `AggregateTestFixture` and `whenTimeElapses`. It is not
updated. Don't read it as current.

---

## Segment 4 — Observing messages (3:40–4:20)

[VISUAL: A recording enhancer slotting into the fixture.]

**NARRATOR:**

In version 4 you constructed a recording executor to capture what was published. In version 5
that's handled by a `MessagesRecordingConfigurationEnhancer`, and the documentation calls it
"required to allow verification to succeed for the fixture" — without it, the fixture can't
capture dispatched commands or published events.

[VISUAL: `@AxonSpringBootTest` — auto-registration, a green check.]

And if you're in a Spring Boot test it's already registered for you. So this is one upgrade
that genuinely gets easier.

[VISUAL: `Matchers`, labelled "works in both versions".]

One thing that didn't change: `Matchers` exists in both versions, in the same package, and it's
the supported way to assert on individual fields of an event.

---

## Segment 5 — Testing a projector (4:20–5:10)

[VISUAL: A projector test, with the assertion moved out of the fixture and onto the
repository.]

**NARRATOR:**

Testing a projector. The fixture's `given` phase does the hard part — it already knows how to
build state from events.

[VISUAL: A crossed-out `expectState`.]

But here's the constraint: `expectState` is unavailable in version 5. So you assert on the
database directly, right after the fixture runs. Fine — arguably clearer, since the read model
*is* the thing under test.

[VISUAL: Two rules, each highlighted hard.]

Two rules that make projector tests worth writing, and neither needs fixture support.

[VISUAL: Invoking the reset handler and asserting the table is empty.]

One: **test the reset handler explicitly.** Call it, assert the table is empty afterwards. A
projector with a broken reset handler passes every other test and then corrupts itself on the
first real rebuild.

[VISUAL: An enrolment event with no preceding CourseCreated.]

Two: **test with a partial event list.** Hand it an enrolment with no preceding
course-created, and assert it tolerates it. That's the partial-replay scenario, and it's the
only way to know whether your projector is genuinely tolerant or just looks tolerant.

---

## Segment 6 — Integration and Axon Server (5:10–5:50)

[VISUAL: A Spring Boot test, then a Testcontainers box running Axon Server.]

**NARRATOR:**

Two levels above the fixture.

[VISUAL: Highlight the assertion going through a query.]

Spring context tests, for wiring. And note where the assertion goes: **through a query**, not
by loading the aggregate. Asserting on the read side is what actually tests the read side.

[VISUAL: `AxonServerContainer`, with struck-through alternatives.]

And for anything involving Axon Server, note what's *not* there: there's no
`AxonServerExtension`, no `AxonServerTestExtension`, and no `Transactor` in any official
version. What's documented is `AxonServerContainer` — a Testcontainers-based Axon Server. And
isolation between tests comes from the container's scope, not from a transactor.

---

## Segment 7 — Observability (5:50–6:50)

[VISUAL: Three gauges: LATENCY, CAPACITY, COUNTER.]

**NARRATOR:**

The other half, which matters more in production than the test suite does.

[VISUAL: Each gauge appearing with its question attached.]

Three metrics, each answering a *different* question. That's why you want all three.

**Latency**: how far behind are we? High during a replay is expected; high otherwise is a
problem.

**Capacity**: could this keep up if traffic doubled? The reference documentation suggests 0.8
on a single thread is a warning sign — either a performance problem, or that segment should be
split.

**Counter**: is the flow what we expect? A drop outside your normal range deserves
investigation before anything breaks.

[VISUAL: An actuator health page reporting processor health.]

And processor health is in the Spring Boot actuator, which makes it a natural alert target.

[VISUAL: A projection silently stuck, unnoticed for hours.]

Because this is the failure mode that goes unnoticed: a processor that has quietly stopped
advancing. Nothing throws. The read model is just increasingly wrong, and the dashboard shows a
lag nobody was looking at.

---

## Segment 8 — Priorities (6:50–7:20)

[VISUAL: A prioritised list, six items, first two highlighted.]

**NARRATOR:**

In priority order: command tests on aggregates, most of your suite. Invariants, via expected
exceptions — if your exception types are meaningful, these read as specifications. Then reset
handlers on projectors. Then partial-event tolerance. Then integration paths through the whole
chain. And concurrency last, because those tests are valuable but painful.

[VISUAL: A crossed-out list: "don't test the framework".]

And one thing not to test: the framework. Don't assert that `@CommandHandler` invokes your
method.

[VISUAL: Final card: "given uses events, not setters. know which version's fixture you have.
watch latency, capacity, counter."]

Three takeaways: `given` uses events, not setters. Know which version's fixture you have,
because the APIs genuinely differ. And watch latency, capacity, and counter.

---

## Key terms for the glossary

- **`AxonTestFixture`** — the AF5 fixture, `org.axonframework.test.fixture`. Replaced both
  `AggregateTestFixture` and `SagaTestFixture` with a single unified type.
- **`AggregateTestFixture`** — the AF4 fixture, `org.axonframework.test.aggregate`.
- **`org.axontest` / `io.axoniq.test`** — package names that appear in zero official pages.
  Not real.
- **Event-based `given`** — constructing prior state from events rather than setters, so test
  setups are always states the real system could reach.
- **`then()` phase** — the AF5 assertion phase: `events(…)`, `noEvents()`, `exception(…)`,
  `success()`, `eventsMatch(…)`, `resultMessageSatisfies(…)`, `commands(…)`, `await(…)`.
- **`MessagesRecordingConfigurationEnhancer`** — AF5. "Required to allow verification to
  succeed for the fixture." Auto-registered by `@AxonSpringBootTest`.
- **`@AxonSpringBootTest`** — `org.axonframework.extension.springboot.test`. Auto-registers
  the recording enhancer.
- **`Matchers`** — `org.axonframework.test.matchers`. Field-level assertions. Present in
  **both** versions.
- **Time manipulation (AF4 only)** — `whenTimeElapses`, `whenTimeAdvancesTo`,
  `givenCurrentTime`. **Not available in AF5.**
- **`TestScheduler`** — not a real type in any official version.
- **`expectState` (AF4 only)** — asserted on resulting state. **Not available in AF5.**
- **`whenRebuilt()`** — not a real method in any official version.
- **`SagaTestFixture`** — AF4 only, with **no AF5 replacement**.
- **`AxonServerContainer`** — Testcontainers-based Axon Server,
  `io.axoniq.framework.testcontainer`. The documented way to test against Axon Server.
- **`AxonFrameworkExtension` / `@ProvidedAxonTestFixture`** — AF5's JUnit 5 fixture-supply
  mechanism. AF4 used `StubAggregateLifecycleExtension`.
- **Latency** — gap between publish and handling. Answers "how far behind are we?"
- **Capacity** — how busy a processor is. Answers "could it keep up if traffic doubled?"
- **Counter** — events per second. Answers "is the flow what we expect?"
- **`EventProcessorHealthIndicator`** — actuator health for processors, and a sensible alert
  target for silently-stalled processors.

## Guardrails — do not say

- Do **not** name `org.axontest` or `io.axoniq.test` as real packages. Neither appears anywhere
  in the official documentation.
- Do **not** present `AggregateTestFixture` as the current API. It is Axon Framework 4; AF5 uses
  `AxonTestFixture`.
- Do **not** suggest `expectState` is available in AF5, or `whenRebuilt` is a real method.
  Neither is.
- Do **not** claim the AF5 test API can manipulate time. It explicitly cannot, and
  `TestScheduler` is not a real type.
- Do **not** recommend `Thread.sleep` as the alternative for time-dependent tests in AF5.
  There is no documented answer; say so rather than inventing one.
- Do **not** name `AxonServerExtension`, `AxonServerTestExtension`, or `Transactor`. None
  exist officially. Use `AxonServerContainer`.
- Do **not** read the deadlines guide's 5.3 path as current. It serves stale AF4 content.
- Do **not** say the fixture is only for unit testing. It's also the natural way to drive a
  projector, and to test event-derived invariants.
- Do **not** suggest asserting on the write side in an integration test. Query the read side,
  or the test doesn't cover the read side at all.
- Do **not** claim latency above zero indicates a problem during a replay. That's expected.
- Do **not** present the 0.8 capacity figure as a hard limit. It's a prompt to investigate.
- Do **not** recommend testing the framework's own dispatch machinery or serialization
  round-trips, except for reading back events after a schema change.
