# Script — 10: Configuration

**Format:** conversational explainer, single presenter. Roughly 7 minutes 40 seconds.
**Audience:** a Java developer who needs to change how something is processed, and needs to
know which layer of configuration to touch.
**Source material:** upload `10-configuration.md` alongside this script.

---

## Segment 1 — Three layers (0:00–1:00)

[VISUAL: Three stacked shelves labelled "ANNOTATIONS", "MODULES", "PROPERTIES".]

**NARRATOR:**

Axon has three configuration layers, and most confusion in a codebase comes from not knowing
which layer a setting came from.

[VISUAL: Each shelf zooming in turn.]

**Annotations** are layer one, and they live on the code. `@EventSourcedEntity` on the
entity, `@CommandHandler` on a method, `@Namespace` on a handler class. Declarative, right
next to what it configures. The most common style.

**Modules** are layer two. A configuration enhancer contributes configurer beans to the
application. This is where thread counts, replay policies, and sequencing live.

**Properties** are layer three. `axon.*` in your YAML file. Axon Server on or off, serializer
choice, token store, pool sizes.

[VISUAL: A one-line rule, large.]

Here's the rule I'd use reading an unfamiliar codebase: **annotations say what exists, modules
say how it's processed, properties say what the environment is.**

[VISUAL: A wrong-layer example, crossed out.]

And a setting in the wrong layer is usually a bug. Pool size is not an environment fact. A
sequencing policy is not an annotation.

---

## Segment 2 — Annotations (1:00–1:45)

[VISUAL: A small class: `@EventSourcedEntity` on the entity, `@CommandHandler` on a method.]

**NARRATOR:**

Layer one in practice. The entity gets `@EventSourcedEntity`, the handler method gets
`@CommandHandler`.

Now — a trap, and it is an Axon 4 trap, not a typo trap. In Axon Framework 4 you could hang
a snapshot trigger straight off the aggregate annotation:

```java
@Aggregate(snapshotTriggerDefinition = "giftCardSnapshotTrigger")
```

