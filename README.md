# Input Token Counter Plugin

A plugin for OpenCode that tracks input token usage across LLM conversations.

## Features

- Automatic token counting for all chat requests
- Persistent metrics storage in JSONL format
- Summary statistics by model and provider
- CLI tool for viewing usage data
- Cost estimation based on token counts

## Installation

Place this plugin in your OpenCode plugins directory:
```
~/.config/opencode/plugins/input-token-counter/
```

Install dependencies:
```bash
npm install
```

## Usage

### Automatic Tracking

Once installed, the plugin automatically tracks all chat requests.

### CLI Tool

View your token usage:
```bash
node ~/.config/opencode/plugins/input-token-counter/cli.js
```

Options:
- `--recent` - Show recent calls
- `--json` - Output raw JSON
- `--reset` - Clear all statistics

## Current Status

**This plugin does not currently work** due to OpenCode's plugin system not supporting the required `chat.params` hook.

### Investigation

During testing, we discovered:

1. **Plugin loads successfully** - The module exports correctly and OpenCode recognizes it
2. **Hook never fires** - The `chat.params` hook is never invoked despite being registered
3. **Root cause** - OpenCode's plugin API only supports limited hooks (tool.execute, session, config) and does not include chat/message interception hooks

### What We Tried

- Verified ESM exports and hook signatures
- Tested CJS and ESM module loading
- Checked plugin loading mechanism
- Reviewed OpenCode documentation

### Required Hooks

This plugin needs hooks like:
- `chat.params` - Intercept chat parameters before sending
- `chat.response` - Access chat responses
- `message.create` - Hook into message creation

These hooks are not yet available in OpenCode as of May 2026.

## Technical Details

### Architecture

- `index.js` - Main plugin with hook registration
- `cli.js` - CLI tool for viewing stats
- `package.json` - Dependencies (tiktoken)

### Token Counting

Uses tiktoken for accurate counting:
- OpenAI models: `cl100k_base` encoding
- Claude models: `cl100k_base` approximation
- Other models: Character-based estimation

### Data Storage

Metrics stored in:
- `~/.config/input-token-counter/summary.json`
- `~/.config/input-token-counter/metrics.jsonl`

## Future Outlook

This plugin is ready to work once OpenCode adds chat/message hooks. The architecture is sound and will provide valuable token usage insights when the required hooks become available.
