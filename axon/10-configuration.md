# 10 — Configuration

Axon has three configuration layers, and most confusion in a codebase comes from not knowing
which layer a setting came from.

## Terms you'll meet

| Term | Meaning |
|---|---|
| `ApplicationConfigurer` | AF5 root configuration interface |
| `MessagingConfigurer` | AF5 configurer for messaging: buses and event processing |
| `ModellingConfigurer` | AF5 configurer for aggregates and entities |
| `EventSourcingConfigurer` | AF5 configurer for the event store and snapshotting |
| `ConfigurationEnhancer` | AF5 replacement for `ConfigurerModule` |
| `ComponentRegistry` | AF5 registry of components, replacing a bag of `@Bean` methods |
| `EventProcessingConfigurer` | Configures processors |
| `EventProcessorModule` | AF5 the produced module for a named processor |
| `ConfigurerModule` | **AF4 only** |
| `@Namespace` | AF5. Declares a coherent set of handlers. Was `@ProcessingGroup` |
| `@Aggregate` | Marks an event-sourced entity as an aggregate root |
| `PropertySequencingPolicy` | Sequences events by a property — usually the entity id |
| `HierarchicalSequencingPolicy` | **The AF5 default.** Was `SequentialPerAggregatePolicy` |

## The most important thing on this page

**Axon Framework 5 core is still `org.axonframework.*`.** The `io.axoniq.framework.*`
namespace is not Axon 5 — it's the **commercial Axoniq Framework modules**. The framework
comparison docs put it exactly this way:

> "Axon Framework modules are marked with `org.axonframework`, whereas Axoniq Framework
> modules are marked with `io.axoniq.framework`."
> — <https://docs.axoniq.io/axon-framework-reference/5.3/framework-comparison/>

This matters constantly, because the things that moved to `io.axoniq.framework` are the ones
that require a licence: the Axon Server connector, distributed messaging, the dead-letter
queue, message transformation, data protection, and `axoniq-testcontainer`.

So `io.axoniq.framework` in an import is a **licensing signal**, not a version signal. If
you're reading a blog post that says "Axon 5 moved everything to `io.axoniq`", it's wrong on
both counts.

## The three layers

**Layer 1 — annotations, on the code.** `@Aggregate` on the entity, `@CommandHandler` /
`@EventHandler` on methods, `@Namespace` to group handlers. Declarative, lives next to what it
configures, and the most common style.

**Layer 2 — configurators and modules.** An `ApplicationConfigurer` (via a
`ConfigurationEnhancer`) contributes `MessagingConfigurer` and `ModellingConfigurer` beans.
Imperative, and where thread counts, replay policies, and sequencing live.

**Layer 3 — Spring Boot properties.** `axon.*` in `application.yml`. Everything the framework
can decide from configuration alone: Axon Server on or off, serializer choice, token store
type, pool sizes.

A useful rule for reading an unfamiliar codebase: **annotations say what exists, configurators
say how it's processed, properties say what the environment is.** A setting in the wrong layer
is usually a bug.

## Layer 1: annotations

```java
@EventSourcedEntity                     // org.axonframework.eventsourcing.annotation
class Course { ... }
```

In Spring, `@EventSourced` instead (`org.axonframework.spring.stereotype`), meta-annotated with
the above. Its documented attributes are `tagKey` and `concreteTypes` — plus `idType` on the
Spring variant.

> ⚠️ **You will see this in Axon Framework 4 codebases, and it does not work in AF5:**
> ```java
> @Aggregate(snapshotTriggerDefinition = "course-snapshot")   // AF4 only
> ```
> Snapshot configuration moved off the entity annotation entirely. In AF5 use
> `@Snapshotting(afterEvents = 100, afterSourcingTime = "PT5S")` on its own, or a
> `SnapshotPolicy` on the `EventSourcedEntityModule`. The migration guide is blunt: AF4
> attributes "like caching, snapshotting, … are no longer supported or available in a
> different way."

```java
@Component
@Namespace("faculty")
class CourseCommandHandler {
    @CommandHandler
    public UUID handle(CreateCourse command) { ... }
}
```

`@Namespace` is the AF5 replacement for `@ProcessingGroup` —
`org.axonframework.messaging.core.annotation.Namespace`. It groups handlers so they can be
addressed and tracked as a unit.

> **Note:** there is no `NamespaceProcessingModule`. If you need a module for a namespace, the
> AF5 type is `EventProcessorModule`.

## Layer 2: the configurators

In Axon Framework 4, one `Configurer` interface did everything, and `ConfigurerModule` supplied
beans to it. Axon Framework 5 **split** that interface by concern:

