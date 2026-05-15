import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';

const Uuid = z.string().uuid();

function paramsObject(req: FastifyRequest): Record<string, unknown> {
  return req.params && typeof req.params === 'object'
    ? (req.params as Record<string, unknown>)
    : {};
}

export function validateUuidParams(names: readonly string[]): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const params = paramsObject(req);
    for (const name of names) {
      if (!(name in params)) continue;
      if (!Uuid.safeParse(params[name]).success) {
        return reply.code(400).send({
          error: {
            code: 'invalid_id',
            message: `Invalid ${name}`,
            requestId: req.requestId,
          },
        });
      }
    }
  };
}
