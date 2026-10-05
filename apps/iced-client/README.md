# centralu-iced

A native [Iced](https://iced.rs) window onto a running Centralu host: projects, sessions, one conversation (history a
page at a time, live events) and a composer. It speaks the host's WebSocket protocol (docs/protocol.md §1) like the web
UI and keeps nothing of its own, so it can run beside the WebView window on the same host and data.

It exists to measure what a native renderer saves (#399), not to replace the web UI: it draws a fraction of it (no
evidence panel, git, files, terminal, grid, approvals, questions, Markdown, diffs or app views).

## Run

```bash
cargo run --release                       # in apps/iced-client
CC_HOST_URL=ws://127.0.0.1:5175 CC_HOST_TOKEN=<the host's token> ./target/release/centralu-iced
```

`ICED_BACKEND=tiny-skia` draws on the CPU instead of the GPU. Under WSL, X11 needs `libxkbcommon-x11`.

## Measure

`measure/seed.mts` fills a store in a folder you give it (never a real data folder); serve it with
`CC_DATA_DIR=<dir> pnpm host --db <dir>/store.db`, save a workspace that focuses `s-long`, serve the web UI's
production build against the same host, then on Windows:

```powershell
powershell -File measure/measure-windows.ps1 -Exe centralu-iced.exe -HostUrl ws://127.0.0.1:5199 -Token <t> [-Backend tiny-skia]
```

It runs each client as a 1280×820 window for 20 s and reports the median of five samples, summed over every process the
client started. Results from 2026-10-05 are in #399.

`CC_NATIVE_OPEN=<session id>` opens that session once the list arrives; `CC_NATIVE_SHOT=<file.ppm>` writes the window's
own frame once its first page is drawn (nothing captures the screen).

## Test

```bash
cargo test     # the wire format and the conversation rows
```
