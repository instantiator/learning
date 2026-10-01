# Axon Framework — A Vocabulary Guide

A set of short notes for developers who need to read, navigate, and change an existing
Axon codebase. Each note explains the concepts behind a piece of vocabulary you'll meet
in the source, in configuration, in logs, and in Axon Server's UI.

Everything here is derived from the official documentation at
<https://docs.axoniq.io/home/>. Where Axon Framework 4 and Axon Framework 5 use different
words for the same thing, both are given, with the Axon Framework 5 term first.

**Axon Framework 5 removes a lot, and it doesn't always rename it.** Replaced, moved, and
*removed* are three different things, and telling them apart is the single biggest source of
confusion when reading an Axon codebase. It's worth internalising the map in
[`00-getting-oriented.md`](00-getting-oriented.md) before reading anything else.

## How to use these notes

You don't need to read them in order. The intended use is: hit an unfamiliar term, read
the matching note, come back to the code.

Each note has the same shape:

Every note opens with the same two sections, and closes with the same one. The middle varies,
because the topics do.

| Section | What it's for |
|---|---|
| **Terms you'll meet** | A table of the exact identifiers, annotations, and class names in this topic. Use it to grep. |
| **The idea** | The concept, explained plainly. Each new term is defined the first time it appears. |
| *(topic-specific sections)* | The types, code, and pitfalls that matter for that topic. |
| **Version notes** | What Axon Framework 4 called it, what changed, and — importantly — what was **removed**. |
| **See also** | The other notes that cover adjacent ground. |

Each note has a matching `*.script.md` — a narrated script for generating an
informational video. See [Scripts](#scripts) below.

## The notes

| # | Note | Covers |
|---|---|---|
| 00 | [Getting oriented](00-getting-oriented.md) | CQRS, event sourcing, the two sides of the system, the AF4→AF5 rename map, how to orient yourself in a codebase |
| 01 | [Messaging core](01-messaging-core.md) | `Message`, `MessageType`, payload vs metadata, the three buses, `ProcessingContext`, interceptors |
| 02 | [Commands](02-commands.md) | Command intent, routing keys, the three handler styles, `CommandGateway` vs `CommandDispatcher`, sequencing, command exceptions |
| 03 | [Entities and aggregates](03-entities-and-aggregates.md) | Consistency boundaries, event-sourced entities, `@TargetEntityId`, `@EventTag`, entity creators, hierarchies, polymorphism |
| 04 | [Events](04-events.md) | Facts, the event store, streams, tags, appending vs publishing, event compatibility, conversion |
| 05 | [Event handlers and processors](05-event-handlers-and-processors.md) | Subscribing vs streaming processors, tokens, token stores, sequencing policies, the dead-letter queue |
| 06 | [Queries](06-queries.md) | Query intent, `@QueryHandler`, `QueryGateway`, query updates, subscription queries |
| 07 | [Projections and read models](07-projections-and-read-models.md) | Projectors, denormalised read tables, eventual consistency, consistency boundaries, when to rebuild |
| 08 | [Sagas and long-running processes](08-sagas-and-long-running-processes.md) | Sagas, and what Axon Framework 5 removed rather than renamed |
| 09 | [Data loading and replay](09-data-loading-and-replay.md) | `resetTokens()`, full and partial replay, `@ResetHandler`, `ReplayStatus`, bootstrapping data in |
| 10 | [Configuration](10-configuration.md) | `ApplicationConfigurer` and its three splits, `ConfigurationEnhancer`, `EventProcessorModule`, Spring Boot properties, the `io.axoniq` licensing boundary |
| 11 | [Axon Server](11-axon-server.md) | Contexts, clusters, replication, consumers, the connector types, default ports |
| 12 | [Testing and observability](12-testing-and-observability.md) | `AxonTestFixture`, what AF5 removed from testing, `Matchers`, metrics, processor health |

## Scripts

Every note is paired with a `*.script.md` file — for example `02-commands.script.md`
alongside `02-commands.md`. Each script is written to be fed into a tool like NotebookLM
to produce an informational video about that one topic.

A script contains:

- **Format and audience** — what the video should be and who it's for.
- **Segments** — a timed narration script, written as speakable prose, with `[VISUAL]`
  cues describing what should be on screen.
- **Key terms** — the words the narrator should pronounce deliberately, with a one-line
  definition for the on-screen glossary.
- **Guardrails** — the things the narrator must *not* say, which in Axon's case matters
  a lot because the version differences are genuinely easy to get wrong.

Upload the paired note and script together for the best result: the note is the factual
source, the script is the shape of the video.

## What's commercial

A recurring theme worth stating once, centrally. Axon splits into two namespaces, and the
split is a **licensing** boundary, not a version boundary:

- **`org.axonframework.*`** — Axon Framework, open source, both major versions.
- **`io.axoniq.framework.*`** — Axoniq Framework, commercial.

The commercial pieces you'll meet in these notes:

| Feature | Note |
|---|---|
| Axon Server connector | [`11`](11-axon-server.md) |
| Distributed query bus (external projections) | [`06`](06-queries.md), [`07`](07-projections-and-read-models.md) |
| Dead-letter queue | [`05`](05-event-handlers-and-processors.md) |
| Event transformation (`EventTransformation`) | [`04`](04-events.md) |
| Message transformation, data protection | — |
| `axoniq-testcontainer` | [`12`](12-testing-and-observability.md) |
| `@Workflow` long-running processes (preview) | [`08`](08-sagas-and-long-running-processes.md) |
| Axon Server clustering, SSO, permissions (by edition) | [`11`](11-axon-server.md) |

So: if an import says `io.axoniq.framework`, someone is holding a licence. It does **not** tell
you which major version of Axon Framework they're on.

## A note on accuracy

These notes are written against the official documentation, and the version differences are
treated as content rather than smoothed over. Some things you'll find stated here contradict
what you'll find in blog posts, Stack Overflow answers, and — in a few documented cases — the
official reference itself. Where that happens, the note says so, and gives the source.

The three traps worth knowing up front:

- **The deadlines guide under the 5.3 path serves stale Axon Framework 4 content.** It is
  currently byte-identical to the 4.13 version. See
  [`08-sagas-and-long-running-processes.md`](08-sagas-and-long-running-processes.md).
- **Several type names circulate widely but appear in no official version** — including
  `XEventStore`, `BoundaryStreamableEventSource`, `DirectQueryBus`, `ProcessingModule`,
  `AxonServerConnector`, `TransactionAwareEventStore`, `org.axontest`, and `io.axoniq.test`.
  Each is called out in the relevant note.
- **`io.axoniq.framework` is a licensing signal, not a version signal.** Axon Framework 5
  core is still `org.axonframework`.

Where the documentation doesn't settle a question, these notes mark it unverified rather than
guessing. If something here contradicts the behaviour you observe at runtime, trust the
runtime and treat the note as a bug.
