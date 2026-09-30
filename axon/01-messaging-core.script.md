# Script — 01: The message

**Format:** conversational explainer, single presenter. Roughly 5–6 minutes.
**Audience:** a Java developer who can read the Axon source but keeps getting lost in the
framework's own vocabulary.
**Source material:** upload `01-messaging-core.md` alongside this script.

---

## Segment 1 — Everything is a message (0:00–0:45)

[VISUAL: Three boxes labelled COMMAND, EVENT, QUERY sit above a larger box labelled
MESSAGE. Lines connect each of them down into MESSAGE.]

**NARRATOR:**

Here's a claim that will save you a lot of time: in Axon, *everything is a message*.

Not "most things". Everything. When you send a command, you're sending a message. When an
event processor picks something off a stream, it's a message. When you write a `@QueryHandler`,
it's still a message underneath.

Commands, events, and queries are just three flavours. Learn the base shape, and the three
flavours are just three sets of rules on top.

---

## Segment 2 — Payload plus metadata (0:45–2:00)

[VISUAL: A message box splits in two. Left side labelled "PAYLOAD" holds an object diagram.
Right side labelled "METADATA" holds a key-value list. A caption across the bottom:
"the payload is yours · the metadata is Axon's".]

**NARRATOR:**

A message is two things glued together.

The **payload** is your domain object. `EnrollStudentCommand` with a course id and a student
id. That's yours, you wrote it, you own its shape.

The **metadata** is a map of framework-managed information sitting alongside it. And this
is the part worth internalising, because it tells you where to put things.

[VISUAL: The four "Axon-generated" metadata rows light up one at a time.]

Axon fills in several of these automatically. There's a message id. There's a timestamp.
There's a **correlation id**, which groups together every message triggered by one user
action. There's a **causation id**, which points back at the message that directly caused
this one. And there's a type entry.

[VISUAL: The "userId" metadata row lights up, in a different colour, labelled
"you put this here".]

Then there's room for your own. Anything that isn't part of the message's *identity* but
you still need to travel with it — the acting user, the tenant, the request ID — goes in
metadata, not in the payload.

Why does that matter? Two reasons. Change your command class next month and the metadata is
untouched. And you can log the entire envelope without deserialising anything.

---

## Segment 3 — Identity is not the class (2:00–3:10)

[VISUAL: Title card — "A MESSAGE'S IDENTITY ISN'T ITS JAVA CLASS". A `MessageType` chip
appears: `faculty.IssueStudentTranscript v1.0.0`.]

**NARRATOR:**

Now, this is the Axon Framework 5 idea I think is most worth your attention, and it's the
one people coming from Axon Framework 4 find most surprising.

In Axon Framework 4, a message *was* your class. You renamed the class, you changed the
message. Full stop.

Axon Framework 5 separates the two. A message has a **message type** — a qualified name
and a version — and that is what routing keys off. The Java class is one possible
representation of that type.

[VISUAL: One `MessageType` chip in the middle. Two classes grow arrows into it:
a record with strongly-typed `StudentId`, and a record with a plain `String`.]

So two different Java classes can be the same command. And that buys you something
specific: **payload conversion**. A service that's moved on to using a `CustomerId` value
object can still receive commands from a service that hasn't. Axon converts the payload
to whatever type the handler asks for, using something called a `Converter`.

This is why upcasters — the old tool for "the shape of my message changed" — mostly
disappear for commands. The docs are explicit that they're still needed for *stored
events*, because those are frozen on disk. For commands, conversion is the right answer.

