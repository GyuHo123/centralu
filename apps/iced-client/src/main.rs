//! A native Iced window onto a running Centralu host: projects, sessions, a conversation, and a composer.
//!
//! It speaks the same WebSocket protocol as the web UI and owns nothing the host does not already keep, so
//! it can stand next to the WebView window on the same host and the same data. That is its job for now: to
//! measure what a native renderer saves (#399) before anyone decides to rebuild the screens on it.
//!
//!   CC_HOST_URL=ws://127.0.0.1:5175 CC_HOST_TOKEN=... cargo run --release
//!
//! For measuring (apps/iced-client/measure): `CC_NATIVE_OPEN=<session id>` opens that session once the list
//! arrives, and `CC_NATIVE_SHOT=<file.ppm>` writes the window's own pixels there once its first page is drawn.
//! Only the window's own frame is read; nothing captures the screen.

mod connection;
mod conversation;
mod protocol;

use connection::{Link, Outbox};
use conversation::{Row, Who};
use iced::widget::{button, column, container, row, scrollable, text, text_input, Column};
use iced::{Color, Element, Font, Length, Subscription, Task, Theme};
use serde_json::{json, Value};
use std::collections::HashMap;

/// A page of history, as the web UI reads it (`HISTORY_PAGE`, store.ts)
const HISTORY_PAGE: u64 = 100;

/// The Dark preset's tokens (packages/ui/src/styles/index.css)
mod ink {
    use iced::Color;
    pub const FLOOR: Color = Color::from_rgb8(0x14, 0x14, 0x14);
    pub const SIDE: Color = Color::from_rgb8(0x1a, 0x1a, 0x1a);
    pub const RAISED: Color = Color::from_rgb8(0x1d, 0x1d, 0x1d);
    pub const SELECTED: Color = Color::from_rgb8(0x29, 0x29, 0x29);
    pub const MINE: Color = Color::from_rgb8(0x35, 0x35, 0x35);
    pub const INK: Color = Color::from_rgb8(0xe9, 0xe9, 0xe9);
    pub const MUTED: Color = Color::from_rgb8(0x90, 0x90, 0x90);
    pub const SIGNAL: Color = Color::WHITE;
}

fn main() -> iced::Result {
    iced::application(App::default, App::update, App::view)
        .title("Centralu (native)")
        .theme(|_: &App| Theme::Dark)
        .subscription(App::subscription)
        .window_size((1280.0, 820.0))
        .run()
}

#[derive(Debug, Clone)]
enum Message {
    Link(Link),
    Select(String),
    Earlier,
    Draft(String),
    Send,
    Shoot,
    Shot(iced::window::Screenshot),
}

/// What an answer is for
#[derive(Debug, Clone)]
enum Asked {
    Projects,
    Sessions,
    History { session: String, earlier: bool },
    Sent,
}

#[derive(Debug, Clone)]
struct SessionItem {
    id: String,
    project: Option<String>,
    name: String,
    state: String,
}

#[derive(Default)]
struct App {
    outbox: Option<Outbox>,
    status: String,
    next_id: u64,
    asked: HashMap<u64, Asked>,
    projects: Vec<(String, String)>,
    sessions: Vec<SessionItem>,
    selected: Option<String>,
    rows: Vec<Row>,
    more: bool,
    draft: String,
    shot_taken: bool,
}

