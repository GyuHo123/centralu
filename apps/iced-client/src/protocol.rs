//! The host's wire format (docs/protocol.md §1), the part this client speaks.
//!
//! One WebSocket text frame is one JSON value. The client sends `hello` first and nothing else until
//! `hello_ok`; after that it sends RPCs and receives answers and a numbered event stream. Kept as plain
//! `serde_json::Value` on purpose: the TypeScript package `@cc/protocol` is the source of truth, and
//! this client reads only the fields it draws, so a field the host adds never breaks it (protocol.md §4).

use serde_json::{json, Value};

/// The protocol version this client was written against (`PROTOCOL_VERSION` in envelope.ts)
pub const PROTOCOL_VERSION: u64 = 1;

/// The first frame on every connection. `after_seq` and `epoch` resume a stream this client already
/// read part of; a first contact sends neither.
pub fn hello(token: &str, resume: Option<(u64, &str)>) -> String {
    let mut v = json!({ "kind": "hello", "token": token, "protocolVersion": PROTOCOL_VERSION });
    if let Some((after_seq, epoch)) = resume {
        v["afterSeq"] = json!(after_seq);
        v["streamEpoch"] = json!(epoch);
    }
    v.to_string()
}

/// An RPC request frame
pub fn rpc(id: u64, method: &str, params: Value) -> String {
    json!({ "kind": "rpc", "id": id.to_string(), "method": method, "params": params }).to_string()
}

/// A frame from the host, reduced to what this client acts on
#[derive(Debug, Clone, PartialEq)]
pub enum Incoming {
    HelloOk { current_seq: u64, epoch: Option<String>, resync: bool },
    Answer { id: u64, result: Result<Value, String> },
    Event { seq: u64, event: Value },
    /// Terminal output and anything newer than this client: not drawn here
    Ignored,
}

pub fn parse(frame: &str) -> Incoming {
    let Ok(v) = serde_json::from_str::<Value>(frame) else { return Incoming::Ignored };
    match v["kind"].as_str() {
        Some("hello_ok") => Incoming::HelloOk {
            current_seq: v["currentSeq"].as_u64().unwrap_or(0),
            epoch: v["streamEpoch"].as_str().map(str::to_owned),
            resync: v["resyncRequired"].as_bool().unwrap_or(false),
        },
        Some("res") => {
            let Some(id) = v["id"].as_str().and_then(|s| s.parse().ok()) else { return Incoming::Ignored };
            let result = if v["ok"].as_bool() == Some(true) {
                Ok(v["result"].clone())
            } else {
                Err(v["error"]["message"].as_str().unwrap_or("the host refused the call").to_owned())
            };
            Incoming::Answer { id, result }
        }
        Some("event") => match v["seq"].as_u64() {
            Some(seq) => Incoming::Event { seq, event: v["event"].clone() },
            None => Incoming::Ignored,
        },
        _ => Incoming::Ignored,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_first_hello_carries_no_cursor() {
        let v: Value = serde_json::from_str(&hello("t", None)).unwrap();
        assert_eq!(v["kind"], "hello");
        assert_eq!(v["token"], "t");
        assert_eq!(v["protocolVersion"], 1);
        assert!(v.get("afterSeq").is_none() && v.get("streamEpoch").is_none());
    }

    /// A cursor without its epoch gets a resync from the host (protocol.md §1, #82), so the two go together
    #[test]
    fn a_resuming_hello_sends_its_cursor_with_its_epoch() {
        let v: Value = serde_json::from_str(&hello("t", Some((42, "e1")))).unwrap();
        assert_eq!(v["afterSeq"], 42);
        assert_eq!(v["streamEpoch"], "e1");
    }

    #[test]
    fn reads_the_frames_it_acts_on() {
        assert_eq!(
            parse(r#"{"kind":"hello_ok","protocolVersion":1,"resyncRequired":false,"currentSeq":7,"streamEpoch":"e"}"#),
            Incoming::HelloOk { current_seq: 7, epoch: Some("e".into()), resync: false }
        );
        assert_eq!(
            parse(r#"{"kind":"res","id":"3","ok":true,"result":[1]}"#),
            Incoming::Answer { id: 3, result: Ok(json!([1])) }
        );
        assert_eq!(
            parse(r#"{"kind":"res","id":"4","ok":false,"error":{"code":"internal","message":"no"}}"#),
            Incoming::Answer { id: 4, result: Err("no".into()) }
        );
        assert_eq!(
            parse(r#"{"kind":"event","seq":9,"event":{"type":"turn_complete","sessionId":"s"}}"#),
            Incoming::Event { seq: 9, event: json!({ "type": "turn_complete", "sessionId": "s" }) }
        );
        assert_eq!(parse(r#"{"kind":"term","terminalId":"x","data":"y"}"#), Incoming::Ignored);
        assert_eq!(parse("not json"), Incoming::Ignored);
    }
}
