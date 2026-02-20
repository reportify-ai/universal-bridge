import http from 'http';
import net from 'net';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import { getBridgeRuntime } from './runtime';
import { signPayload, verifySignature } from './utils';
import type {
  AccountConfig,
  ResolvedAccount,
  InboundMessage,
  OutboundPayload,
  GatewayStartContext,
  GatewayStopResult,
  BridgeChannelPlugin,
} from './types';

// ============ Config Helpers ============

function getConfig(cfg: OpenClawConfig): Record<string, any> {
  return cfg?.channels?.['universal-bridge'] ?? {};
}

function isConfigured(cfg: OpenClawConfig): boolean {
  const config = getConfig(cfg);
  if (config.accounts && Object.keys(config.accounts).length > 0) {
    return Object.values(config.accounts).some(
      (a: any) => Boolean(a?.webhookUrl && a?.userId),
    );
  }
  return Boolean(config.webhookUrl && config.userId);
}

// ============ Inbound Message Handler ============

// Send reply back to openclaw-proxy via webhook
async function sendReply(account: AccountConfig, to: string, text: string, log?: any): Promise<void> {
  const payload: OutboundPayload = {
    userId: account.userId,
    sessionId: to,
    text,
    timestamp: Date.now(),
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Timestamp': String(payload.timestamp),
  };
  if (account.secretKey) {
    headers['X-Signature'] = signPayload(body, account.secretKey);
  }

  const res = await fetch(account.webhookUrl, { method: 'POST', headers, body });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  log?.debug?.(`[Bridge] Reply sent: to=${to} text="${text.slice(0, 50)}"`);
}

async function handleInboundMessage(params: {
  cfg: OpenClawConfig;
  accountId: string;
  accountConfig: AccountConfig;
  msg: InboundMessage;
  log?: any;
}): Promise<void> {
  const { cfg, accountId, accountConfig, msg, log } = params;
  const rt = getBridgeRuntime();

  log?.debug?.('[Bridge] Inbound:', JSON.stringify(msg));

  const route = rt.channel.routing.resolveAgentRoute({
    cfg,
    channel: 'universal-bridge',
    accountId,
    peer: { kind: 'direct', id: msg.userId },
  });

  const storePath = rt.channel.session.resolveStorePath(cfg.session?.store, { agentId: route.agentId });
  const envelopeOptions = rt.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const previousTimestamp = rt.channel.session.readSessionUpdatedAt({ storePath, sessionKey: route.sessionKey });

  const fromLabel = `${msg.userId} (${msg.sessionId})`;
  const body = rt.channel.reply.formatInboundEnvelope({
    channel: 'Universal Bridge',
    from: fromLabel,
    timestamp: msg.timestamp,
    body: msg.text,
    chatType: 'direct',
    sender: { name: msg.userId, id: msg.userId },
    previousTimestamp,
    envelope: envelopeOptions,
  });

  const ctx = rt.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: msg.text,
    CommandBody: msg.text,
    From: msg.userId,
    To: accountId,
    SessionKey: route.sessionKey,
    AccountId: accountId,
    ChatType: 'direct' as const,
    ConversationLabel: fromLabel,
    SenderName: msg.userId,
    SenderId: msg.userId,
    Provider: 'universal-bridge',
    Surface: 'webhook',
    MessageSid: msg.messageId,
    Timestamp: msg.timestamp,
    CommandAuthorized: true,
    OriginatingChannel: 'universal-bridge',
    OriginatingTo: accountId,
  });

  await rt.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctx.SessionKey || route.sessionKey,
    ctx,
    updateLastRoute: { sessionKey: route.mainSessionKey, channel: 'universal-bridge', to: msg.userId, accountId },
    onRecordError: (err: unknown) => {
      log?.error?.(`[Bridge] Failed to record inbound session: ${String(err)}`);
    },
  });

  log?.info?.(`[Bridge] Inbound: from=${msg.userId} text="${msg.text.slice(0, 50)}..."`);

  await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx,
    cfg,
    dispatcherOptions: {
      responsePrefix: '',
      deliver: async (payload: any) => {
        const textToSend = payload.markdown || payload.text;
        if (!textToSend) return;
        try {
          await sendReply(accountConfig, msg.userId, textToSend, log);
        } catch (err: any) {
          log?.error?.(`[Bridge] Reply failed: ${err.message}`);
          throw err;
        }
      },
    },
  });
}

