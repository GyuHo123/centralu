# Redesign v3: today's features, redrawn

v2 replaced the project tree with a queue and a timeline, and in doing so dropped or buried features people use.
v3 keeps every feature of today's window (see [FEATURES.md](FEATURES.md)) and redraws each surface with the v2 visual system:
one cobalt for "waiting on you" and the action that answers it, red only for failures, Pretendard and JetBrains Mono.

The frame stays four parts: command bar, navigator, main view, evidence panel.

| Page | Hash variants | What it shows |
|---|---|---|
| `focus.html` | `#dark`, `#inbox`, `#palette`, `#ev` (at 900px) | Session view, inbox answered in place, palette, narrow layout |
| `grid.html` | `#dark` | Grid with session and app panels, size picker |
| `project.html` | `#dark` | Project screen, worktree tree, project actions |
| `app.html` | `#dark`, `#runs` | Pinned app with builder pane, error tail, fix bar; Runs panel and capability ask |
| `orchestrator.html` | `#dark`, `#first` | Orchestrator with proposals; first run with tool choice |
| `settings.html` | `#dark`, `#appearance`, `#shortcuts` | Settings as a full view |
| `dialogs.html` | `#new-session`, `#handoff`, `#delete` | Session dialogs |

Open a page from a local checkout in a browser; the PNGs in `png/` are 1440×900 renders (narrow ones 900×800).