impl App {
    fn ask(&mut self, method: &str, params: Value, why: Asked) {
        let Some(outbox) = &self.outbox else { return };
        self.next_id += 1;
        if outbox.send(protocol::rpc(self.next_id, method, params)) {
            self.asked.insert(self.next_id, why);
        }
    }

    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::Link(Link::Ready(outbox)) => {
                self.outbox = Some(outbox);
                self.status = "connected".into();
                self.asked.clear();
                self.ask("projects.list", json!({}), Asked::Projects);
                self.ask("sessions.list", json!({}), Asked::Sessions);
                if let Some(id) = self.selected.clone() {
                    self.load(id, None);
                }
            }
            Message::Link(Link::Lost(why)) => {
                self.outbox = None;
                self.status = format!("reconnecting: {why}");
            }
            Message::Link(Link::Answer { id, result }) => {
                let Some(why) = self.asked.remove(&id) else { return Task::none() };
                match (why, result) {
                    (Asked::Projects, Ok(v)) => {
                        self.projects = list(&v)
                            .map(|p| (str_of(p, "id"), str_of(p, "name")))
                            .collect();
                    }
                    (Asked::Sessions, Ok(v)) => {
                        self.sessions = list(&v)
                            .map(|s| SessionItem {
                                id: str_of(s, "id"),
                                project: s["projectId"].as_str().map(str::to_owned),
                                name: str_of(s, "name"),
                                state: str_of(s, "state"),
                            })
                            .collect();
                        if self.selected.is_none() {
                            if let Ok(id) = std::env::var("CC_NATIVE_OPEN") {
                                return self.update(Message::Select(id));
                            }
                        }
                    }
                    (Asked::History { session, earlier }, Ok(v)) if self.selected.as_ref() == Some(&session) => {
                        let page: Vec<Value> = list(&v).cloned().collect();
                        self.more = page.len() as u64 == HISTORY_PAGE;
                        let mut rows = conversation::from_stored(&page);
                        if earlier {
                            rows.append(&mut self.rows);
                        }
                        self.rows = rows;
                        if !self.shot_taken && std::env::var_os("CC_NATIVE_SHOT").is_some() {
                            self.shot_taken = true;
                            return Task::perform(tokio::time::sleep(std::time::Duration::from_millis(800)), |_| Message::Shoot);
                        }
                    }
                    (Asked::History { .. }, Ok(_)) => {}
                    (Asked::Sent, Ok(_)) => {}
                    (_, Err(e)) => self.status = e,
                }
            }
            Message::Link(Link::Event(event)) => {
                if event["type"] == "state_change" {
                    let id = event["sessionId"].as_str().unwrap_or_default();
                    if let Some(s) = self.sessions.iter_mut().find(|s| s.id == id) {
                        s.state = event["state"].as_str().unwrap_or_default().to_owned();
                    }
                } else if event["type"] == "session_title" {
                    let id = event["sessionId"].as_str().unwrap_or_default();
                    if let Some(s) = self.sessions.iter_mut().find(|s| s.id == id) {
                        s.name = event["title"].as_str().unwrap_or_default().to_owned();
                    }
                }
                if event["sessionId"].as_str() == self.selected.as_deref() {
                    conversation::apply(&mut self.rows, &event);
                }
            }
            Message::Select(id) => {
                self.rows.clear();
                self.more = false;
                self.selected = Some(id.clone());
                self.load(id, None);
            }
            Message::Earlier => {
                if let (Some(id), Some(seq)) = (self.selected.clone(), self.rows.iter().find_map(|r| r.seq)) {
                    self.load(id, Some(seq));
                }
            }
            Message::Shoot => {
                return iced::window::latest()
                    .and_then(iced::window::screenshot)
                    .map(Message::Shot);
            }
            Message::Shot(shot) => {
                if let Some(path) = std::env::var_os("CC_NATIVE_SHOT") {
                    if let Err(e) = std::fs::write(&path, ppm(&shot)) {
                        self.status = format!("screenshot not written: {e}");
                    }
                }
            }
            Message::Draft(t) => self.draft = t,
            Message::Send => {
                let text = self.draft.trim().to_owned();
                if let (Some(id), false) = (self.selected.clone(), text.is_empty()) {
                    self.ask("agents.send", json!({ "sessionId": id, "text": text }), Asked::Sent);
                    self.draft.clear();
                }
            }
        }
        Task::none()
    }

    fn load(&mut self, session: String, before: Option<u64>) {
        let mut params = json!({ "sessionId": session, "limit": HISTORY_PAGE });
        if let Some(seq) = before {
            params["beforeSeq"] = json!(seq);
        }
        self.ask("messages.load", params, Asked::History { session, earlier: before.is_some() });
    }

    fn subscription(&self) -> Subscription<Message> {
        Subscription::run(connection::connect).map(Message::Link)
    }

    fn view(&self) -> Element<'_, Message> {
        row![self.sidebar(), self.conversation()].into()
    }

    fn sidebar(&self) -> Element<'_, Message> {
        let mut list = Column::new().spacing(2).padding(8);
        for (pid, pname) in &self.projects {
            list = list.push(text(pname).size(13).color(ink::MUTED).font(Font::MONOSPACE));
            for s in self.sessions.iter().filter(|s| s.project.as_deref() == Some(pid)) {
                let picked = self.selected.as_deref() == Some(&s.id);
                let waiting = s.state == "waiting_input" || s.state == "waiting_approval";
                let label = row![
                    text(&s.name).size(14).color(if waiting { ink::SIGNAL } else { ink::INK }).width(Length::Fill),
                    text(&s.state).size(11).color(ink::MUTED),
                ];
                list = list.push(
                    button(label)
                        .width(Length::Fill)
                        .on_press(Message::Select(s.id.clone()))
                        .style(move |_, _| button::Style {
                            background: picked.then(|| ink::SELECTED.into()),
                            text_color: ink::INK,
                            ..Default::default()
                        }),
                );
            }
        }
        let status = text(&self.status).size(11).color(ink::MUTED);
        container(column![scrollable(list).height(Length::Fill), status].padding(4))
            .width(240)
            .height(Length::Fill)
            .style(|_| container::Style { background: Some(ink::SIDE.into()), ..Default::default() })
            .into()
    }

    fn conversation(&self) -> Element<'_, Message> {
        let mut body = Column::new().spacing(10).padding(16).max_width(820);
        if self.more {
            body = body.push(button(text("Earlier messages").size(13).color(ink::MUTED)).on_press(Message::Earlier).style(
                |_, _| button::Style { text_color: ink::MUTED, ..Default::default() },
            ));
        }
        for r in &self.rows {
            body = body.push(row_view(r));
        }
        let composer = text_input("Type a message", &self.draft)
            .on_input(Message::Draft)
            .on_submit(Message::Send)
            .padding(10)
            .size(14);
        container(
            column![
                scrollable(container(body).center_x(Length::Fill)).anchor_bottom().height(Length::Fill),
                container(composer).padding(12).max_width(820),
            ]
            .align_x(iced::Alignment::Center),
        )
        .width(Length::Fill)
        .height(Length::Fill)
        .style(|_| container::Style { background: Some(ink::FLOOR.into()), ..Default::default() })
        .into()
    }
}

