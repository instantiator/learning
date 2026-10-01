# 03 — Entities and aggregates

The **entity** is the write side's memory and its rule enforcer. Axon Framework 4 called it
an **aggregate**; Axon Framework 5 renamed it. If you're reading an existing codebase,
this is the term to sort out first.

## Terms you'll meet

| Term | Meaning |
|---|---|
| Entity | A stateful component on the command side that enforces business rules |
| Aggregate | The Axon Framework 4 name for the same thing |
| Consistency boundary | The region of state that must change atomically |
| Event-sourced entity | An entity whose state is rebuilt by replaying its event stream |
| `@EventSourcedEntity` | Marks a class as an event-sourced entity (plain Java) |
| `@EventSourced` | The Spring Boot equivalent annotation |
| `@EventSourcingHandler` | Applies an event to a state field. No business logic |
| `@EntityCreator` | Marks the constructor or factory that builds a fresh instance |
| `@TargetEntityId` | On a command payload: *which* entity to load |
| `@EventTag` | On an event: which entity stream this event belongs to |
| `EventSourcedRepository` | Loads and stores entities; created for you |
| `EntityChildMetamodel` / `@EntityMember` | Wire child entities into a parent |
| Polymorphic entity | An abstract parent with concrete subtypes chosen at creation |

## The idea

An entity is a **stateful component on the command side that accumulates state from prior
commands and uses it to enforce business rules when handling new ones.**

Three things follow from that definition, and they answer most of the questions you'll have
reading the code:

1. If a command needs state to decide, it needs an entity.
2. If it doesn't, it should be a **stateless command handler** — cheaper, no loading, no
   lock.
3. The entity is a **consistency boundary**. It's loaded, changed, and saved under a single
   lock, so two commands touching the same entity are serialised.

### Why the rename?

The DDD term *aggregate root* comes from DDD literature and describes a specific idea: a
consistency boundary with a guarantee of *invariant* — that no other part of the system can
modify its state directly.

Axon Framework 5 dropped the term because it read as a reference to the DDD book rather than
to what the thing does. The behaviour is unchanged. If you find `@Aggregate` in a
codebase, that's the same object with the older name.

## The single most important rule

> **Command handlers validate and append events; they must never write to state fields.
> Event sourcing handlers update state; they must contain no business logic.**

This is stated twice in the documentation, and it deserves a full explanation, because
breaking it is the classic Axon bug.

Event sourcing handlers run in two situations:

- while a command is being handled, to update state from the event just appended
- while the entity is being **loaded**, replaying the whole stream to rebuild state

Those second runs are the problem. If an event sourcing handler contains a business rule —
"if capacity is exceeded, throw" — then that rule fires every single time the entity is
loaded, including on every command that touches it, including long after the events
themselves happened. You'll get exceptions about historical events, and they'll surface in
places that have nothing to do with the original command.

So: **validate in the command handler, assign in the event sourcing handler.** Nothing
else goes in an event sourcing handler.

The corollary from the docs: an entity should only hold the state needed to make decisions
about incoming commands. If a field is never read by a command handler, you don't need to
track it here — that's read-side state, and it belongs in a projection.

## Anatomy of an event-sourced entity

```java
@EventSourcedEntity(tagKey = "courseId")
public class CourseEntity {

    private String courseId;
    private int capacity;
    private int enrolledCount;

    @CommandHandler
    public static String handle(CreateCourse cmd, EventAppender appender) {
        if (cmd.capacity() <= 0) {
            throw new IllegalArgumentException("Capacity must be positive");   // validation
        }
        appender.append(new CourseCreated(cmd.courseId(), cmd.title(), cmd.capacity()));
        return cmd.courseId();
    }

    @CommandHandler
    public void handle(EnrollStudent cmd, EventAppender appender) {
        if (enrolledCount >= capacity) {                                       // validation
            throw new IllegalStateException("Course is full");
        }
        appender.append(new StudentEnrolled(courseId, cmd.studentId()));
    }

    @EventSourcingHandler
    private void on(CourseCreated event) {                                     // assignment
        this.courseId = event.courseId();
        this.capacity = event.capacity();
    }

    @EventSourcingHandler
    private void on(StudentEnrolled event) {
        this.enrolledCount++;
    }

    @EntityCreator
    protected CourseEntity() { }
}
```

Four kinds of member, and it's worth knowing which is which:

| Member | Form | Job |
|---|---|---|
| Creational command handler | `static` method | Handle the command that creates the entity |
| Instance command handler | instance method | Handle commands on an existing entity |
| Event sourcing handler | instance method | Apply an event to a field. **No logic** |
| Entity creator | constructor or static factory | Tell Axon how to build the initial instance |

## Two identifiers, and they are not the same thing

This trips up almost everyone. There are two different identifiers involved, and they
answer different questions.

### `@TargetEntityId` — which instance to load

On the **command** payload. Tells Axon which entity instance the command is about, so it
can load it before calling your handler.

```java
import org.axonframework.modelling.annotation.TargetEntityId;

public record EnrollStudentCommand(@TargetEntityId String courseId, String studentId) {}
```

Not required on a creational handler — there's nothing to load yet.

### `@EventTag` — which stream to read

On the **event** payload. Tells Axon which entity's event stream this event belongs to, so
it can filter when loading.

```java
import org.axonframework.eventsourcing.annotation.EventTag;

public record CourseCreatedEvent(@EventTag String courseId, String title, int capacity) {}
```

And the entity declares which key to filter on:

```java
@EventSourcedEntity(tagKey = "courseId")
```

`tagKey` **must match the field name used in `@EventTag`**. The docs suggest setting it
explicitly so it stays stable if the class is renamed.

### And a third thing, which is not either of those

`@Command(routingKey = "…")` sets the routing key used by a distributed command bus — such
as Axon Server — to route the command to the correct application node. The docs are
explicit: **it does not affect which entity instance is loaded.**

So a command can carry up to three distinct notions of "who", and you need all of them in
the right place. Conflating `@TargetEntityId` and `routingKey` is the most common
misunderstanding in this area.

## Entity creators

Every event-sourced entity needs a way to build a fresh instance before its events are
replayed. Three forms, and the choice is about mutability.

### No-argument creator — for mutable entities

```java
.entityFactory(c -> EventSourcedEntityFactory.fromNoArgument(CourseEntity::new))
```

```java
@EntityCreator
protected CourseEntity() { }
```

Axon calls it each time the entity needs to be reconstructed. State starts empty; events
fill it in.

### Identifier-based creator — when the id is known and never changes

```java
.entityFactory(c -> EventSourcedEntityFactory.fromIdentifier(id -> new CourseEntity(id)))
```

```java
@EntityCreator
protected CourseEntity(@InjectEntityId String courseId) { this.courseId = courseId; }
```

`@InjectEntityId` is **mandatory** here, to disambiguate the parameter from an event
payload. Without it, the first parameter is assumed to be the event — the form below.

The payoff is immutability: `courseId` can be declared `final`, because it's fixed at
construction and never touched by an event sourcing handler.

### First-event-based creator — for fully immutable entities

```java
.entityFactory(c -> EventSourcedEntityFactory.fromEventMessage((id, firstEvent) -> {
    CourseCreatedEvent e = firstEvent.payloadAs(CourseCreatedEvent.class);
    return new CourseEntity(e.courseId(), e.capacity());
}))
```

```java
@EntityCreator
protected CourseEntity(CourseCreatedEvent event) { ... }
```

State comes from the first event. Subsequent state changes produce a *new* instance
returned from the `@EventSourcingHandler`. **With this form, command handlers must be
split** into creational (static) and instance handlers.

The docs make the trade-off explicit: the identifier-based and first-event-based forms are
"the foundation for immutable entities — by passing required state into the constructor,
fields can be declared `final` and the entity's identity is fixed from the moment of
creation."

## Three ways to configure an entity

### Declarative — no annotations at all

Full manual wiring. Verbose, but nothing is magic and you can see every wire.

```java
configurer.registerEntity(
    EventSourcedEntityModule.declarative(String.class, CourseEntity.class)
        .messagingModel((config, model) -> {
            MessageTypeResolver resolver = config.getComponent(MessageTypeResolver.class);
            return model
                .creationalCommandHandler(
                    resolver.resolveOrThrow(CreateCourseCommand.class).qualifiedName(),
                    (command, context) -> {
                        CourseEntity.create(command.payloadAs(CreateCourseCommand.class),
                                           EventAppender.forContext(context));
                        return MessageStream.empty().cast();
                    })
                .instanceCommandHandler(
                    resolver.resolveOrThrow(EnrollStudentCommand.class).qualifiedName(),
                    (command, entity, context) -> {
                        entity.enroll(command.payloadAs(EnrollStudentCommand.class),
                                      EventAppender.forContext(context));
                        return MessageStream.empty().cast();
                    })
                .entityEvolver((entity, event, context) -> {
                    if (event.type().qualifiedName()
                             .equals(resolver.resolveOrThrow(CourseCreatedEvent.class).qualifiedName())) {
                        entity.on(event.payloadAs(CourseCreatedEvent.class));
                    }
                    return entity;
                })
                .build();
        })
        .entityFactory(c -> EventSourcedEntityFactory.fromNoArgument(CourseEntity::new))
        .criteriaResolver(c -> (id, ctx) -> EventCriteria.havingTags(Tag.of("courseId", id)))
        .entityIdResolver(c -> new AnnotationBasedEntityIdResolver<>())
        .build()
);
```

