import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_HEADER = 'x-request-id';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

/**
 * Per-request correlation: generate a UUID, attach it to the request logger,
 * echo it in the response. A user action gets a single `requestId` end-to-end
 * across web → api → sync → desktop.
 *
 * See ADR-0005 §"Correlation".
 */
export async function registerRequestContext(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id =
      typeof incoming === 'string' && /^[0-9a-f-]{8,}$/i.test(incoming)
        ? incoming
        : randomUUID();

    req.requestId = id;
    reply.header(REQUEST_ID_HEADER, id);
    req.log = req.log.child({ requestId: id });
  });
}
