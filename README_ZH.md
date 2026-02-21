# Universal Bridge

适用于 [OpenClaw](https://github.com/openclaw/openclaw) 的通用双向 IM 桥接 channel 插件。

[English](./README.md)

## 简介

Universal Bridge 通过平台无关的 webhook 层将 OpenClaw 连接到任意 IM 平台（飞书、企业微信、微信客服等）。它不直接集成任何 IM SDK，而是通过标准 HTTP webhook 与中间代理层（openclaw-proxy）通信，可选启用 HMAC-SHA256 签名验证。

**架构：**

```
IM 用户 ──→ IM 平台 ──→ openclaw-proxy ──→ Universal Bridge（webhook listener）
                                                  │
                                              OpenClaw Agent
                                                  │
                                     Universal Bridge（outbound）──→ openclaw-proxy ──→ IM 用户
```

- **Inbound**：通过 HTTP webhook listener 接收 openclaw-proxy 的消息，分发给 OpenClaw agent
- **Outbound**：将 agent 的回复通过 HTTP POST 发送给 openclaw-proxy

## 安装

```bash
openclaw plugins install @reportify-ai/universal-bridge
```

或手动复制到 OpenClaw 扩展目录：

```bash
cp -r universal-bridge /path/to/openclaw/extensions/
cd /path/to/openclaw/extensions/universal-bridge
npm install
```

> OpenClaw 直接加载 TypeScript 源码，无需构建。

## 配置

在 `openclaw.json` 中添加：

```bash
openclaw config set plugins.allow '["universal-bridge"]'
openclaw config set channels.universal-bridge.webhookUrl "https://your-proxy.example.com/openclaw-proxy/webhook/bridge"
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

多账户配置：

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

| 字段 | 必填 | 说明 |
|------|------|------|
| `webhookUrl` | 是 | outbound 消息 POST 目标 URL |
| `userId` | 是 | 当前 OpenClaw 实例在 openclaw-proxy 中对应的用户 ID |
| `secretKey` | 否 | HMAC-SHA256 签名密钥 |
| `gatewayPort` | 否 | inbound webhook 监听端口（默认 `3100`） |
| `enabled` | 否 | 是否启用 |

> 未配置 `secretKey` 时，发送请求不带签名，接收请求也跳过签名验证。

## 消息格式

### Inbound（openclaw-proxy → 插件）

**地址：** `POST http://<openclaw-host>:<gatewayPort>/`
**默认：** `POST http://localhost:3100/`

openclaw-proxy 向插件的 webhook listener 发送消息：

```json
{
  "messageId": "msg-123",
  "timestamp": 1700000000000,
  "userId": "user-456",
  "sessionId": "conv-789",
  "text": "你好！"
}
```

请求头：
- `X-Signature`：请求体的 HMAC-SHA256 十六进制摘要（仅在配置了 `secretKey` 时）
- `Content-Type`：`application/json`

示例：

```bash
curl -X POST http://localhost:3100/ \
  -H "Content-Type: application/json" \
  -d '{"messageId":"msg-001","timestamp":1700000000000,"userId":"user-1","sessionId":"sess-1","text":"你好"}'
```

### Outbound（插件 → openclaw-proxy）

**地址：** `POST <webhookUrl>`（在 `openclaw.json` 中配置）

插件将 agent 回复发回 openclaw-proxy：

```json
{
  "userId": "your-user-id-in-proxy",
  "sessionId": "conv-789",
  "text": "你好！有什么可以帮你的？",
  "timestamp": 1700000000001
}
```

请求头：
- `X-Signature`：请求体的 HMAC-SHA256 十六进制摘要（仅在配置了 `secretKey` 时）
- `X-Timestamp`：毫秒级 Unix 时间戳
- `Content-Type`：`application/json`

## 开发

```bash
npm install
npm run type-check  # TypeScript 类型检查
```

## 许可证

[MIT](./LICENSE)