The three pieces worth recognising:

- **`criteriaResolver`** — tells Axon which events belong to this entity's stream, via
  tags. This is the `@EventTag`/`tagKey` pair in functional form.
- **`entityIdResolver`** — reads `@TargetEntityId` from the command payload. Replace it with
  your own `EntityIdResolver` when the id needs computing.
- **`entityEvolver`** — the functional form of an event sourcing handler. For immutable
  entities it returns a *new* instance; for mutable ones it returns the same one.

### Autodetected — annotations only

```java
@EventSourcedEntity(tagKey = "courseId", concreteTypes = {OnlineCourse.class, InPersonCourse.class})
public class CourseEntity { /* @CommandHandler, @EventSourcingHandler, @EntityCreator */ }
```

```java
configurer.registerEntity(
    EventSourcedEntityModule.autodetected(String.class, CourseEntity.class)
);
```

The first argument is the identifier type, the second the entity class. The autodetected
flow reads `@CommandHandler`, `@EventSourcingHandler`, `@EntityCreator`, and `@EntityMember`
from the class.

### Spring Boot

```java
@EventSourced
public class CourseEntity { ... }
```

No configuration class at all. This is the one you'll see in most Spring Boot codebases.

## Hierarchies: parent and child entities

An **entity hierarchy** is a parent entity that owns one or more child entities. Commands
and events are routed directly to the appropriate child, keeping each child's state
self-contained.

**The important caveat, and it's a performance one:**

> Child entities share the same consistency boundary as their parent: a command targeting
> a child loads the entire parent hierarchy first. For large or independently managed
> collections, a separate entity with its own lifecycle may be a better fit.

So a parent with ten thousand children is a bad idea. Children are for small, bounded
structures — a course's enrolments, an order's line items.

Three ways to declare a child field: a single field, a `List<Child>`, or a `Map<Key, Child>`
(the map's keys are independent of the routing key and are preserved automatically as
children are added, evolved, or removed).

With annotations:

```java
@EventSourcedEntity(tagKey = "courseId")
public class CourseEntity {

    @EntityMember(routingKey = "studentId")
    private final List<EnrollmentEntity> enrollments = new ArrayList<>();
}
```

`routingKey` is required when the parent holds multiple children of the same type; it can
be omitted for a single child field. And note the rule the docs state: **children are
created in the parent's `@EventSourcingHandler`, never in a command handler.**

Routing then works from the command payload:

```java
public record DropEnrollment(@TargetEntityId String courseId,   // load the parent
                             String studentId,                  // route to the right child
                             String reason) {}
```

`@TargetEntityId` identifies the *parent*. The other field matches the `routingKey` on
`@EntityMember`.

Three failure modes to recognise in a log:

| Exception | Cause |
|---|---|
| `ChildEntityNotFoundException` | No child matched the routing key. Usually the child hasn't been created yet |
| `DuplicateCommandHandlerSubscriptionException` | Both parent and child declare a handler for the same command. Thrown at startup |
| (missing) | For custom routing you supply both a `commandTargetResolver` *and* an `eventTargetMatcher`. The docs say **both are required** |

## Polymorphic entities

Several concrete types sharing an abstract parent, each with its own handlers. The concrete
type is chosen at creation and **never changes**.

```java
@EventSourcedEntity(tagKey = "courseId", concreteTypes = {OnlineCourse.class, InPersonCourse.class})
public abstract class CourseEntity {

    @EntityCreator
    public static CourseEntity create(CourseCreated event) {
        return switch (event.courseType()) {
            case ONLINE    -> new OnlineCourse(event);
            case IN_PERSON -> new InPersonCourse(event);
        };
    }
}
```