That attribute is gone in Axon 5. The documentation is blunt about it: attributes you may
have used in Axon 4, "like caching, snapshotting, … are no longer supported or available in
a different way." In Axon 5 you configure snapshots with `@Snapshotting(afterEvents = 100,
afterSourcingTime = "PT5S")` on its own, or a `SnapshotPolicy` on the entity module.

---

## Segment 3 — The `io.axoniq` myth (1:45–3:00)

[VISUAL: A full-width banner: "THE BIGGEST MYTH ON THIS PAGE".]

Now — the single most important correction on this page, and it needs to be said early,
because it is wrong all over the internet.

[VISUAL: `org.axonframework.*` on one side, `io.axoniq.framework.*` on the other. A warning
triangle between them.]

**Axon Framework 5 core is still `org.axonframework`.** The `io.axoniq.framework` namespace is
not Axon 5. It's the *commercial Axoniq Framework modules*. The comparison guide puts it
exactly this way: Axon Framework modules are marked `org.axonframework`; Axoniq Framework
modules are marked `io.axoniq.framework`.

[VISUAL: The commercial list appearing: Axon Server connector, distributed messaging,
dead-letter queue, message transformation, data protection, testcontainers.]

So what moved to `io.axoniq.framework`? The things that need a licence. Which means —
[VISUAL: `io.axoniq.framework` in an import = a LICENSING signal, not a VERSION signal.] —
that `io.axoniq.framework` in an import means someone's holding a licence. Not that they're
on Axon 5.

[VISUAL: A blog post, struck through.]

If you read a post saying "Axon 5 moved everything to `io.axoniq`", it's wrong on both counts.

---

## Segment 4 — The config API restructure (3:00–4:10)

[VISUAL: One wide box labelled "Configurer" splitting into three narrower boxes.]

**NARRATOR:**

While we're here, the configuration API itself changed shape in version 5, and it's a bigger
restructure than a rename.

[VISUAL: Three boxes appearing.]

In version 4 there was one `Configurer` interface that did everything. Version 5 **split** it by
concern: a `MessagingConfigurer` for buses and processing, a `ModellingConfigurer` for
aggregates, an `EventSourcingConfigurer` for the event store and snapshots. All of them
subtypes of a common `ApplicationConfigurer`.

[VISUAL: `ConfigurerModule` crossed out, `ConfigurationEnhancer` written in.]

And `ConfigurerModule` — which you've probably seen in every version 4 example on the web — is
replaced by `ConfigurationEnhancer`.

[VISUAL: The `eventProcessing(Consumer<EventProcessingConfigurer>)` nesting, ending in
`EventProcessorModule`.]

So the shape of layer two in version 5 is: enhance the `AxonConfiguration`, reach the messaging
configurer, hand it an event-processing configurer, and configure a pooled streaming processor.
The product is an `EventProcessorModule`.

[VISUAL: A defaults animation: SequentialPerAggregatePolicy → HierarchicalSequencingPolicy.]

And one real behaviour change while we're here: the **default sequencing policy changed**.
Version 4 defaulted to sequential-per-aggregate. Version 5 defaults to
`HierarchicalSequencingPolicy`. The interface changed too — it moved from
`getSequenceIdentifierFor` to a message-and-context signature, and is now shared with command
handling.

---

## Segment 5 — The decisions in a processing config (4:10–5:10)

[VISUAL: The processing configuration again, with three things circled in turn.]

**NARRATOR:**

Back to the three decisions in a processing configuration, because these are what you actually
need to spot in a codebase.

[VISUAL: "pooled" circled.]

**Pooled.** Multiple threads per instance. Right for a projector. Wrong for an order-sensitive
handler. Getting this wrong is how a handler that must be sequential ends up racing with
itself.

[VISUAL: The sequencing policy circled.]

**The sequencing policy.** Sequence by entity id. We covered why — strict ordering within an
entity, parallel across entities.

[VISUAL: The processor name circled, then a warning.]

**The processor name.** And this is the one people skip. A processor you can't name is a
processor you can't independently reset, monitor, or scale. Every processor should have a
stable name that shows up in your metrics and that you can type into a runbook.

[VISUAL: A red banner: "a handler that is never registered with a processor".]

And that brings us to the most common real-world finding. A `@EventHandler` bean gets found and
wired — but a processor that isn't explicitly configured runs with defaults, which typically
means no token and no replay.

[VISUAL: A symptom: "why does my projector never invoke its reset handler?"]

So if you find a projector in a codebase that can't be reset, or whose reset handler never
fires, check whether its configurer actually registers it. That's almost always the answer.

[VISUAL: `@ProcessingGroup` crossed out, `@Namespace` written in.]

And a naming note: `@ProcessingGroup` became `@Namespace` in version 5. There is no
`NamespaceProcessingModule` — if you need a module, the type is `EventProcessorModule`.

---

## Segment 6 — Properties, and the two that bite (5:10–6:10)

[VISUAL: An `application.yml`, with sections lighting up.]

**NARRATOR:**

Layer three is properties. Two deserve real comment.

[VISUAL: `axon.converter.general`, `axon.converter.events`, `axon.converter.messages` as three flat siblings.]

First: **events and messages get separate converter settings.** And they should usually
differ. Events are a permanent, published contract — change their shape and you break every
consumer, forever. Messages are often transient and internal. Sharing one setting across
both quietly couples the two, and it's an easy shortcut to take.

Two details worth getting right. These are **flat siblings** — `general`, `events`, and
`messages` sit at the same level. They are not nested, so there is no such thing as
`axon.converter.general.events`. And the word changed wholesale: Axon 4 said
`axon.serializer.*`, Axon 5 says `axon.converter.*`. That rename is documented outright.

One hard constraint: `avro` is accepted for `events` and `messages` only. It cannot be used
for `general`, which covers non-message data like snapshots.

[VISUAL: `eventhandling` — one word, circled.]

Second, a trap in the property names: it's `eventhandling`. One word, no hyphen. The
documentation's own heading is right, but the surrounding prose sometimes reads as two words,
and the resulting typo is silent.

[VISUAL: `eventhandling` — one word, circled.]

And a small trap in the property names: it's `eventhandling`. One word, no hyphen. The
documentation's own heading is right, but the surrounding prose sometimes reads as two words,
and the resulting typo is silent.

[VISUAL: A documentation page with one line crossed out: "mode: tracking".]

Finally, a genuine documentation defect worth flagging, because it will bite anyone copying
from the official reference. One page in the current version 5 reference shows
`mode: tracking`. That is not a valid 5.x value — it's residue from the version 4
`TrackingEventProcessor`. The correct value, which appears elsewhere on the same page, is
`pooled-streaming`.

[VISUAL: A paste of a wrong value, then a compiler error.]

That's the kind of mistake that costs an afternoon. If you see `mode: tracking` anywhere, it's
not a valid configuration.

---

## Segment 7 — Where configuration goes wrong (6:10–7:00)

[VISUAL: Four failure cards, each with a symptom.]

**NARRATOR:**

Configuration mistakes cluster into four recognisable patterns, and knowing them saves time.

[VISUAL: Card 1: "handler never registered".]

One: a handler that was never registered with a processor. Works in development, no token,
can't be replayed.

[VISUAL: Card 2: "two modules, same processor name".]

Two: two modules configuring the same processor name. Last one wins, non-obviously, and your
thread count becomes whichever module happened to load later.

[VISUAL: Card 3: "token store in a different database than the event store".]

Three, and this one has caused real outages: a token store pointing at a different database
than the event store. Everything works fine — until you restore from backup, one database
comes back and the other doesn't, and now your processors believe they've caught up when they
absolutely have not.

[VISUAL: Card 4: "wrong sequencing property name".]

Four: a typo in the sequencing property name. The projector is slower than expected and there
is no error, because it's silently running globally sequential.

---

## Segment 8 — Axon Server, briefly (7:00–7:40)

[VISUAL: A switch: enabled true / false, and two different backends.]

**NARRATOR:**

One last setting, since it's the first thing people look for.

`axon.axonserver.enabled` — true for Axon Server, false for a local database event store and
local buses. False is the normal development setup, mostly because a database is much easier
to inspect than a running Axon Server. You want to be able to look at what's actually in
there.

[VISUAL: `context: default`, with a note about contexts.]

And `axon.axonserver.context` selects which Axon Server *context* you connect to, which matters
as soon as you have more than one. That's the next document.

[VISUAL: An import line, with a licence tag: `io.axoniq.framework.axonserver.connector.api`.]

One last note while we're here. Those Axon Server connector types are in the `io.axoniq`
namespace — which, as we established, means a licence, not a version.

[VISUAL: Final card: "annotations say what exists. Configurers say how it's processed.
Properties say what the environment is."]

Take the three-layer rule and you can read any Axon configuration file.

---

## Key terms for the glossary

- **`ApplicationConfigurer`** — the AF5 root configuration interface; the supertype of the
  three concern-specific configurers.
- **`MessagingConfigurer`** — AF5. Buses and event processing. Replaces the single AF4
  `Configurer` for these concerns.
- **`ModellingConfigurer`** — AF5. Aggregates and entities.
- **`EventSourcingConfigurer`** — AF5. Event store and snapshotting.
- **`ConfigurationEnhancer`** — the AF5 replacement for `ConfigurerModule`.
- **`Configurer`** — the single AF4 configuration interface. **Split** in AF5.
- **`ConfigurerModule`** — **AF4 only.** Replaced by `ConfigurationEnhancer`.
- **`ComponentRegistry`** — AF5's component registry, replacing a bag of `@Bean` methods.
- **`EventProcessingConfigurer`** — reached via `MessagingConfigurer#eventProcessing(…)`;
  configures processors. Its AF5 import is not printed in the docs — infer it, then confirm.
