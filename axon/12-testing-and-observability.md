# 12 — Testing and observability

Testing an event-sourced system has one big advantage and one big complication. The advantage:
a test is a *script*, not a mock setup. The complication: you've thrown away the state, so
you have to construct it.

And in Axon Framework 5, the test API was replaced wholesale — plus several capabilities were
removed outright. This page is as much about what you *can't* do as what you can.

## Terms you'll meet

| Term | Meaning |
|---|---|
| `AxonTestFixture` | **AF5** main fixture. `org.axonframework.test.fixture` |
| `AggregateTestFixture` | **AF4** fixture. `org.axonframework.test.aggregate` |
| `FixtureConfiguration` / `TestExecutor` / `ResultValidator` | The three AF4 stage interfaces |
| `MessagesRecordingConfigurationEnhancer` | AF5. Required so verification can succeed |
| `Matchers` | `org.axonframework.test.matchers`. Exists in both versions |
| `AxonServerContainer` | Testcontainers-based Axon Server, for tests |
| `AxonFrameworkExtension` | AF5 JUnit 5 extension. With `@ProvidedAxonTestFixture` |
| `EventProcessorHealthIndicator` | Spring Boot actuator health for processors |
| Latency / Capacity / Counter | The three processor metrics worth watching |

## The headline: `AxonTestFixture`

Axon Framework 5 replaced the old fixture classes with a single unified type. From the AF5
migration documentation:

> `AggregateTestFixture` and `SagaTestFixture` … have been replaced by a single, unified
> `AxonTestFixture`.
> — <https://docs.axoniq.io/axon-framework-reference/5.3/migration/paths/test-fixtures/>

| | Axon Framework 4 | Axon Framework 5 |
|---|---|---|
| Fixture | `AggregateTestFixture<T>` | **`AxonTestFixture`** |
| Package | `org.axonframework.test.aggregate` | `org.axonframework.test.fixture` |
| Saga fixture | `SagaTestFixture` | **no replacement** |
| `TestExecutor` | `org.axonframework.test.aggregate` (interfaces) | `org.axonframework.test.fixture` |
| `ResultValidator` | AF4 | `then()` phase in AF5 |
| `StubTestExecutor` | named in the AF4 docs | **not named in any official version** |

> **Two names that are not real, and that spread anyway:** `org.axontest` and `io.axoniq.test`
> appear in **zero** pages of the official documentation. If a codebase imports either, it's
> working from a third-party source, not from Axoniq's docs.

## The shape of a test

```java
class CourseTest {

    private AxonTestFixture fixture;   // AF4: AggregateTestFixture<Course>

    @BeforeEach
    void setUp() {
        fixture = AxonTestFixture.for(Course.class);
    }

    @Test
    void enrolsWhenCapacityAllows() {
        fixture.givenNoPriorActivity()
               .when(CommandBus.class, new EnrolStudent("student-1"))
               .then().success()
               .events(new StudentEnrolled("course-1", "student-1"));
    }

    @Test
    void rejectsWhenFull() {
        fixture.given(CourseCreated.forCourse("course-1").withCapacity(1),
                      new StudentEnrolled("course-1", "student-0"))
               .when(CommandBus.class, new EnrolStudent("student-1"))
               .then().exception(CourseFullException.class);
    }
}
```

That's the shape. `given` builds prior state from **events**, not from setters. `when`
dispatches. `then()` asserts.

> **Shape caveat, stated honestly.** The AF5 fixture uses a fluent *phase* API — `then()`
> followed by `events(…)`, `noEvents()`, `exception(…)`, `success()`, `resultMessagePayload(…)`,
> `resultMessageSatisfies(…)`, `eventsSatisfy(…)`, `eventsMatch(…)`, `commands(…)`,
> `await(Duration)`, and `expect(…)`, with `and()` for chaining. The exact factory method on
> `AxonTestFixture` is not spelled out in the documentation, so confirm the constructor with
> your IDE. The *phases* and the assertion vocabulary are documented and those are what
> matter.

The `given`-from-events design is not a stylistic choice, and it's the part worth
internalising.

## Why `given` uses events

