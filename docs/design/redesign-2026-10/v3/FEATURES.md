# v3 feature preservation matrix

Every user-facing feature of today's window (read from `packages/ui/src` on 2026-10-05), and where it lives in v3.
"Same" means the feature keeps its behaviour and only its drawing changes. Mockup names refer to the PNGs in this folder.
Items marked **new** do not exist today; items marked **moved** exist today in another place.

## Command bar (today's top bar)

| Today | v3 | Mockup |
|---|---|---|
| Title, window drag region | Brand at the left; the whole bar stays the drag region | all |
| Waiting counter, opens the Inbox | "3 waiting ⌘I" pill, cobalt when anything waits | all |
| Update line (Install, Apply now, Updating, Update failed) | Same slot, right of the search field, only while something happens | not drawn |
| Usage donuts per tool, open the usage dropdown; Connecting / Disconnected / No agent | Same, ring plus percentage | all |
| Settings button | Gear, opens Settings as a full view (**moved** from a modal) | settings |
| Shell banner (switch host build), quit dialog, starting and failed host screens | Same, unchanged | not drawn |
| Toast, error boundary | Same | not drawn |
| (none) | **new**: a search field that opens the palette (`⌘K`) | all |

## Navigator (today's sidebar)

| Today | v3 | Mockup |
|---|---|---|
| Orchestrator entry, Evolving tag, draggable to Grid | Same, top of the navigator | all |
| Grid entry with panel count, drop target | Same | all |
| (scan rows for state) | **new**: "Waiting on you" section, approvals, questions and stops with what they want | focus, grid |
| Project block: fold, name opens project screen, tooltip, changed count, access-denied mark, folded summary chips, drag to reorder | Same; section header keeps sort and add | focus, project |
| Project ⋯ menu: New session, New app, Start worktree manager, Trust / Stop trusting, Collapse others, Delete | Same menu, also as buttons on the project screen | project |
| Trust ask after adding an untrusted project | Same, inline | not drawn |
| Session rows: click, double-click rename, tool mark with state, unread brighter, merged / PR / bg badges, drag | Same, with a state glyph plus word (approve, idle, done) instead of colour alone | focus |
| Worktree children nested under their manager | Same, with a tree connector | focus, project |
| Session ⋯ menu: Rename, New worktree session, Hand off, Delete | Same; also in the session header's ⋯ | focus, dialogs |
| App rows with status hint, drag to grid | Same | focus, app |
| Your apps: Import, New app, builder sessions without a project | Same | focus |
| Add project at the bottom | Same | all |
| Width resize (180 to 480px) | Same; below 1100px the navigator becomes a 56px rail | narrow |

## Session view

| Today | v3 | Mockup |
|---|---|---|
| Header: crown, name, Asked by, limit badge, GOAL badge, background tasks, agent version notice, Run menu, Restart | Same items; adds worktree chip and a state word ("Waiting on you") | focus |
| Rename only in the sidebar | **moved**: also in the header ⋯ | focus |
| Hand off, Delete in the sidebar menu | **moved**: also in the header (fork icon, ⋯) | focus |
| User bubble with attachments and origin labels | Same | focus |
| Assistant markdown, file links, reveal | Same | focus |
| Reasoning, approval outcome line, markers (compaction, handoff, reset, errors, question dropped), tool notices | Same, markers drawn as a centred rule | focus |
| Tool cards with live tail, 3-line preview, Show all | Grouped into one "Worked" line per stretch; each call opens into today's card | focus |
| Subagent launch with nested steps | Same, as a card with step count | focus |
| Project and worktree proposals, ask_project rows | Same | project, orchestrator |
| Inline app view: Updated, Changed Reload, Pin, frame, closed placeholder, message ask | Same | focus |
| Images with lightbox | Same | not drawn |
| Approval card: command or edit, Allow Y, Deny N, Always A, ⌥A project; project access; capability | Docked above the composer, with "Next waiting ⌘⇧A" | focus |
| Question card: tabs, single or multi select, Other, Answer | Docked above the composer, same controls | inbox |
| Activity row: plan, status words, elapsed, background note, Stop | Same | focus |
| Sticky prompt banner | Slim line under the header | focus |
| History paging, scroll anchor, mark read, dormant note, Retry, Continue in a fork | Same | not drawn |
| Composer: grows, Enter or ⌘Enter, history ↑ ↓, drafts, attachments, paste, drops, `/` and `@` autocomplete | Same | focus |
| Composer footer: settings chip (model, effort, verbosity, speed, permissions), worktree badge, context meter | Same; worktree badge **moved** to the header | focus |
| Folded composer in grid, project, builder | Same | grid, project, app |
| Command runner: saved commands, Run, Restart, Stop, log | Same, from the Run button | not drawn |