fn row_view(r: &Row) -> Element<'_, Message> {
    let line = |c: Color, size: u32| text(&r.text).size(size).color(c);
    match r.who {
        Who::User => container(line(ink::INK, 14))
            .padding([8, 12])
            .style(|_| container::Style { background: Some(ink::MINE.into()), ..Default::default() })
            .into(),
        Who::Assistant => line(ink::INK, 14).into(),
        Who::Reasoning => line(ink::MUTED, 13).into(),
        Who::Tool => container(text(&r.text).size(12).font(Font::MONOSPACE).color(ink::MUTED))
            .padding([6, 10])
            .width(Length::Fill)
            .style(|_| container::Style { background: Some(ink::RAISED.into()), ..Default::default() })
            .into(),
        Who::Mark => line(ink::MUTED, 12).into(),
    }
}

/// The frame as a binary PPM: no image library for a file only the measuring script reads
fn ppm(shot: &iced::window::Screenshot) -> Vec<u8> {
    let (w, h) = (shot.size.width, shot.size.height);
    let mut out = format!("P6\n{w} {h}\n255\n").into_bytes();
    for px in shot.rgba.chunks_exact(4) {
        out.extend_from_slice(&px[..3]);
    }
    out
}

fn list(v: &Value) -> impl Iterator<Item = &Value> {
    v.as_array().into_iter().flatten()
}

fn str_of(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or_default().to_owned()
}