Constructing prior state with **events** means the test constructs the same state the
production system would. A test that calls a setter can produce a state the real system can
never reach — a course with a negative enrollment count, or one that exists without ever having
been created. Such a test passes and tells you nothing.

Constructing it with events means every test setup is itself a claim that the events are valid.
If a test needs an impossible state, you find out immediately, because the event that produces
it is rejected.

So a well-written test suite for an event-sourced system is doing double duty: it tests the
commands, and it tests that the events can build the state.

## What AF5 removed from testing

This is the section to read twice, because these are capabilities you will genuinely miss.

**Time manipulation is gone.** The AF4 `TestExecutor` had `whenTimeElapses(Duration)`,
`whenTimeAdvancesTo(Instant)`, and `givenCurrentTime(Instant)`, plus deadline assertions
(`expectScheduledDeadline*`, `expectNoScheduledDeadline*`, `expectDeadlinesMet`). The AF5
documentation states:

> `whenTimeElapses(Duration)` / `whenTimeAdvancesTo(Instant)` — Time manipulation is not yet
> available, as deadline are not yet supported.

The reason is the deadline removal described in
[`08-sagas-and-long-running-processes.md`](08-sagas-and-long-running-processes.md). There is
no `TestScheduler` in any official version, and no replacement. Time-dependent tests have to
work differently in AF5.

**`expectState` is gone.** It existed on AF4's `ResultValidator`, taking a `Consumer<T>`. In
AF5 the documentation says it is "not available as state-stored entities are not yet
available". So asserting on the state of a state-stored entity — which is how you'd test a
projector with this fixture — is not currently supported.

**There is no `whenRebuilt()`.** That method name appears in no official version. The closest
documented thing is invoking a reset directly.

**`SagaTestFixture` has no AF5 replacement.** If you were testing sagas with a fixture, there
is no migration target.

> **A documentation trap.** The deadlines *guide* served under the 5.3 path is, at the time of
> writing, stale AF4 content — byte-identical prose to the 4.13 version, still showing
> `AggregateTestFixture` and `whenTimeElapses`. It is not updated for AF5. Don't read it as
> current.

## Observing messages

In AF4 you'd construct a recording executor to capture what was published. In AF5 that's
handled for you by **`MessagesRecordingConfigurationEnhancer`**, in
`org.axonframework.test.fixture`. The documentation describes it as "required to allow
verification to succeed for the fixture", because without it the fixture cannot capture
dispatched commands and published events.

It's also auto-registered by `@AxonSpringBootTest`
(`org.axonframework.extension.springboot.test`, from the `axon-spring-boot-starter-test`
artifact), so in a Spring Boot test you get it without doing anything.

`Matchers` in `org.axonframework.test.matchers` exists in **both** versions and is the
supported way to assert on individual fields of an event.

## Integration testing

Above the fixture, two levels.

**Spring context tests:**

```java
@AxonSpringBootTest
class CourseIntegrationTest {

    @Autowired CommandGateway commands;

    @Test
    void enrols() {
        UUID id = commands.sendAndWait(new CreateCourse("Advanced Java", 10), UUID.class);
        commands.sendAndWait(new EnrolStudent(id.toString(), "student-1"), Void.class);

        // assert via a query, not by reading the write side
    }
}
```

Note the assertion goes through a **query**, not by loading the aggregate. Asserting on the read
side is what tests the read side.

**Axon Server tests.** There is no `AxonServerExtension` or `AxonServerTestExtension` in any
official version. The documented approach is **`AxonServerContainer`** /
`AxonServerContainerUtils` in `io.axoniq.framework.testcontainer` — a Testcontainers-based
Axon Server. (The package was `org.axonframework.test.server` in 5.0 and moved in Axoniq
Framework 5.1.) Isolation between tests comes from the container's scope.

The other AF5 tool is `AxonFrameworkExtension` with `@ProvidedAxonTestFixture` and
`AxonTestFixtureProvider`, for supplying a fixture into a JUnit 5 test. In AF4 the equivalent
was `StubAggregateLifecycleExtension`.

## Testing a projector

The fixture's `given` phase does the hard part for you — it already knows how to build state
from events. The constraint in AF5 is that **`expectState` is unavailable**, so you assert on
the database directly rather than through the fixture:

```java
class CourseStatisticsProjectorTest {

    @Autowired CourseStatisticsRepository repository;

    @BeforeEach void reset() { repository.truncate(); }

    @Test
    void countsEnrolments() {
        fixture.given(new CourseCreated("course-1", 10),
                      new StudentEnrolled("course-1", "student-1"),
                      new StudentEnrolled("course-1", "student-2"))
               .whenHandling(...)
               .then().success();

        assertThat(repository.findById("course-1").enrolled()).isEqualTo(2);
    }
}
```

Two rules that make projector tests worth writing, neither of which needs fixture support:

1. **Test the reset handler explicitly.** Invoke it and assert the table is empty afterwards. A
   projector whose reset handler is broken will pass every other test and corrupt itself on
   the first rebuild.
2. **Test with a partial event list.** Give the projector an enrolment with no preceding
   `CourseCreated`, and assert it tolerates it. This is the partial-replay scenario from
   [`09-data-loading-and-replay.md`](09-data-loading-and-replay.md).

## Observability

Three processor metrics are worth a dashboard, and they answer three different questions.

**Latency** — the gap between an event being published and being handled. *How far behind are
we?* High during a replay; high otherwise means a problem.

**Capacity** — how busy it is. *Could it keep up if traffic doubled?* The reference
documentation suggests 0.8 on a single thread is a warning sign: either a performance problem,
or that segment should be split.

**Counter** — events per second. *Is the flow what we expect?* A drop outside your normal
range deserves investigation before anything breaks.

Per-processor status — where it is now, where a replay started, whether it's in an error
state — comes from `ReplayStatus` for streaming processors, and from
`EventProcessorHealthIndicator` in the Spring Boot actuator.

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, metrics
```

`/actuator/health` will report processor health, which makes it a natural thing to alert on.
A processor that has silently stopped advancing is the failure mode that otherwise goes
unnoticed for a long time.

## What to test, in priority order

1. **Commands on aggregates**, via the fixture. The bulk of a healthy suite.
2. **Invariants**, via `then().exception(…)`. If the exception types are meaningful, these are
   readable specifications.
3. **Reset handlers**, on every projector that has one.
4. **Partial-event tolerance**, on projectors that assume ordering.
5. **Integration paths** through command → event → projection → query.
6. **Concurrency**, sparingly. The `whenConcurrentCommands` style tests are worth having for
   aggregates with real contention, and are painful to write everywhere else.

## What not to test

- **The framework.** Don't assert that `@CommandHandler` invokes your method.
- **Serialization round-trips**, except for one genuine case: events you must read back after
  a schema change. Test that migration explicitly.
- **Infrastructure**, except at the seam where a real bug class lives (Axon Server context
  selection, transaction boundaries).

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `org.axonframework.test.aggregate.AggregateTestFixture` | `org.axonframework.test.fixture.AxonTestFixture` |
| `FixtureConfiguration` / `TestExecutor` / `ResultValidator` | `given` / `when` / `then()` phases |
| `ResultValidator#expectState(Consumer<T>)` | **not available** |
| `whenTimeElapses`, `whenTimeAdvancesTo`, `givenCurrentTime` | **not available** |
| `expectScheduledDeadline*`, `expectDeadlinesMet` | **not available** (no deadlines) |
| `SagaTestFixture` | **no replacement** |
| recording executor | `MessagesRecordingConfigurationEnhancer` |
| `StubAggregateLifecycleExtension` | `AxonFrameworkExtension` + `@ProvidedAxonTestFixture` |
| `AxonServerExtension` | `AxonServerContainer` (Testcontainers) |
| `org.axontest` | **not a real package in any version** |
| `io.axoniq.test` | **not a real package in any version** |
| `org.axonframework.test.matchers.Matchers` | same package, both versions |
| `EventProcessorHealthIndicator` | same |
| `axon.metrics.enable` | Micrometer actuator metrics |

## See also

- [`03-entities-and-aggregates.md`](03-entities-and-aggregates.md) — the invariants you're
  asserting.
- [`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md) — the
  metrics' meaning.
- [`08-sagas-and-long-running-processes.md`](08-sagas-and-long-running-processes.md) — why
  time manipulation is gone from the test API.