- **`EventProcessorModule`** — the AF5 module produced for a named processor. Documented
  factory: `EventProcessorModule.pooledStreaming(String)`.
- **`EventHandlingModule` / `ProcessingModule`** — neither is an official name in any
  version. The AF4 type is `EventProcessingModule`.
- **`@Namespace`** — `org.axonframework.messaging.core.annotation.Namespace`. Declares a
  coherent set of handlers. The AF5 name; AF4 used `@ProcessingGroup`. There is no
  `NamespaceProcessingModule`.
- **`@EventSourcedEntity` / `@EventSourced`** — marks the event-sourced entity. Attributes
  are `tagKey` and `concreteTypes` (plus `idType` on the Spring `@EventSourced`). **No
  snapshot-trigger attribute** — that was Axon 4 only.
- **`@Snapshotting(afterEvents = …, afterSourcingTime = …)`** — how Axon 5 does snapshots,
  as its own annotation. (Feature restored in Axon 5.1.)
- **Converter** — turns events or messages into bytes. Axon 4 called it Serializer.
- **`axon.converter.general` vs `.events` vs `.messages`** — three flat sibling
  properties, not nested. Worth separating: events are a permanent contract, messages often
  aren't. One hard rule — **`avro` works for `events` and `messages` only, never `general`**.
