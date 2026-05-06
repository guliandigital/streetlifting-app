import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export interface FeaturePlugin {
  name: string;
  register: FastifyPluginAsync;
}

/**
 * Register feature plugins independently. A failure in one plugin is logged
 * and skipped — the rest of the API continues to come up. See ADR-0003.
 *
 * Each feature module owns its routes, schemas, and error handling. Plugins
 * MUST NOT import from each other.
 */
export async function loadPlugins(app: FastifyInstance, plugins: FeaturePlugin[]): Promise<{
  loaded: string[];
  failed: { name: string; error: unknown }[];
}> {
  const loaded: string[] = [];
  const failed: { name: string; error: unknown }[] = [];

  for (const plugin of plugins) {
    try {
      await app.register(plugin.register, { prefix: '' });
      loaded.push(plugin.name);
      app.log.info({ module: plugin.name }, 'plugin loaded');
    } catch (error) {
      failed.push({ name: plugin.name, error });
      app.log.error({ module: plugin.name, err: error }, 'plugin failed to load — skipping');
    }
  }

  return { loaded, failed };
}
