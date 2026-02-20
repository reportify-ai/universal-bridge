import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';
import { bridgePlugin } from './src/channel';
import { setBridgeRuntime } from './src/runtime';

const plugin = {
  id: 'universal-bridge',
  name: 'Universal Bridge',
  description: 'A generic bidirectional webhook bridge for connecting any IM platform.',
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    setBridgeRuntime(api.runtime);
    api.registerChannel({ plugin: bridgePlugin });
  },
};

export default plugin;
