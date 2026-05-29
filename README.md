# Input Token Counter / Tool Call Profiler

An OpenCode plugin that profiles tool calls — tracking duration, frequency, argument/result sizes, and error rates.

## Features

- Tracks every tool call OpenCode makes (bash, read, write, grep, glob, etc.)
- Records duration, argument size, result size, and error status
- Per-tool breakdown: calls, errors, average time, total time
- Persistent JSONL metrics and summary JSON
- CLI tool for viewing stats
- Zero dependencies

## How It Works

The plugin hooks into OpenCode's supported hooks:

- `tool.execute.before` — captures start time, tool name, and arguments
- `tool.execute.after` — computes duration, result size, error status, appends to metrics

Data is stored in `~/.config/input-token-counter/`:
- `metrics.jsonl` — one JSON entry per tool call
- `summary.json` — aggregated stats

## Installation

Place in your OpenCode plugins directory:
```
~/.config/opencode/plugins/input-token-counter/
```

No npm dependencies required.

## Usage

### CLI

```bash
node ~/.config/opencode/plugins/input-token-counter/cli.js
```

Options:
- `--recent` / `-n` — show summary plus last 10 calls
- `--json` / `-j` — output raw summary JSON
- `--reset` — clear all data

### Example Output

```
----------------------------------------------------------------------
              Tool Call Profiler — Summary
----------------------------------------------------------------------
  Tool calls:         1,247
  Errors:             23 (1.8%)
  Total duration:     5.2m
  Avg duration:       251ms
  Total args size:    2,458,921 chars
  Total result size:  8,234,561 chars
  First call:         2026-05-28 14:23:11
  Last call:          2026-05-28 16:45:02
----------------------------------------------------------------------

  Calls by tool:
  Tool                  Calls  Errors    Avg Time   Total Time
  
  bash                    423       2       180ms        1.3m
  read                    389       0        45ms       17.5s
  grep                    201       5        12ms        2.4s
  glob                    124       1         8ms        1.0s
  write                    65       3        95ms        6.2s
  edit                     45      12       320ms       14.4s
----------------------------------------------------------------------
```

## Metrics Format

**metrics.jsonl** (one per line):
```json
{"ts":"2026-05-28T16:45:02.000Z","tool":"bash","duration":182,"argsChars":1423,"resultChars":8921,"error":false}
```

**summary.json**:
```json
{
  "totalCalls": 1247,
  "totalDuration": 312000,
  "totalErrors": 23,
  "totalArgsChars": 2458921,
  "totalResultChars": 8234561,
  "byTool": {
    "bash": { "calls": 423, "errors": 2, "totalDuration": 78000, "totalArgsChars": 890000, "totalResultChars": 3400000 },
    "read": { "calls": 389, "errors": 0, "totalDuration": 17500, "totalArgsChars": 450000, "totalResultChars": 2100000 }
  },
  "firstCall": "2026-05-28T14:23:11.000Z",
  "lastCall": "2026-05-28T16:45:02.000Z"
}
```

## Analysis Examples

```bash
# Longest-running tool calls
cat ~/.config/input-token-counter/metrics.jsonl | jq -s 'sort_by(-.duration) | .[0:5]'

# Error rate by tool
cat ~/.config/input-token-counter/metrics.jsonl | jq -s 'group_by(.tool) | map({tool: .[0].tool, errors: map(select(.error)) | length, calls: length}) | sort_by(-.errors)'
```
