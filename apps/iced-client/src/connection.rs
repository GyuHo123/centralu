//! The one WebSocket to the host, as an iced subscription.
//!
//! Every connection is a first contact (`hello` with no cursor) and the window reloads what it draws after
//! each `hello_ok`. That is the rule the web client follows on a resync (protocol.md §1), applied every
//! time: simpler than resuming a cursor, and a lost event can never leave the screen wrong. The events
//! the host replays to a first contact ended before this connection and are dropped by their seq.

use crate::protocol::{self, Incoming};
use futures::channel::mpsc;
use futures::{SinkExt, Stream, StreamExt};
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;

/// How the window reaches the host
#[derive(Debug, Clone)]
pub struct Outbox(mpsc::UnboundedSender<String>);

impl Outbox {
    /// Queues one frame. False once the connection it belonged to is gone.
    pub fn send(&self, frame: String) -> bool {
        self.0.unbounded_send(frame).is_ok()
    }
}

#[derive(Debug, Clone)]
pub enum Link {
    /// Handshake done: calls can go out through this, and what the window draws should be read again
    Ready(Outbox),
    Answer { id: u64, result: Result<serde_json::Value, String> },
    Event(serde_json::Value),
    Lost(String),
}

/// Where the host is: `CC_HOST_URL` (default the dev host) and `CC_HOST_TOKEN`
pub struct Endpoint {
    pub url: String,
    pub token: String,
}

impl Endpoint {
    pub fn from_env() -> Endpoint {
        Endpoint {
            url: std::env::var("CC_HOST_URL").unwrap_or_else(|_| "ws://127.0.0.1:5175".into()),
            token: std::env::var("CC_HOST_TOKEN").unwrap_or_default(),
        }
    }
}

pub fn connect() -> impl Stream<Item = Link> {
    iced::stream::channel(256, async |mut out: mpsc::Sender<Link>| {
        let endpoint = Endpoint::from_env();
        loop {
            let why = match session(&endpoint, &mut out).await {
                Ok(()) => "the host closed the connection".to_owned(),
                Err(e) => e,
            };
            let _ = out.send(Link::Lost(why)).await;
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    })
}

async fn session(endpoint: &Endpoint, out: &mut mpsc::Sender<Link>) -> Result<(), String> {
    let (ws, _) = tokio_tungstenite::connect_async(endpoint.url.as_str()).await.map_err(|e| e.to_string())?;
    let (mut tx, mut rx) = ws.split();
    tx.send(Message::Text(protocol::hello(&endpoint.token, None).into())).await.map_err(|e| e.to_string())?;
    let (outbox, mut queued) = mpsc::unbounded::<String>();
    let mut outbox = Some(Outbox(outbox));
    // Nothing goes out before hello_ok, and nothing at or below its seq is new (protocol.md §1, #82)
    let mut seen: Option<u64> = None;
    loop {
        tokio::select! {
            frame = rx.next() => {
                let text = match frame {
                    Some(Ok(Message::Text(t))) => t,
                    Some(Ok(Message::Close(_))) | None => return Ok(()),
                    Some(Err(e)) => return Err(e.to_string()),
                    Some(Ok(_)) => continue,
                };
                let link = match protocol::parse(&text) {
                    Incoming::HelloOk { current_seq, .. } => {
                        seen = Some(current_seq);
                        match outbox.take() {
                            Some(o) => Link::Ready(o),
                            None => continue,
                        }
                    }
                    Incoming::Answer { id, result } => Link::Answer { id, result },
                    Incoming::Event { seq, event } => {
                        match seen {
                            Some(s) if seq > s => seen = Some(seq),
                            _ => continue,
                        }
                        Link::Event(event)
                    }
                    Incoming::Ignored => continue,
                };
                if out.send(link).await.is_err() {
                    return Ok(());
                }
            }
            Some(frame) = queued.next() => {
                tx.send(Message::Text(frame.into())).await.map_err(|e| e.to_string())?;
            }
        }
    }
}