- **TokenStore** — where processor positions are persisted. Must point at the same database
  as the event store, or a partial restore corrupts progress tracking.
- **`axon.axonserver.enabled`** — true for Axon Server, false for a local database event
  store. False is the normal development setup.
- **`axon.axonserver.context`** — selects which Axon Server *context* to connect to. Unchanged
  name in current documentation.
- **`axon.eventhandling`** — one word, no hyphen. A reliable typo.
- **`io.axoniq.framework`** — the **commercial Axoniq Framework modules** namespace. A
  licensing signal, *not* a version signal. AF5 core is still `org.axonframework`.
- **`HierarchicalSequencingPolicy`** — the AF5 default sequencing policy, replacing AF4's
  `SequentialPerAggregatePolicy`.
- **Pooled streaming** — multiple threads per instance. For projectors, not for
  order-sensitive handlers.
- **Multi-threading** — `pooled` for projectors, sequential for order-sensitive handlers.
  Getting this wrong makes a sequential handler race with itself.

## Guardrails — do not say

- Do **not** say annotations can configure thread counts, sequencing, or replay policy. Those
  are module-level concerns.
- Do **not** name `@InjectCommandHandlers` or `@InjectCommandHandler`. **Neither exists** —
  0 hits in any version of the official docs. The real AF5 inject annotations are
  `@InjectEntity`, `@InjectEntityId`, and `@InjectState`, and they are Axon 5 only.
- Do **not** write `axon.converter.general.events`. `general`, `events`, and `messages` are
  flat siblings. The correct names are `axon.converter.general`, `axon.converter.events`,
  `axon.converter.messages`.
- Do **not** quote `mode: tracking` as a valid 5.x configuration value. It appears in the
  official reference and it is wrong; the valid value is `pooled-streaming`.
- Do **not** say "if a handler isn't registered it won't work". It *will* work — with default
  settings, typically a subscribing processor with no token and no replay. The symptom is
  "can't reset it", not "it doesn't run".
- Do **not** present the choice of a token store's database as an implementation detail. Point
  at the backup-restore failure mode.
- Do **not** recommend Axon Server for local development by default. A local database event
  store is far easier to inspect.
- Do **not** say Axon Framework 5 moved its core packages to `io.axoniq.framework`. It did
  not. AF5 core is `org.axonframework`; `io.axoniq.framework` is the commercial namespace.
- Do **not** name `ProcessingModule` or `EventHandlingModule` as real types. The AF4 type is
  `EventProcessingModule` and the AF5 type is `EventProcessorModule`.
- Do **not** describe the config change as a rename. AF5 *split* one `Configurer` into three
  concern-specific ones.
