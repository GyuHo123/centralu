//! A session's conversation as rows to draw, from a history page and from live events.
//!
//! The same rules as the web UI's `messagesToChat` and `appendChat` (packages/ui/src/store/store.ts) for
//! the kinds drawn here: one stored message is one row, a streaming reply grows its last row, a tool call is
//! one line with its title. Kinds this client does not draw yet (images, approvals, app views) are skipped
//! rather than guessed at.

use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Who {
    User,
    Assistant,
    Reasoning,
    Tool,
    /// A marker: compaction, a reset, a notice
    Mark,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub who: Who,
    pub text: String,
    /// The stored number, when the host has given one; a live delta has none until it is stored
    pub seq: Option<u64>,
}

/// Rows from a `messages.load` page (oldest first)
pub fn from_stored(msgs: &[Value]) -> Vec<Row> {
    let mut rows = Vec::with_capacity(msgs.len());
    for m in msgs {
        let seq = m["seq"].as_u64();
        let p = &m["payload"];
        let row = match (m["kind"].as_str(), m["role"].as_str()) {
            (Some("text"), Some("user")) => Some((Who::User, text_of(p))),
            (Some("text"), _) => Some((Who::Assistant, text_of(p))),
            (Some("reasoning"), _) => Some((Who::Reasoning, text_of(p))),
            (Some("tool_call"), _) => tool_line(&p["summary"]).map(|t| (Who::Tool, t)),
            (Some("marker"), _) => p["text"]
                .as_str()
                .or_else(|| p["type"].as_str())
                .map(|t| (Who::Mark, t.to_owned())),
            _ => None,
        };
        if let Some((who, text)) = row {
            rows.push(Row { who, text, seq });
        }
    }
    rows
}

/// Folds one live event into the rows. Returns whether anything changed.
pub fn apply(rows: &mut Vec<Row>, event: &Value) -> bool {
    match event["type"].as_str() {
        Some("message_delta") => {
            let text = event["text"].as_str().unwrap_or("");
            match rows.last_mut() {
                // A streaming reply grows its own row until something else comes between
                Some(last) if last.who == Who::Assistant && last.seq.is_none() => last.text.push_str(text),
                _ => rows.push(Row { who: Who::Assistant, text: text.to_owned(), seq: None }),
            }
            true
        }
        Some("user_message") => {
            rows.push(Row { who: Who::User, text: text_of(event), seq: event["seq"].as_u64() });
            true
        }
        Some("tool_call") => match tool_line(&event["summary"]) {
            Some(t) => {
                rows.push(Row { who: Who::Tool, text: t, seq: None });
                true
            }
            None => false,
        },
        Some("turn_complete") => {
            // The reply is whole: the next delta starts a new row
            if let Some(last) = rows.last_mut() {
                if last.who == Who::Assistant && last.seq.is_none() {
                    last.seq = Some(0);
                }
            }
            false
        }
        _ => false,
    }
}

fn text_of(v: &Value) -> String {
    v["text"].as_str().unwrap_or("").to_owned()
}

fn tool_line(summary: &Value) -> Option<String> {
    let tool = summary["tool"].as_str()?;
    let title = summary["title"].as_str().unwrap_or("");
    Some(if title.is_empty() || title == tool { tool.to_owned() } else { format!("{tool}  {title}") })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_history_page_becomes_one_row_per_message() {
        let page = vec![
            json!({ "seq": 1, "role": "user", "kind": "text", "payload": { "text": "hi" } }),
            json!({ "seq": 2, "role": "assistant", "kind": "tool_call", "payload": { "summary": { "tool": "Read", "title": "a.ts", "readOnly": true } } }),
            json!({ "seq": 3, "role": "assistant", "kind": "text", "payload": { "text": "done" } }),
            json!({ "seq": 4, "role": "assistant", "kind": "image", "payload": {} }),
        ];
        let rows = from_stored(&page);
        assert_eq!(
            rows.iter().map(|r| (r.who, r.text.as_str())).collect::<Vec<_>>(),
            vec![(Who::User, "hi"), (Who::Tool, "Read  a.ts"), (Who::Assistant, "done")]
        );
        assert_eq!(rows[0].seq, Some(1));
    }

    #[test]
    fn a_streaming_reply_grows_one_row_and_a_tool_call_ends_it() {
        let mut rows = Vec::new();
        apply(&mut rows, &json!({ "type": "message_delta", "text": "Hel" }));
        apply(&mut rows, &json!({ "type": "message_delta", "text": "lo" }));
        apply(&mut rows, &json!({ "type": "tool_call", "summary": { "tool": "Bash", "title": "ls" } }));
        apply(&mut rows, &json!({ "type": "message_delta", "text": "next" }));
        assert_eq!(
            rows.iter().map(|r| r.text.as_str()).collect::<Vec<_>>(),
            vec!["Hello", "Bash  ls", "next"]
        );
    }

    /// Two replies in a row are two rows (the web UI's #77 rule): the turn's end closes the first
    #[test]
    fn a_finished_turn_closes_its_reply() {
        let mut rows = Vec::new();
        apply(&mut rows, &json!({ "type": "message_delta", "text": "one" }));
        apply(&mut rows, &json!({ "type": "turn_complete" }));
        apply(&mut rows, &json!({ "type": "message_delta", "text": "two" }));
        assert_eq!(rows.len(), 2);
    }
}
