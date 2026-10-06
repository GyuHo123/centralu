# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **[`docs/domain-model.md`](../domain-model.md)**: the glossary. This repo has one context; this file plays
  the role the skills call `CONTEXT.md`. Wherever a skill says "`CONTEXT.md`", read and update this file instead.
  Do not create a root `CONTEXT.md` or `CONTEXT-MAP.md` beside it.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.
- **[`docs/README.md`](../README.md)**: the map of the design documents (architecture, agent host, protocol,
  apps). Decisions recorded in their decision tables carry the same weight as ADRs.

If `docs/adr/` doesn't exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The
`/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily
when a decision actually gets resolved.

## File structure

```
/
├── docs/
│   ├── domain-model.md        ← glossary (the skills' CONTEXT.md)
│   ├── adr/                   ← created on first decision
│   │   └── 0001-....md
│   └── README.md              ← map of the design documents
└── packages/, apps/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use
the term as defined in `docs/domain-model.md`. Don't drift to the synonyms its **Avoid** column lists.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project
doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`). A change to a concept updates
`docs/domain-model.md` in the same pull request as the code.

## Flag ADR conflicts

If your output contradicts an existing ADR or a design document's decision table, surface it explicitly rather
than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
