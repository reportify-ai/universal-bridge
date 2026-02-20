import type {
  OpenClawConfig,
  ChannelLogSink as SDKChannelLogSink,
  ChannelGatewayContext as SDKChannelGatewayContext,
  ChannelPlugin as SDKChannelPlugin,
} from 'openclaw/plugin-sdk';

/** Account configuration from openclaw.json */
export interface AccountConfig {
  /** URL to POST outbound messages to (openclaw-proxy endpoint) */
  webhookUrl: string;
  /** HMAC-SHA256 secret for signing/verifying payloads (optional) */
  secretKey?: string;
  /** User ID of this OpenClaw instance in openclaw-proxy */
  userId: string;
  /** Port for inbound webhook listener (default: 3100) */
  gatewayPort?: number;
  enabled?: boolean;
}

/** Resolved account returned by resolveAccount */
export interface ResolvedAccount {
  accountId: string;
  config: AccountConfig;
  enabled: boolean;
  configured: boolean;
}

/** Inbound message format (openclaw-proxy -> plugin) */
export interface InboundMessage {
  messageId: string;
  timestamp: number;
  /** Sender's user ID in openclaw-proxy */
  userId: string;
  /** Session ID identifying the conversation */
  sessionId: string;
  text: string;
  metadata?: Record<string, any>;
}

/** Outbound message format (plugin -> openclaw-proxy) */
export interface OutboundPayload {
  /** User ID of this OpenClaw instance in openclaw-proxy */
  userId: string;
  /** Session ID identifying the conversation */
  sessionId: string;
  text: string;
  replyToId?: string;
  timestamp: number;
}

/** Channel log sink from SDK */
export type Logger = SDKChannelLogSink;

/** Plugin gateway start context */
export type GatewayStartContext = SDKChannelGatewayContext<ResolvedAccount>;

/** Plugin gateway account stop result */
export interface GatewayStopResult {
  stop: () => void;
}

/** Bridge channel plugin definition */
export type BridgeChannelPlugin = SDKChannelPlugin<ResolvedAccount>;

export type { OpenClawConfig };
