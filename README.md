# Universal Bridge

A generic bidirectional webhook bridge channel plugin for [OpenClaw](https://github.com/openclaw/openclaw).

[中文文档](./README_ZH.md)

## Overview

Universal Bridge connects OpenClaw to any IM platform (Feishu, WeCom, WeChat, etc.) through a platform-agnostic webhook layer. Instead of implementing platform-specific SDKs, it communicates via standard HTTP webhooks with optional HMAC-SHA256 signature verification.

**Architecture:**

```
IM User ──→ IM Platform ──→ openclaw-proxy ──→ Universal Bridge (webhook listener)
                                                       │
                                                   OpenClaw Agent
                                                       │
                                          Universal Bridge (outbound) ──→ openclaw-proxy ──→ IM User
```

- **Inbound**: Receives messages from openclaw-proxy via HTTP webhook listener, dispatches to OpenClaw agent
- **Outbound**: Sends agent replies to openclaw-proxy via HTTP POST

## Installation

```bash
openclaw plugins install @reportify-ai/universal-bridge
```

Or manually copy to your OpenClaw extensions directory:

```bash
cp -r universal-bridge /path/to/openclaw/extensions/
cd /path/to/openclaw/extensions/universal-bridge
npm install
```

> OpenClaw loads TypeScript source directly — no build step needed.

## Configuration

Add to your `openclaw.json`:

```bash
openclaw config set plugins.allow '["universal-bridge"]'
config set channels.universal-bridge.webhookUrl "https://your-proxy.example.com/openclaw-proxy/webhook/bridge"
openclaw config set channels.universal-bridge.userId "your-user-id-in-proxy"
```

```json
{
  "channels": {
    "universal-bridge": {
      "webhookUrl": "https://your-proxy.example.com/openclaw-proxy/webhook/bridge",
      "userId": "your-user-id-in-proxy",
      "secretKey": "your-hmac-secret-key",
      "gatewayPort": 3100
    }
  }
}
```

Multi-account configuration:

```json
{
  "channels": {
    "universal-bridge": {
      "accounts": {
        "default": {
          "webhookUrl": "https://your-proxy.example.com/webhook/bridge",
          "userId": "your-user-id-in-proxy",
          "secretKey": "your-hmac-secret-key",
          "gatewayPort": 3100,
          "enabled": true
        }
      }
    }
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `webhookUrl` | Yes | URL to POST outbound messages to |
| `userId` | Yes | User ID of this OpenClaw instance in openclaw-proxy |
| `secretKey` | No | HMAC-SHA256 secret for signing/verifying payloads |
| `gatewayPort` | No | Port for inbound webhook listener (default: `3100`) |
| `enabled` | No | Enable/disable this account |

> When `secretKey` is omitted, requests are sent without signatures and inbound webhooks skip signature verification.

## Message Formats

### Inbound (POST to webhook listener)

openclaw-proxy sends messages to the plugin's webhook listener:

```json
{
  "messageId": "msg-123",
  "timestamp": 1700000000000,
  "userId": "user-456",
  "sessionId": "conv-789",
  "text": "Hello!"
}
```

Headers:
- `X-Signature`: HMAC-SHA256 hex digest of the request body (only when `secretKey` is configured)
- `Content-Type`: `application/json`

### Outbound (POST to webhookUrl)

The plugin sends replies back to openclaw-proxy:

```json
{
  "userId": "your-user-id-in-proxy",
  "sessionId": "conv-789",
  "text": "Hi! How can I help?",
  "timestamp": 1700000000001
}
```

Headers:
- `X-Signature`: HMAC-SHA256 hex digest of the request body (only when `secretKey` is configured)
- `X-Timestamp`: Unix timestamp in milliseconds
- `Content-Type`: `application/json`

## Development

```bash
npm install
npm run type-check  # TypeScript type checking
```

## License

[MIT](./LICENSE)