[VISUAL: Sidebar note appears: "no annotation? name = fully-qualified class name, version
= 0.0.1. The docs disagree on that version default — set it explicitly."]

One practical tip. If you don't annotate your message, Axon uses your fully-qualified class
name and a default version. The documentation actually contradicts itself about what that
default version is — one page says one thing, another says another. So just set the
version explicitly and the question never comes up.

---

## Segment 4 — Three buses, one big difference (3:10–4:20)

[VISUAL: Three lanes. COMMAND BUS, EVENT BUS, QUERY BUS. Each shows a return arrow —
except the event bus, where the return arrow is drawn as a dashed cross-out.]

**NARRATOR:**

There are three buses, one per message type. Commands go on one, events on another,
queries on a third. Two of them behave the way you'd expect. One does not.

Command: you send it, you get a result or an exception back. You find out what happened.

Query: you send it, you get an answer. You find out what happened.

Event: you send it, and... nothing comes back. No result. No acknowledgement. **Nobody
tells you whether it worked.**

[VISUAL: The cross-out on the event bus's return arrow pulses.]

Sit with that for a second, because it's the structural reason for most of Axon's
behaviour. An event is a statement that something already happened. It's a fact, not a
request. There's nobody to answer.

And the consequences ripple outward. The read side can't be synchronous with the write
side, because there's no handshake. If an event handler chokes on an event three seconds
later, the sender has long since moved on. That failure shows up in a different place
entirely — a dead-letter queue, a stuck processor, an error handler.

This is why Axon is eventually consistent, and why it can't be otherwise without
abandoning the architecture. It's not a limitation someone should go fix. It's the shape
of the thing.

---

## Segment 5 — ProcessingContext (4:20–5:10)

[VISUAL: A single message enters a bracketed region labelled "ProcessingContext". Phases
appear along a timeline: pre-invocation, invocation, prepare-commit, commit, after-commit.]

**NARRATOR:**

Whenever Axon handles a message, it opens a **processing context**. That's the
transactional scope for that one message: everything appended inside it gets stored
together, or none of it does.

The context has a fixed lifecycle, and you can hook any phase of it. The one you'll use
most is *after commit*.

[VISUAL: Code snippet fades in.]

```java
appender.append(new CardIssued(id, amount));

context.runOnCommit(ctx -> notifyBank(id));
```

That's the replacement for a pattern that used to be a liability. "Append the event, and
*then* send the email." If the append fails, you've emailed somebody about a card that
was never issued. `runOnCommit` means the email only goes out if the event actually
stored.

The context also carries a resource map for the duration of the message. That's how the
event store knows which database connection and which transaction to use. The appender you
were handed is bound to this context — that's the mechanism that turns "append an event"
into "append an event inside this transaction".

[VISUAL: Corner tag: "Axon Framework 4 called this UnitOfWork, reached through a static
CurrentUnitOfWork.get()".]

In Axon Framework 4 this was called a *unit of work*, and you got to it through a static
thread-local. Same idea. Axon Framework 5 hands it to you as a parameter, which is both
tidier and much easier to test.

---

## Segment 6 — Parameters get filled in for you (5:10–5:55)

[VISUAL: A handler signature with slots dropping into place: payload, Metadata,
@MetadataValue("userId"), ProcessingContext, EventAppender, and a Spring bean.]

**NARRATOR:**

Last thing, and this one saves the most typing.

You don't declare what a handler method needs. Axon looks at the parameters and fills them
in. The first parameter is always the payload — unless you want the whole envelope, in
which case you tell it which message the method is for.

So a handler can ask for the command payload, the whole message, the metadata map, or a
single metadata value with an annotation. It can ask for the processing context. It can ask
for the event appender, or the command dispatcher. It can ask for any Spring bean.

Event handlers get a few extras. The **original timestamp** — note that, the time the
event was *generated*, not the time it was handled; those can be very different during a
replay. The **tracking token** and **segment**, if a streaming processor is driving it. And
**`ReplayStatus`**, which tells you whether you're being called for a normal event or a
replay. That last one is the key to writing handlers that are safe to replay, and we'll
come back to it.

[VISUAL: Small credit: "the mechanism is called a ParameterResolver, and you can add your
own — that's how a codebase ends up with a @AuthenticatedUser that just works."]

The mechanism is called a *parameter resolver*, and you can plug in your own. That's how a
codebase ends up with a custom annotation that just works.

---

## Key terms for the glossary

- **Message** — the base abstraction: a typed payload plus framework-managed metadata.
- **Payload** — the domain object a message carries. Yours.
- **Metadata** — the framework's key/value side-channel. Axon's.
- **MessageType** — a qualified name plus a version. A message's logical identity, separate
  from its Java class.
- **QualifiedName** — namespace plus name, e.g. `faculty.IssueStudentTranscript`.
- **Payload conversion** — converting a message's payload to whatever type a handler
  declares, so two services can disagree about representation and still interoperate.
- **Bus** — the component that accepts one kind of message and routes it to handlers.
- **ProcessingContext** — the unit of work for a single message: transaction scope, resource
  map, and lifecycle hooks. The AF4 name is `UnitOfWork`.
- **ParameterResolver** — the component that fills a handler method's parameters.
- **Interceptor** — code wrapping dispatch or handling. Dispatch interceptors run before
  routing; handler interceptors run around the handler.
- **correlationId / causationId** — metadata that links a message to the chain of messages
  that produced it.

## Guardrails — do not say

- Do **not** say events "acknowledge" or "return a result". They do not. This is the single
  most important accuracy point in the video; get it right even if it seems harsh.
- Do **not** describe the event bus as fire-and-forget *because the framework is lazy*.
  The reason is structural: an event is a fact, not a request.
- Do **not** state a default message version. The official docs contradict themselves on
  it. Say "a default, and the docs disagree — set it explicitly."
- Do **not** say Axon Framework 5 is backwards compatible with 4. The APIs were renamed
  deliberately; there is a migration guide and OpenRewrite recipes, not a compatibility
  layer.
- Do **not** conflate Axon Framework 4's `correlationId` with Axon Framework 5's. They are
  different concepts that share a word; AF5's old name is now `causationId`.
- Do **not** promise that a `ProcessingContext` hook runs even if a later step throws. The
  commit hooks don't, by design — that's the point of them.
- Do **not** describe metadata as "headers you can rely on being populated by you". Axon
  populates the correlation and causation entries itself.
