/**
 * Reference data plugin (M2.5). Exposes CRUD for the four canonical
 * reference resources:
 *
 *   • country (ISO 3166-1)
 *   • region  (ISO 3166-2 / per-country subdivision)
 *   • city    (free-form within a region, autocomplete-friendly)
 *   • lookup  (universal flat list keyed by `kind` + `code`)
 *
 * Reads are open to any authenticated user. Writes require the
 * `platform_admin` role and pass through `withAudit` per ADR-0005.
 * No DELETE endpoints in V1 — `isActive=false` deactivates a row
 * without breaking historical references.
 */

import {
  CountryCreate,
  CountryListQuery,
  CountryUpdate,
  RegionCreate,
  RegionListQuery,
  RegionUpdate,
  CityCreate,
  CityListQuery,
  CityUpdate,
  LookupValueCreate,
  LookupValueListQuery,
  LookupValueUpdate,
} from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';

const log = moduleLogger('references');

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export const referencesPlugin: FeaturePlugin = {
  name: 'references',
  register: async (app) => {
    app.addHook('preHandler', validateUuidParams(['id']));

    app.get('/health/references', async () => ({ status: 'ok', module: 'references' }));

    // ─── Countries ──────────────────────────────────────────────────────
    app.get('/references/countries', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = CountryListQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: parsed.error.message,
            requestId: req.requestId,
          },
        });
      }
      const where: Prisma.CountryWhereInput = parsed.data.activeOnly ? { isActive: true } : {};
      const countries = await prisma.country.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      });
      return { countries };
    });

    app.get<{ Params: { id: string } }>(
      '/references/countries/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const country = await prisma.country.findUnique({ where: { id: req.params.id } });
        if (!country) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Country not found', requestId: req.requestId },
          });
        }
        return { country };
      },
    );

    app.post(
      '/references/countries',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = CountryCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const data = parsed.data;
        const createData = stripUndefined({
          codeIso2: data.codeIso2,
          nameRu: data.nameRu,
          nameEn: data.nameEn,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        }) as Prisma.CountryCreateInput;

        try {
          const country = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'country.created',
              scopeFederationId: null,
              scopeCompetitionId: null,
              targetType: 'country',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: { codeIso2: data.codeIso2, nameRu: data.nameRu },
            },
            (tx) => tx.country.create({ data: createData }),
          );
          log.info({ countryId: country.id, codeIso2: country.codeIso2 }, 'country created');
          return reply.code(201).send({ country });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'conflict',
                message: 'codeIso2 already exists',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }
      },
    );

    app.patch<{ Params: { id: string } }>(
      '/references/countries/:id',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = CountryUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const before = await prisma.country.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Country not found', requestId: req.requestId },
          });
        }
        const updateData = stripUndefined(parsed.data) as Prisma.CountryUpdateInput;
        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'country.updated',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'country',
            targetId: req.params.id,
            before,
            after: parsed.data,
          },
          (tx) => tx.country.update({ where: { id: req.params.id }, data: updateData }),
        );
        return { country: updated };
      },
    );

    // ─── Regions ────────────────────────────────────────────────────────
    app.get('/references/regions', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = RegionListQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: parsed.error.message,
            requestId: req.requestId,
          },
        });
      }
      const where: Prisma.RegionWhereInput = {
        ...(parsed.data.countryId ? { countryId: parsed.data.countryId } : {}),
        ...(parsed.data.activeOnly ? { isActive: true } : {}),
      };
      const regions = await prisma.region.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { nameRu: 'asc' }],
      });
      return { regions };
    });

    app.get<{ Params: { id: string } }>(
      '/references/regions/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const region = await prisma.region.findUnique({ where: { id: req.params.id } });
        if (!region) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Region not found', requestId: req.requestId },
          });
        }
        return { region };
      },
    );

    app.post(
      '/references/regions',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = RegionCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const data = parsed.data;
        const createData = stripUndefined({
          countryId: data.countryId,
          codeIso: data.codeIso,
          nameRu: data.nameRu,
          nameEn: data.nameEn,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        }) as Prisma.RegionUncheckedCreateInput;

        try {
          const region = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'region.created',
              scopeFederationId: null,
              scopeCompetitionId: null,
              targetType: 'region',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: { countryId: data.countryId, codeIso: data.codeIso, nameRu: data.nameRu },
            },
            (tx) => tx.region.create({ data: createData }),
          );
          log.info({ regionId: region.id, codeIso: region.codeIso }, 'region created');
          return reply.code(201).send({ region });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'conflict',
                message: 'codeIso already exists for this country',
                requestId: req.requestId,
              },
            });
          }
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
            return reply.code(400).send({
              error: {
                code: 'invalid_country',
                message: 'countryId does not exist',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }
      },
    );

    app.patch<{ Params: { id: string } }>(
      '/references/regions/:id',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = RegionUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const before = await prisma.region.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Region not found', requestId: req.requestId },
          });
        }
        const updateData = stripUndefined(parsed.data) as Prisma.RegionUpdateInput;
        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'region.updated',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'region',
            targetId: req.params.id,
            before,
            after: parsed.data,
          },
          (tx) => tx.region.update({ where: { id: req.params.id }, data: updateData }),
        );
        return { region: updated };
      },
    );

    // ─── Cities ─────────────────────────────────────────────────────────
    app.get('/references/cities', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = CityListQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: parsed.error.message,
            requestId: req.requestId,
          },
        });
      }
      const { regionId, countryId, q, activeOnly, limit, offset } = parsed.data;

      // countryId is a convenience filter — translates to `region.countryId`.
      // Direct regionId takes precedence when both are supplied.
      const where: Prisma.CityWhereInput = {
        ...(regionId ? { regionId } : {}),
        ...(!regionId && countryId ? { region: { countryId } } : {}),
        ...(activeOnly ? { isActive: true } : {}),
        ...(q
          ? {
              OR: [
                { nameRu: { contains: q, mode: 'insensitive' } },
                { nameEn: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [cities, total] = await Promise.all([
        prisma.city.findMany({
          where,
          orderBy: [{ nameRu: 'asc' }],
          take: limit,
          skip: offset,
        }),
        prisma.city.count({ where }),
      ]);

      return { cities, total, limit, offset };
    });

    app.get<{ Params: { id: string } }>(
      '/references/cities/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const city = await prisma.city.findUnique({ where: { id: req.params.id } });
        if (!city) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'City not found', requestId: req.requestId },
          });
        }
        return { city };
      },
    );

    app.post(
      '/references/cities',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = CityCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const data = parsed.data;
        const createData = stripUndefined({
          regionId: data.regionId,
          nameRu: data.nameRu,
          nameEn: data.nameEn,
          isActive: data.isActive,
        }) as Prisma.CityUncheckedCreateInput;

        try {
          const city = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'city.created',
              scopeFederationId: null,
              scopeCompetitionId: null,
              targetType: 'city',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: { regionId: data.regionId, nameRu: data.nameRu },
            },
            (tx) => tx.city.create({ data: createData }),
          );
          log.info({ cityId: city.id, nameRu: city.nameRu }, 'city created');
          return reply.code(201).send({ city });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'conflict',
                message: 'City already exists in this region',
                requestId: req.requestId,
              },
            });
          }
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
            return reply.code(400).send({
              error: {
                code: 'invalid_region',
                message: 'regionId does not exist',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }
      },
    );

    app.patch<{ Params: { id: string } }>(
      '/references/cities/:id',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = CityUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const before = await prisma.city.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'City not found', requestId: req.requestId },
          });
        }
        const updateData = stripUndefined(parsed.data) as Prisma.CityUpdateInput;
        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'city.updated',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'city',
            targetId: req.params.id,
            before,
            after: parsed.data,
          },
          (tx) => tx.city.update({ where: { id: req.params.id }, data: updateData }),
        );
        return { city: updated };
      },
    );

    // ─── Lookup values ──────────────────────────────────────────────────
    app.get('/references/lookups', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = LookupValueListQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: parsed.error.message,
            requestId: req.requestId,
          },
        });
      }
      const where: Prisma.LookupValueWhereInput = {
        ...(parsed.data.kind ? { kind: parsed.data.kind } : {}),
        ...(parsed.data.activeOnly ? { isActive: true } : {}),
      };
      const lookups = await prisma.lookupValue.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { nameRu: 'asc' }],
      });
      return { lookups };
    });

    app.get<{ Params: { id: string } }>(
      '/references/lookups/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const lookup = await prisma.lookupValue.findUnique({ where: { id: req.params.id } });
        if (!lookup) {
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Lookup value not found',
              requestId: req.requestId,
            },
          });
        }
        return { lookup };
      },
    );

    app.post(
      '/references/lookups',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = LookupValueCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const data = parsed.data;
        const createData = stripUndefined({
          kind: data.kind,
          code: data.code,
          nameRu: data.nameRu,
          nameEn: data.nameEn,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
          metadata: data.metadata as Prisma.InputJsonValue | undefined,
        }) as Prisma.LookupValueUncheckedCreateInput;

        try {
          const lookup = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'lookup.created',
              scopeFederationId: null,
              scopeCompetitionId: null,
              targetType: 'lookup_value',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: { kind: data.kind, code: data.code, nameRu: data.nameRu },
            },
            (tx) => tx.lookupValue.create({ data: createData }),
          );
          log.info({ lookupId: lookup.id, kind: lookup.kind, code: lookup.code }, 'lookup created');
          return reply.code(201).send({ lookup });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'conflict',
                message: 'A value with this code already exists for this kind',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }
      },
    );

    app.patch<{ Params: { id: string } }>(
      '/references/lookups/:id',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = LookupValueUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const before = await prisma.lookupValue.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Lookup value not found',
              requestId: req.requestId,
            },
          });
        }
        const updateData = stripUndefined({
          ...parsed.data,
          metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
        }) as Prisma.LookupValueUpdateInput;
        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'lookup.updated',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'lookup_value',
            targetId: req.params.id,
            before,
            after: parsed.data,
          },
          (tx) => tx.lookupValue.update({ where: { id: req.params.id }, data: updateData }),
        );
        return { lookup: updated };
      },
    );
  },
};