## Evidence panel

| Today | v3 | Mockup |
|---|---|---|
| Header: project, branch button (Branches overlay), collapse ⌘B | Same; branch with ahead count | focus |
| Tabs Git, History, Files, Terminal; drag to reorder; split; overflow; running dot | Same; Git is labelled Changes with a count | focus |
| Git: Staged and Changes groups, stage per file, Stage all, diff, Expand, commit, Push | Same, with the selected file's diff inline below the list | focus |
| History graph, commit diff | Same | not drawn |
| Diff view, Files tree, code viewer, terminal | Same | not drawn |
| Collapsed 32px rail | Same idea, 40px rail with tab icons; opens as an overlay when narrow | narrow |
| Width resize (260 to 900px) | Same | all |

## Grid, project screen, apps, orchestrator

| Today | v3 | Mockup |
|---|---|---|
| Grid: session panels (full panes, remove ×), app panels (status, size picker, Open, remove), drag reorder, working ring, empty hint | Same; waiting panels get a cobalt band and answer in place | grid |
| Project screen: panels, hide ×, hidden chips, drag, refuses other projects, empty state | Same; header with branch, changes, trust | project |
| (worktree manager in a menu) | **new**: Worktrees panel drawing the manager and its branches | project |
| New session, worktree manager, new app, delete project dialogs | Same | dialogs |
| Pinned app header: status, Updated, Changed Reload, Builder, Runs, Secrets, Share, Versions, Close | Same | app |
| Body states: crashed with Restart, loading, untrusted, failed, blocked, Review and enable | Same, unchanged | not drawn |
| Runs panel: Refresh, permissions with Forget, agent use 24h and 30d, runs chained by caller | Same | app (#runs) |
| Secrets, Versions, Import, capability ask, message ask, link ask, Fix bar, Error tail, builder pane, drag shield | Same | app |
| Orchestrator: first-run input and suggestions, pick a folder, skill and MCP proposals | Same; onboarding tool choice folded into first run | orchestrator |

## Inbox, palette, notices, settings

| Today | v3 | Mockup |
|---|---|---|
| Inbox: rows with state, project, kind, wait; ↑ ↓ j k, Enter opens, Esc | Same | inbox |
| (open the session to answer) | **new**: approve or pick an answer inside the Inbox | inbox |
| Notice cards, Gust, sound, OS notifications, dock badge | Same | not drawn |
| Palette: sessions, projects, message text, actions | Same, grouped | palette |
| (no file search in the palette) | **new**: files group | palette |
| Usage dropdown | Same | not drawn |
| Settings sections: Orchestrator, Apps, Notifications, Background, Appearance, Permissions, Trash, Shortcuts, Updates | Same sections in a full view with a search field | settings |
| Shortcuts table lists `d` dismiss, which does nothing | Removed from the table until it exists | settings |

## Gaps found while reading, not fixed by the mockups

- `d` "Dismiss from inbox" is listed in Settings but not handled.
- The spec's `j`/`k` between sessions works only inside the Inbox.
- A message hit in the palette opens the session but does not scroll to the message.
- `⌘1` to `⌘9` does nothing for a project with no sessions.
