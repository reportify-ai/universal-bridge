# Changelog

## 0.1.0 (2026-02-20)

### Added
- Initial release as OpenClaw channel plugin
- Bidirectional webhook bridge between OpenClaw and openclaw-proxy
- Inbound: HTTP webhook listener receives messages from openclaw-proxy, dispatches to OpenClaw agent via runtime API
- Outbound: sends agent replies back to openclaw-proxy via signed HTTP POST
- Full OpenClaw runtime integration (resolveAgentRoute, formatInboundEnvelope, finalizeInboundContext, recordInboundSession, dispatchReplyWithBufferedBlockDispatcher)
- Multi-account support via openclaw.json configuration
- Optional HMAC-SHA256 signature verification (secretKey)
