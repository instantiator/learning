# Script — 02: Commands

**Format:** conversational explainer, single presenter. Roughly 6–7 minutes.
**Audience:** a Java developer about to write their first command handler in an existing Axon
codebase.
**Source material:** upload `02-commands.md` alongside this script.

---

## Segment 1 — Intent, not action (0:00–0:50)

[VISUAL: Two class names on a whiteboard. `IncrementCount` gets a red cross through it.
`EnrollStudent` gets a green tick.]

**NARRATOR:**

Commands are the front door of an Axon application, and the first thing to understand about
them is that they name an *intent*, not an action.

Compare two names. `IncrementCount`. And `EnrollStudent`. The first is an action — the
caller has decided exactly what should happen, and the handler is expected to comply. The
second is an intent — "somebody wants a student enrolled" — and the domain gets to decide
whether that's allowed and how it works out.

Axon wants the second kind. That's why you'll see command names like `IssueGiftCard`,
`ConfirmOrder`, `EnrollStudent`. If you see `UpdateColumn` or `SetFlag`, that's usually a
sign the abstraction has leaked.

[VISUAL: A rule box appears: "A command that only validates or fetches, but changes
nothing, is probably a query."]

And one rule worth keeping: if a command doesn't actually change anything, it should
probably be a query instead. The documentation says this plainly, and it's a good code
review comment.

---

## Segment 2 — Addressed, not broadcast (0:50–2:00)

[VISUAL: Ten thousand small rectangles labelled GiftCard, spread out. One arrow descends
from a Command object and lands squarely on exactly one of them.]

**NARRATOR:**

Here's how a command is *not* like a message queue broadcast. When you send a command, it
goes to exactly one handler. One. Not a subscriber group, not a fan-out.

But if you have ten thousand gift cards, and your `IssueCard` command could apply to any of
them — how does Axon know which one?

[VISUAL: The arrow re-routes. A chip appears above it: `routingKey: cardId`.]

With a **routing key**. You name a property on the payload, and that value decides which
instance gets the command.

```java
@Command(routingKey = "cardId")
public record IssueCardCommand(String cardId, int amount, String shopId) {}
```

The framework finds that property — it'll accept a field name or a getter, `cardId` or
`getCardId` — and uses it as an address.

One gotcha the docs call out, and it's a good one. The routing key must have a *consistent*
`toString`. If two commands that should reach the same instance produce different strings,
they go to different instances, and you get concurrency conflicts that make no sense from
where you're standing.

[VISUAL: A second, separate mechanism slides in below: "SEQUENCING — which commands run
one after another". A caption: "runs AFTER routing, BEFORE the handler. Two mechanisms,
two phases."]

Now — the thing people get wrong here. There is a *second* mechanism called **sequencing**,
and it looks similar but isn't. Sequencing decides which commands run one after another
rather than concurrently. By default it keys off the same routing key. But it's a different
component, and it operates at a different point: after routing, before the handler executes.
If a blog post conflates them, ignore that post.

The useful bit about sequencing is the escape hatch. Your policy returns an
`Optional`. Return empty, and that command skips sequencing entirely and runs
concurrently with everything else. Use it for commands that genuinely don't need ordering.

---

## Segment 3 — Three kinds of handler (2:00–4:10)

[VISUAL: A three-column comparison table builds itself.]

**NARRATOR:**

Now the part that will actually save you time in the codebase, because it tells you what
a handler is going to *cost*.

There are three kinds of command handler in Axon Framework 5, and they're not
interchangeable.

[Column one lights up.]

**One: stateless.** The handler needs no prior state. Each call is independent. Use it to
send a notification, forward to an external system, dispatch a batch of sub-commands. No
entity, no read from the event store, no lock. The cheapest thing in the framework.

[VISUAL: A cautionary note: "Don't invent an entity to hold a flag that's set once and
never changes. That's a signal the command doesn't need an entity."]

The documentation is unusually blunt about the mistake here: don't invent an entity just to
hold a flag that gets set once and never changes. That's a signal the command didn't need
an entity at all. If you see a single-field, single-flag aggregate in a real codebase,
that's the smell.

[Column two lights up.]

**Two: handlers on the entity itself.** The classic domain-driven shape. The command
handler lives *on* the entity class, next to its state fields.

[VISUAL: Code snippet.]

```java
@CommandHandler
public static void handle(CreateCourse cmd, EventAppender appender) { ... }

@CommandHandler
public void handle(EnrollStudent cmd, EventAppender appender) { ... }
```

Two details that catch everybody the first time. That first handler is **`static`**. It's
the *creational* handler — the one for the command that creates the thing. There's no
entity yet, so it can't be an instance method. It returns the new identifier.

And notice the second parameter in both: `EventAppender`. In Axon Framework 4 this was
`AggregateLifecycle.apply` — a static call. Now it's injected as a parameter, and the docs
are emphatic: never construct one, never store one, never reuse it across invocations. It
carries the transaction context.

[Column three lights up.]

**Three: stateful handlers in a separate class.** The entity holds state. A different
class holds the logic and receives the already-loaded entity as a parameter.

```java
@CommandHandler
void handle(SubscribeStudentToCourse command,
            @InjectEntity Course course,
            EventAppender appender) { ... }
```

This is newer, and the docs position it as the natural fit for **Vertical Slice
Architecture** — organising code by use case rather than by entity. One handler class per
command: `SubscribeStudentToCourseHandler`. You find the logic by the thing it does, not
by the class that happens to hold the data.

---

## Segment 4 — Absent entities, and the three opt-outs (4:10–5:10)

[VISUAL: A guard booth labelled `@InjectEntity`. A request arrives. The booth either waves
it through or raises a barrier.]

**NARRATOR:**

Here's a behaviour that surprises people, and it's a deliberate design choice.

When you write a handler that takes an injected entity, the default is: **the entity must
exist.** If Axon can't find it, the command *fails*. Your handler is never called.

That applies even if your entity class has a no-argument constructor. The framework will
happily construct one — and then still fail the command, because that instance doesn't
correspond to anything real.

If you want to handle absence, you opt in, three ways.

[VISUAL: Three option cards.]

One: mark the parameter `@Nullable` and you'll get `null`. Two: wrap it in `Optional` and
you'll get an empty optional. Three — and this is the interesting one — ask for
`ManagedEntity`. That gives you a *wrapper* which is never null, but whose inner entity can
be. So `card.entity()` is nullable; `card` is not.

[VISUAL: An animation: append a CardIssued event, and the same ManagedEntity instance
updates itself in place, now non-null.]

And that third option has a genuinely useful property. Because the wrapper is never
replaced, it stays live. Append an event inside the handler, and the wrapper you already
hold reflects it. Which means a single handler can make a second decision, later on,
based on a fact that an event it just appended established.

[VISUAL: Kotlin aside: "In Kotlin, a nullable parameter works — but only with the Kotlin
extension, otherwise the framework can't tell it apart from a non-null one."]

---

## Segment 5 — Sending commands (5:10–6:00)

[VISUAL: Two labelled doors. Left: "CommandGateway — application code". Right:
"CommandDispatcher — inside a handler".]

**NARRATOR:**

Two ways to send a command, and the difference is subtle but matters.

The **command gateway** is what your application code uses. Wrap a plain object, send it,
get a result.

The **command dispatcher** is for sending commands *from inside a handler*. It has the same
methods — but it has no context parameter, because it automatically picks up the current
one. That's the entire point. Correlation data propagates to your follow-up commands
without you doing anything.

[VISUAL: A version tag: "Axon Framework 4? The blocking call was just send(). In 5 it's
sendAndWait(). And 4 used the Gateway here too."]

That's a good tell for identifying the version. On Axon Framework 4, the blocking call was
just `send`. If you see `sendAndWait`, you're on 5. And if you see a `CommandGateway`
injected into a handler, that's 4 — because 5 splits the two roles apart.

One more thing about results. A command handler can return the new entity's identifier,
some confirmation data, or the result of a synchronous multi-step workflow. And the fourth
possibility, which is really the most common: **it throws.** An exception from a command
handler *is* the result. The sender finds out.

---

## Segment 6 — Exceptions (6:00–6:40)

[VISUAL: A table of exception names, each with a one-line cause.]

**NARRATOR:**

Quick tour of the exceptions, because each one tells you something specific.

`NoHandlerForCommandException` — nothing is registered for that command type. Usually means
a rename went half-finished: you changed the class but the sender still sends the old
name.

`EntityNotFoundException` — the injected entity doesn't exist. And remember, by default
that fails the command rather than calling your handler with null.

`ChildEntityNotFoundException` — a command was routed to a child entity that isn't in the
parent's collection yet.

`DuplicateCommandHandlerSubscriptionException` — two handlers for the same command in one
entity hierarchy. This one is thrown at *startup*, which is a mercy: you find out on boot,
not in production.

[VISUAL: Final beat: "If a handler only validates and fetches but changes nothing, that's
a query wearing a command's clothes."]

---

## Key terms for the glossary

- **Command** — a message expressing an intent to change state. Named for intent, not action.
- **@Command** — declares a command's namespace, name, version, and routing key.
- **Routing key** — the value that selects which handler *instance* receives a command.
- **RoutingStrategy** — the component that extracts the routing key from a command.
- **SequencingPolicy** — decides which commands must be processed one after another.
  Distinct from routing: it runs after routing, before the handler.
- **Stateless command handler** — needs no prior state; no loading, no locking.
- **Creational command handler** — a `static` handler for the command that creates the
  entity. Returns the new identifier.
- **Instance command handler** — a method on an already-loaded entity.
- **EventAppender** — the injected way to append events; must be a handler parameter, never
  stored.
- **CommandGateway** — the public entry point for sending commands.
- **CommandDispatcher** — the in-handler equivalent; automatically uses the current
  `ProcessingContext` so correlation propagates.
- **@InjectEntity** — injects a loaded entity into a handler. Fails the command by default
  if no entity exists.
- **ManagedEntity** — a never-null wrapper whose inner entity may be null. Stays live as
  events are appended.
- **EntityNotFoundException** — the targeted entity doesn't exist.

## Guardrails — do not say

- Do **not** conflate the routing key with the sequencing policy. They are two mechanisms at
  two different phases, and conflating them is the most common error in Axon explainers.
- Do **not** say a missing entity means the handler gets `null`. It does not, by default —
  the command fails. Then describe the opt-outs.
- Do **not** say `EventAppender` is Axon Framework 4's `AggregateLifecycle.apply`. Say the
  4.x equivalent, and note that in 5 it must be injected as a parameter.
- Do **not** claim command handlers are broadcast or delivered to multiple subscribers.
  Exactly one handler, and two handlers is a startup error.
- Do **not** state a specific default value for `@Command(version = …)`. Say there's a
  default and that setting it explicitly is good practice.
- Do **not** suggest a blocking `sendAndWait` is a substitute for a query when the caller
  only wants information. It works, but it's the wrong tool.