| AF4 | AF5 | Package |
|---|---|---|
| `Configurer` (one interface) | `MessagingConfigurer` | `org.axonframework.messaging.core.configuration` |
| | `ModellingConfigurer` | `org.axonframework.modelling.configuration` |
| | `EventSourcingConfigurer` | `org.axonframework.eventsourcing.configuration` |
| | `ApplicationConfigurer` (the common supertype) | `org.axonframework.common.configuration` |
| `ConfigurerModule` | `ConfigurationEnhancer` |
| `AxonConfiguration` | still exists in AF5 (`org.axonframework.common.configuration`) — it was `Configurer`/`DefaultConfigurer` that got replaced |
| `SnapshotTriggerDefinition` on `@Aggregate` | `SnapshotPolicy` on the entity module, or `@Snapshotting(afterEvents, afterSourcingTime)` |
| `@Aggregate(snapshotTriggerDefinition = "…")` | **gone** — no snapshot attribute on the entity annotation |
| `axon.serializer.general` / `.events` / `.messages` | `axon.converter.general` / `.events` / `.messages` (flat siblings, not nested) | `org.axonframework.common.configuration` |

The migration guide's wording is that `ConfigurerModule` "has been replaced by
`ConfigurationEnhancer`".

```java
public class AxonConfigEnhancer extends ConfigurationEnhancer {

    @Override
    public void enhanceConfiguration(AxonConfiguration config) {
        config.messagingConfigurer(mc -> mc.eventProcessing(ep ->
            ep.pooledStreaming(Processors.pooledStreaming("course-statistics", c -> c
                .sequencingPolicy(PropertySequencingPolicy.builder()
                                      .propertyName("courseId")
                                      .build())
                .eventHandlingComponents(ec -> ec
                    .declarative("courseStatistics",
                                 cfg -> new CourseStatisticsProjector(repository)))))));
    }
}
```

> **Signature caveat, stated honestly.** The *shape* above is what the official AF5 docs
> describe: a `ConfigurationEnhancer` contributing to `AxonConfiguration`, reaching
> `MessagingConfigurer#eventProcessing(Consumer<EventProcessingConfigurer>)`, then
> `pooledStreaming(...)`. The exact method name and the `Processors.pooledStreaming(…)` helper
> are the parts the documentation does not print verbatim. Treat the nesting as correct and the
> exact spelling as something to confirm against your IDE — this is exactly the kind of thing
> that shifts between 5.x patches.

> **Package caveat, stated honestly.** `EventProcessingConfigurer` is confirmed to exist in
> Axon Framework 5 and is the entry point reached through
> `MessagingConfigurer#eventProcessing(Consumer<EventProcessingConfigurer>)`, but the official
> documentation does not print its import anywhere. By its position alongside
> `EventHandlingComponentsConfigurer` it belongs in
> `org.axonframework.messaging.eventhandling.configuration` — but treat that as inference, and
> let your IDE's autocompletion confirm it. (The docs' "import and package changes" link on
> the projector migration page is a dead anchor, which is part of why they don't.)

Three things in that snippet are decisions, not boilerplate:

- **pooled streaming** — multiple threads per instance. Right for a projector, wrong for an
  order-sensitive handler.