// ============ Channel Plugin Definition ============

export const bridgePlugin: BridgeChannelPlugin = {
  id: 'universal-bridge',
  meta: {
    id: 'universal-bridge',
    label: 'Universal Bridge',
    selectionLabel: 'Universal Bridge (Webhook)',
    docsPath: '/channels/universal-bridge',
    blurb: 'A generic bidirectional webhook bridge for connecting any IM platform.',
    aliases: ['ubridge', 'bridge'],
  },
  capabilities: {
    chatTypes: ['direct'] as Array<'direct' | 'group'>,
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: false,
  },
  reload: { configPrefixes: ['channels.universal-bridge'] },
  config: {
    listAccountIds: (cfg: OpenClawConfig): string[] => {
      const config = getConfig(cfg);
      return config.accounts && Object.keys(config.accounts).length > 0
        ? Object.keys(config.accounts)
        : isConfigured(cfg)
          ? ['default']
          : [];
    },
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null): ResolvedAccount => {
      const config = getConfig(cfg);
      const id = accountId || 'default';
      const account: AccountConfig | undefined = config.accounts?.[id] || config;
      const configured = Boolean(account?.webhookUrl && account?.userId);
      return {
        accountId: id,
        config: account ?? ({} as AccountConfig),
        enabled: account?.enabled !== false,
        configured,
      };
    },
    defaultAccountId: (): string => 'default',
    isConfigured: (account: ResolvedAccount): boolean => {
      return Boolean(account.config?.webhookUrl && account.config?.userId);
    },
    describeAccount: (account: ResolvedAccount) => ({
      accountId: account.accountId,
      name: 'Universal Bridge',
      enabled: account.enabled,
      configured: account.configured,
    }),
  },
  outbound: {
    deliveryMode: 'direct' as const,
    sendText: async ({ cfg, to, text, accountId, log }: any) => {
      const config = getConfig(cfg);
      const id = accountId || 'default';
      const account: AccountConfig = config.accounts?.[id] || config;

      const payload: OutboundPayload = {
        userId: account.userId,
        sessionId: to,
        text,
        timestamp: Date.now(),
      };

      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Timestamp': String(payload.timestamp),
      };
      if (account.secretKey) {
        headers['X-Signature'] = signPayload(body, account.secretKey);
      }

      const res = await fetch(account.webhookUrl, { method: 'POST', headers, body });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      log?.debug?.(`[Bridge] sendText: to=${to} text="${text.slice(0, 50)}"`);

      return {
        channel: 'universal-bridge',
        messageId: String(payload.timestamp),
      };
    },
  },
  gateway: {
    startAccount: async (ctx: GatewayStartContext): Promise<GatewayStopResult> => {
      const { account, cfg, abortSignal } = ctx;
      const config = account.config;

      if (!config.webhookUrl) {
        throw new Error('Universal Bridge webhookUrl is required');
      }

      const port = config.gatewayPort ?? 3100;

      ctx.log?.info?.(`[${account.accountId}] Starting webhook listener on port ${port}...`);

      // Detect if port is already in use (assume it's a previous instance still running)
      const portInUse = await new Promise<boolean>((resolve) => {
        const probe = net.createConnection({ port, host: '127.0.0.1' }, () => {
          probe.destroy();
          resolve(true);
        });
        probe.on('error', () => {
          resolve(false);
        });
      });

      if (portInUse) {
        ctx.log?.info?.(`[${account.accountId}] Port ${port} already in use, assuming previous instance is running. Skipping startup.`);
        ctx.setStatus({
          ...ctx.getStatus(),
          running: true,
          lastError: null,
        });
        return { stop: () => {} };
      }

      let stopped = false;

      // Check if already aborted
      if (abortSignal?.aborted) {
        ctx.log?.warn?.(`[${account.accountId}] Abort signal already active, skipping`);
        ctx.setStatus({
          ...ctx.getStatus(),
          running: false,
          lastError: 'Webhook listener aborted before start',
        });
        throw new Error('Webhook listener aborted before start');
      }

      const server = http.createServer(async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405).end();
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = Buffer.concat(chunks).toString();

          // HMAC signature verification (only when secretKey is configured)
          if (config.secretKey) {
            const signature = req.headers['x-signature'] as string;
            if (!signature || !verifySignature(body, signature, config.secretKey)) {
              res.writeHead(401).end('Invalid signature');
              return;
            }
          }

          const msg: InboundMessage = JSON.parse(body);

          await handleInboundMessage({
            cfg,
            accountId: account.accountId,
            accountConfig: config,
            msg,
            log: ctx.log,
          });

          res.writeHead(200).end('ok');
        } catch (err: any) {
          ctx.log?.error?.(`[${account.accountId}] Webhook handler error: ${err.message}`);
          res.writeHead(500).end('Internal error');
        }
      });

      // Wait for server to start listening, handle port conflicts
      await new Promise<void>((resolve, reject) => {
        server.on('error', (err: NodeJS.ErrnoException) => {
          const msg = err.code === 'EADDRINUSE'
            ? `Port ${port} is already in use. Change gatewayPort in openclaw.json or stop the process using this port.`
            : `Webhook listener failed to start: ${err.message}`;
          ctx.log?.error?.(`[${account.accountId}] ${msg}`);
          ctx.setStatus({
            ...ctx.getStatus(),
            running: false,
            lastError: msg,
          });
          reject(new Error(msg));
        });
        server.listen(port, () => {
          ctx.log?.info?.(`[${account.accountId}] Webhook listener ready on port ${port}`);
          resolve();
        });
      });

      // Update status: running
      ctx.setStatus({
        ...ctx.getStatus(),
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });

      // Handle abort signal for graceful shutdown
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          if (stopped) return;
          stopped = true;
          ctx.log?.info?.(`[${account.accountId}] Abort signal received, stopping webhook listener...`);
          server.close();
          ctx.setStatus({
            ...ctx.getStatus(),
            running: false,
            lastStopAt: Date.now(),
          });
        });
      }

      return {
        stop: () => {
          if (stopped) return;
          stopped = true;
          ctx.log?.info?.(`[${account.accountId}] Stopping webhook listener...`);
          server.close();
          ctx.setStatus({
            ...ctx.getStatus(),
            running: false,
            lastStopAt: Date.now(),
          });
          ctx.log?.info?.(`[${account.accountId}] Webhook listener stopped`);
        },
      };
    },
  },
  status: {
    defaultRuntime: { accountId: 'default', running: false, lastStartAt: null, lastStopAt: null, lastError: null },
    collectStatusIssues: (accounts: any[]) => {
      return accounts.flatMap((account) => {
        if (!account.configured) {
          return [
            {
              channel: 'universal-bridge',
              accountId: account.accountId,
              kind: 'config' as const,
              message: 'Account not configured (missing webhookUrl or userId)',
            },
          ];
        }
        return [];
      });
    },
    buildChannelSummary: ({ snapshot }: any) => ({
      configured: snapshot?.configured ?? false,
      running: snapshot?.running ?? false,
      lastStartAt: snapshot?.lastStartAt ?? null,
      lastStopAt: snapshot?.lastStopAt ?? null,
      lastError: snapshot?.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime, snapshot, probe }: any) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? snapshot?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? snapshot?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? snapshot?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? snapshot?.lastError ?? null,
      probe,
    }),
  },
};