Subtypes need no annotations of their own — Axon scans everything listed in `concreteTypes`.
**Spring Boot caveat:** do *not* annotate subtypes with `@EventSourced`. They're already
discovered, and since it's a Spring `@Component` stereotype, annotating them creates
unnecessary beans.

When to use it, per the docs: if the variants differ only by a flag or enum value, a single
entity with conditional logic is simpler. Reach for polymorphism when the variants have
structurally different commands, state, or behaviour.

Two constraints worth knowing: for non-sealed classes, subtypes not listed in
`concreteTypes` are **silently ignored** — their handlers won't register and commands
targeting them fail at runtime. For sealed classes, all leaf types are discovered
automatically. And parent fields read by subtype constructors must be at least
`protected`.

## Loading and storing

You rarely touch this directly, but you'll read it in stack traces.

`Repository<ID, E>` (specifically `EventSourcedRepository`) is created for you when you
register an entity. Its operations:

```java
CompletableFuture<ManagedEntity<ID, E>> load(ID id, ProcessingContext ctx);
CompletableFuture<ManagedEntity<ID, E>> loadOrCreate(ID id, ProcessingContext ctx);
ManagedEntity<ID, E> persist(ID id, E entity, ProcessingContext ctx);
```

Two things to know: every operation **requires an active `ProcessingContext`**, and changes
persist when that context commits. That's why `EventAppender` is context-aware.

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `@Aggregate` / `@AggregateRoot` | `@EventSourcedEntity` (plain) / `@EventSourced` (Spring) |
| `@AggregateIdentifier` on events | `@EventTag` |
| `@TargetAggregateIdentifier` | `@TargetEntityId` + `@Command(routingKey)` |
| `@CreationPolicy(CREATE_IF_MISSING…)` | **explicitly removed.** Use a stateful/stateless command handler, or `@ForcedEntityCreator` for the same semantics |
| `@FieldAccessor` | 0 hits anywhere; write plain getters |
| `AggregateFactory` *(a component/interface, not an annotation)* | no like-for-like. `EventSourcedEntityFactory` (declarative) + `@EntityCreator` (required for instantiation) — complementary, not a replacement |
| `Repository<E>` — *note: AF4 already had this; there is no `AggregateRepository`* | `Repository<ID, E>` (adds the ID type param, plus `loadOrCreate`/`persist`) |
| `AggregateLifecycle.apply(…)` | `EventAppender.append(…)` |
| `@EventSourcingHandler` | unchanged — but 0 hits for `onSourcingEvent`, so don't claim it as a historical name |
| `AbstractAnnotatedAggregateRoot` | 0 hits in AF5; examples use plain classes and records |
| `@AggregateMember` | `@EntityMember` (adds `routingKey` support) |
| `EntityCache`, and `@Aggregate` caching attributes | gone — "no longer supported or available in a different way". But see the caching caveat below |
| state-stored aggregates supported | "not yet available" per the test-fixtures page — though `ModellingConfigurer` is described as adding stateful entities, so this one is soft |
| concurrency resolved by `ConflictResolver` | 0 hits in AF5; handled by routing + sequencing |

### The caching caveat — read this before you plan around it

Entity and aggregate caching is the shakiest claim in this note, and the reason is that the
official documentation contradicts itself. The aggregate-migration page states that AF4
`@Aggregate` attributes "like caching, snapshotting, … are no longer supported or available
in a different way", and `EntityCache` has zero hits in the AF5 docs. But the AF5
**caching page itself** is stale: it still says caching is "not available in AF5.1" and
"will be reintroduced in 5.2" — neither of which is true of a 5.3 reference.

So the honest position for 5.3 is: **unresolved in the docs.** Don't promise a developer
that caching exists, and don't promise them it doesn't. If caching is a requirement, verify
against the version you're actually shipping.

The same caution applies to state-stored entities. The test-fixtures page says
`expectState(Consumer<T>)` is "not available as state-stored entities are not yet available",
which reads like a blanket absence — yet `ModellingConfigurer` is separately described as
adding "stateful entities without event sourcing". Both statements are official. Treat
"AF5 core is event-sourced only" as a strong default, not a verified prohibition.

## See also

- [`02-commands.md`](02-commands.md) — the three handler styles in more depth.
- [`04-events.md`](04-events.md) — tags, streams, and the event store behind all this.
- [`09-data-loading-and-replay.md`](09-data-loading-and-replay.md) — what happens when an
  entity is reconstructed from its stream.