- **sequenced by `courseId`** — the ordering policy. See
  [`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md).
- **named processor** — because a processor you can't name is a processor you can't
  independently reset, monitor, or scale.

> **Version markers.** `EventProcessorModule` lives in
> `org.axonframework.messaging.eventhandling.configuration`, and the documented factory is
> `EventProcessorModule.pooledStreaming(String)` — a **single** argument. The two-argument
> `(String, Consumer)` form is not in the documentation. Similarly,
> `PooledStreamingEventProcessorsConfigurer` is
> `org.axonframework.messaging.eventhandling.processing.streaming.pooled`.
>
> And a real default change: the default sequencing policy moved from
> `SequentialPerAggregatePolicy` (AF4) to **`HierarchicalSequencingPolicy`** (AF5). The
> `SequencingPolicy` *interface* also changed shape — it moved from
> `getSequenceIdentifierFor(T)` to `Optional<Object> sequenceIdentifierFor(Message,
> ProcessingContext)`, and is now shared with command handling.

**Registering the processor matters.** An `@EventHandler` bean is found and wired, but a
processor that isn't configured explicitly runs with defaults — which typically means no token
and no replay. If a projector in a codebase can't be reset, check whether its configurer
registers it.

## Layer 3: Spring Boot properties

```yaml
axon:
  axonserver:
    enabled: true
    context: tenant-42
  serializer:
    general:
      events: jackson
      messages: jackson
  eventhandling:
    processors:
      course-statistics:
        mode: pooled-streaming
        source: eventStore
```

Two of these deserve comment.

**Separate converters for events and messages.** `axon.converter.general`,
`axon.converter.events`, and `axon.converter.messages` are three **flat sibling** properties
— not nested, so `axon.converter.general.events` does not exist. They should usually differ
in practice. Events are a permanent, published contract — changing their shape is a breaking
change for every consumer, forever. Messages are often transient and internal. Sharing one
config across both is a common shortcut that quietly couples the two.

One hard constraint: `avro` is accepted for `events` and `messages` only, never for `general`
(which covers non-message data such as snapshots).

**`eventhandling` is one word.** Not `event-handling`. The docs' own heading is
`axon.eventhandling`, but the prose sometimes reads as two words, and it's a reliable typo.

> **Documentation defect, worth knowing:** the current 5.x reference shows
> `mode: tracking` in at least one example. That is not a valid 5.x value — it's residue from
> the AF4 `TrackingEventProcessor`. The valid value, which appears elsewhere in the same
> document, is `pooled-streaming`.

> **Context selection:** the property is `axon.axonserver.context`. The Axon Server
> multi-context documentation states applications connect "by setting the
> `axon.axonserver.context` property when using Spring Boot, or setting the `defaultContext`
> on the builder of `AxonServerConnectionManager`". Outside Spring, use
> `AxonServerConfiguration.builder().context(…)`. See
> [`11-axon-server.md`](11-axon-server.md).

## Serialization

Events are stored, so their format is permanent. This is the single most consequential
configuration decision in an event-sourced system.

| Choice | Notes |
|---|---|
| Jackson | Common default. Compact, widely understood |
| XStream | Common in older services. `XStreamSerializer`, and migration code that reads it |
| Protobuf / Avro | Schema-enforced, best for interop, needs schema registry discipline |
| Java serialization | Compact, but brittle across version changes |

`axon.converter.events` and `axon.converter.messages` are configured separately, and Axon
lets you use a different converter per scope. (Note the Axon 4 spelling was
`axon.serializer.*` — that prefix rename is documented outright.)

The rule for reading a codebase: if events are stored as XML, look for `XStreamSerializer` and
for migration code that reads it. That code is a liability that outlives the framework
version.

## Axon Server connection

```yaml
axon:
  axonserver:
    enabled: true
    context: default
```

With `enabled: true`, Axon Server is auto-configured. Setting it to `false` switches to a
local event store (JPA by default) and local buses, which is the usual development setup — a
database is much easier to inspect than a running Axon Server.

The Axon Server connector types live in `io.axoniq.framework.axonserver.connector.api` —
`AxonServerConfiguration` and `AxonServerConnectionManager`. The Maven artifact is
`axon-server-connector`, registered by a `ServerConnectorConfigurationEnhancer`.

> Note that these *are* in the `io.axoniq.framework` namespace — so importing them is a
> licensing signal, as above.

## Where things usually go wrong

Configuration mistakes in Axon codebases cluster into a few recognisable patterns.

**A handler that's never been registered with a processor.** Works in development, has no
token, can't be replayed. Symptom: a projector that never gets its reset handler invoked.

**Two configurers configuring the same processor name.** Last one wins, non-obviously, and
thread counts end up as whichever loaded later.

**A token store pointing at a different database than the event store.** Works, until a
restore from backup where one came back and the other didn't — and then processors think
they've caught up when they haven't.

**Sequencing configured on the wrong property name.** The projector is slower than expected
with no error, because it's running with a default that's stricter than you assumed.

## Version notes

| Axon Framework 4 | Axon Framework 5 |
|---|---|
| `org.axonframework.config.Configurer` | split into `MessagingConfigurer` / `ModellingConfigurer` / `EventSourcingConfigurer` |
| `ConfigurerModule` | `ConfigurationEnhancer` |
| `AxonConfiguration` | still exists in AF5 (`org.axonframework.common.configuration`) — it was `Configurer`/`DefaultConfigurer` that got replaced |
| `SnapshotTriggerDefinition` on `@Aggregate` | `SnapshotPolicy` on the entity module, or `@Snapshotting(afterEvents, afterSourcingTime)` |
| `@Aggregate(snapshotTriggerDefinition = "…")` | **gone** — no snapshot attribute on the entity annotation |
| `axon.serializer.general` / `.events` / `.messages` | `axon.converter.general` / `.events` / `.messages` (flat siblings, not nested) |
| bean-of-@Bean-methods | `ComponentRegistry` |
| `EventProcessingModule` | `EventProcessorModule` |
| `EventHandlingModule` | **not an official name in any version** |
| `@ProcessingGroup("name")` | `@Namespace("name")` |
| `TrackingEventProcessor` | `PooledStreamingEventProcessor` / `SubscribingEventProcessor` |
| `SequentialPerAggregatePolicy` (default) | `HierarchicalSequencingPolicy` (default) |
| `SequencingPolicy#getSequenceIdentifierFor(T)` | `SequencingPolicy#sequenceIdentifierFor(Message, ProcessingContext)` |
| `EventStore` | `EventStore` (same name; default impl `StorageEngineBackedEventStore`) |
| `AxonServerConfiguration` in `org.axonframework.axonserver.connector` | `io.axoniq.framework.axonserver.connector.api` |
| `axon.axonserver.context` | `axon.axonserver.context` (unchanged) |
| `mode: tracking` | `mode: pooled-streaming` |

## See also

- [`11-axon-server.md`](11-axon-server.md) — contexts, and what the connection properties
  actually do.
- [`05-event-handlers-and-processors.md`](05-event-handlers-and-processors.md) — the settings
  these configurators set.
- [`03-entities-and-aggregates.md`](03-entities-and-aggregates.md) — `@Aggregate` and
  repository choice.
