import {
  AttemptUpsert,
  CompetitionDefaultSetup,
  FlightAutoPlan,
  JudgeAssignmentCreate,
  NominationDraw,
  NominationCreate,
  NominationUpdate,
  calculateNominationPlaces,
  calculateNominationScore,
  presets,
} from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth } from '../lib/auth/middleware.js';

const log = moduleLogger('competition-ops');

type UserWithRoles = {
  id: string;
  roles: Array<{ role: string; federationId: string | null; competitionId: string | null }>;
} | null;

const nominationInclude = {
  athlete: true,
  discipline: { include: { components: { orderBy: { order: 'asc' } } } },
  division: true,
  declaredWeightClass: true,
  weightClass: true,
  flight: true,
  group: true,
  attempts: { orderBy: [{ attemptNumber: 'asc' }], include: { component: true } },
} satisfies Prisma.NominationInclude;

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function canRead(user: UserWithRoles, competition: { id: string; federationId: string }): boolean {
  if (!user) return false;
  return user.roles.some(
    (r) =>
      r.role === 'platform_admin' ||
      r.federationId === competition.federationId ||
      r.competitionId === competition.id,
  );
}

function hasScopedRole(
  user: UserWithRoles,
  competition: { id: string; federationId: string },
  roles: readonly string[],
): boolean {
  if (!user) return false;
  return user.roles.some(
    (r) =>
      r.role === 'platform_admin' ||
      (roles.includes(r.role) &&
        (r.federationId === competition.federationId || r.competitionId === competition.id)),
  );
}

async function loadCompetition(competitionId: string) {
  return prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      federationId: true,
      code: true,
      nameRu: true,
      nameEn: true,
      startDate: true,
      endDate: true,
      entryFeeKopecks: true,
      federation: {
        select: {
          id: true,
          code: true,
          nameRu: true,
          billingTariffKopecksPerNomination: true,
        },
      },
    },
  });
}

function weightClassNameRu(preset: (typeof presets.ISF_V51_WEIGHT_CATEGORIES)[number]): string {
  if (preset.maxKg === null) return `свыше ${preset.minKg} кг`;
  return `до ${preset.maxKg} кг`;
}

function weightClassNameEn(preset: (typeof presets.ISF_V51_WEIGHT_CATEGORIES)[number]): string {
  if (preset.maxKg === null) return `over ${preset.minKg} kg`;
  return `up to ${preset.maxKg} kg`;
}

function dateOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

function paymentStatusFromLegacy(
  data: Pick<NominationCreate | NominationUpdate, 'paymentStatus' | 'isEntryFeePaid'>,
): 'unpaid' | 'partial' | 'paid' | 'waived' | 'refunded' | undefined {
  if (data.paymentStatus) return data.paymentStatus;
  if (data.isEntryFeePaid === true) return 'paid';
  if (data.isEntryFeePaid === false) return 'unpaid';
  return undefined;
}

function isPaidLike(status: string | undefined): boolean | undefined {
  if (!status) return undefined;
  return status === 'paid' || status === 'waived';
}

function toNominationCreateData(
  competitionId: string,
  data: NominationCreate,
): Prisma.NominationUncheckedCreateInput {
  const paymentStatus = paymentStatusFromLegacy(data) ?? 'unpaid';
  return stripUndefined({
    competitionId,
    athleteId: data.athleteId,
    disciplineId: data.disciplineId,
    divisionId: data.divisionId,
    declaredWeightClassId: data.declaredWeightClassId ?? data.weightClassId,
    weightClassId: data.weightClassId,
    bodyWeightAtWeighIn: data.bodyWeightAtWeighIn,
    entryNumber: data.entryNumber,
    flightId: data.flightId,
    groupId: data.groupId,
    status: data.status,
    isEntryFeePaid: isPaidLike(paymentStatus) ?? data.isEntryFeePaid,
    paymentStatus,
    paidAmountKopecks: BigInt(data.paidAmountKopecks),
    paymentMethod: data.paymentMethod,
    paymentComment: data.paymentComment,
    paidAt: dateOrNull(data.paidAt),
    isMandatePassed: data.isMandatePassed,
    notes: data.notes,
  }) as Prisma.NominationUncheckedCreateInput;
}

function toNominationUpdateData(data: NominationUpdate): Prisma.NominationUncheckedUpdateInput {
  const paymentStatus = paymentStatusFromLegacy(data);
  const status =
    data.status ??
    (data.bodyWeightAtWeighIn !== undefined && data.bodyWeightAtWeighIn !== null
      ? 'weighed_in'
      : isPaidLike(paymentStatus) === true
        ? 'paid'
        : undefined);

  return stripUndefined({
    bodyWeightAtWeighIn: data.bodyWeightAtWeighIn,
    entryNumber: data.entryNumber,
    declaredWeightClassId: data.declaredWeightClassId,
    weightClassId: data.weightClassId,
    flightId: data.flightId,
    groupId: data.groupId,
    status,
    isEntryFeePaid: isPaidLike(paymentStatus) ?? data.isEntryFeePaid,
    paymentStatus,
    paidAmountKopecks:
      data.paidAmountKopecks === undefined ? undefined : BigInt(data.paidAmountKopecks),
    paymentMethod: data.paymentMethod,
    paymentComment: data.paymentComment,
    paidAt: dateOrNull(data.paidAt),
    isMandatePassed: data.isMandatePassed,
    notes: data.notes,
  }) as Prisma.NominationUncheckedUpdateInput;
}

function toAttemptData(data: AttemptUpsert): Prisma.AttemptUncheckedCreateInput {
  return stripUndefined({
    componentId: data.componentId,
    attemptNumber: data.attemptNumber,
    weightKg: data.weightKg,
    result: data.result,
    judgeDecisions: data.judgeDecisions as Prisma.InputJsonValue,
    repsCount: data.repsCount,
    timeoutSeconds: data.timeoutSeconds,
    startedAt: dateOrNull(data.startedAt),
    decidedAt:
      data.decidedAt === undefined && data.result !== 'pending' ? new Date() : dateOrNull(data.decidedAt),
    notes: data.notes,
  }) as Prisma.AttemptUncheckedCreateInput;
}

async function validateNominationRefs(
  competitionId: string,
  data: Pick<NominationCreate, 'athleteId' | 'disciplineId' | 'divisionId' | 'weightClassId' | 'declaredWeightClassId'> &
    Pick<NominationCreate, 'flightId' | 'groupId'>,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const [athlete, discipline, division, declaredWeightClass, weightClass, flight, group] = await Promise.all([
    prisma.athlete.findUnique({ where: { id: data.athleteId }, select: { id: true } }),
    prisma.discipline.findUnique({ where: { id: data.disciplineId }, select: { id: true } }),
    prisma.division.findUnique({ where: { id: data.divisionId }, select: { id: true, competitionId: true } }),
    data.declaredWeightClassId
      ? prisma.weightClass.findUnique({
          where: { id: data.declaredWeightClassId },
          select: { id: true, divisionId: true, disciplineId: true },
        })
      : Promise.resolve(null),
    prisma.weightClass.findUnique({
      where: { id: data.weightClassId },
      select: { id: true, divisionId: true, disciplineId: true },
    }),
    data.flightId
      ? prisma.flight.findUnique({ where: { id: data.flightId }, select: { id: true, competitionId: true } })
      : Promise.resolve(null),
    data.groupId
      ? prisma.group.findUnique({
          where: { id: data.groupId },
          select: { id: true, flight: { select: { id: true, competitionId: true } } },
        })
      : Promise.resolve(null),
  ]);

  if (!athlete) return { ok: false, code: 'athlete_not_found', message: 'Athlete not found' };
  if (!discipline) return { ok: false, code: 'discipline_not_found', message: 'Discipline not found' };
  if (!division || division.competitionId !== competitionId) {
    return { ok: false, code: 'division_out_of_scope', message: 'Division is not in this competition' };
  }
  if (!weightClass || weightClass.divisionId !== data.divisionId) {
    return { ok: false, code: 'weight_class_out_of_scope', message: 'Weight class is not in this division' };
  }
  if (data.declaredWeightClassId && (!declaredWeightClass || declaredWeightClass.divisionId !== data.divisionId)) {
    return {
      ok: false,
      code: 'declared_weight_class_out_of_scope',
      message: 'Declared weight class is not in this division',
    };
  }
  if (weightClass.disciplineId && weightClass.disciplineId !== data.disciplineId) {
    return { ok: false, code: 'weight_class_discipline_mismatch', message: 'Weight class discipline mismatch' };
  }
  if (declaredWeightClass?.disciplineId && declaredWeightClass.disciplineId !== data.disciplineId) {
    return {
      ok: false,
      code: 'declared_weight_class_discipline_mismatch',
      message: 'Declared weight class discipline mismatch',
    };
  }
  if (data.flightId && (!flight || flight.competitionId !== competitionId)) {
    return { ok: false, code: 'flight_out_of_scope', message: 'Flight is not in this competition' };
  }
  if (data.groupId && (!group || group.flight.competitionId !== competitionId)) {
    return { ok: false, code: 'group_out_of_scope', message: 'Group is not in this competition' };
  }
  if (data.flightId && group && group.flight.id !== data.flightId) {
    return { ok: false, code: 'group_flight_mismatch', message: 'Group is not in this flight' };
  }
  return { ok: true };
}

async function findWeightClassForBodyWeight(
  divisionId: string,
  disciplineId: string,
  bodyWeightKg: number | null | undefined,
): Promise<string | undefined> {
  if (bodyWeightKg === undefined || bodyWeightKg === null) return undefined;
  const weightClasses = await prisma.weightClass.findMany({
    where: {
      divisionId,
      OR: [{ disciplineId }, { disciplineId: null }],
    },
    orderBy: { order: 'asc' },
  });
  const match = weightClasses.find((weightClass) => {
    const aboveMin = weightClass.weightMin === null || bodyWeightKg > weightClass.weightMin;
    const belowMax = weightClass.weightMax === null || bodyWeightKg <= weightClass.weightMax;
    return aboveMin && belowMax;
  });
  return match?.id;
}

async function validateNominationOperationalRefs(
  competitionId: string,
  divisionId: string,
  disciplineId: string,
  data: Pick<NominationUpdate, 'declaredWeightClassId' | 'weightClassId' | 'flightId' | 'groupId'>,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const [declaredWeightClass, weightClass, flight, group] = await Promise.all([
    data.declaredWeightClassId
      ? prisma.weightClass.findUnique({
          where: { id: data.declaredWeightClassId },
          select: { id: true, divisionId: true, disciplineId: true },
        })
      : Promise.resolve(null),
    data.weightClassId
      ? prisma.weightClass.findUnique({
          where: { id: data.weightClassId },
          select: { id: true, divisionId: true, disciplineId: true },
        })
      : Promise.resolve(null),
    data.flightId
      ? prisma.flight.findUnique({ where: { id: data.flightId }, select: { id: true, competitionId: true } })
      : Promise.resolve(null),
    data.groupId
      ? prisma.group.findUnique({
          where: { id: data.groupId },
          select: { id: true, flight: { select: { id: true, competitionId: true } } },
        })
      : Promise.resolve(null),
  ]);

  for (const [kind, weightClassRef] of [
    ['declared_weight_class', declaredWeightClass],
    ['weight_class', weightClass],
  ] as const) {
    if (!weightClassRef) continue;
    if (weightClassRef.divisionId !== divisionId) {
      return { ok: false, code: `${kind}_out_of_scope`, message: 'Weight class is not in this division' };
    }
    if (weightClassRef.disciplineId && weightClassRef.disciplineId !== disciplineId) {
      return {
        ok: false,
        code: `${kind}_discipline_mismatch`,
        message: 'Weight class discipline mismatch',
      };
    }
  }
  if (data.flightId && (!flight || flight.competitionId !== competitionId)) {
    return { ok: false, code: 'flight_out_of_scope', message: 'Flight is not in this competition' };
  }
  if (data.groupId && (!group || group.flight.competitionId !== competitionId)) {
    return { ok: false, code: 'group_out_of_scope', message: 'Group is not in this competition' };
  }
  if (data.flightId && group && group.flight.id !== data.flightId) {
    return { ok: false, code: 'group_flight_mismatch', message: 'Group is not in this flight' };
  }
  return { ok: true };
}

async function recalculateNomination(tx: Prisma.TransactionClient, nominationId: string): Promise<void> {
  const nomination = await tx.nomination.findUnique({
    where: { id: nominationId },
    select: {
      id: true,
      disciplineId: true,
      divisionId: true,
      weightClassId: true,
      bodyWeightAtWeighIn: true,
      entryNumber: true,
      status: true,
      discipline: { select: { attemptCount: true, format: true, components: { orderBy: { order: 'asc' } } } },
      attempts: { orderBy: { attemptNumber: 'asc' } },
    },
  });
  if (!nomination) return;

  const score = calculateNominationScore({
    id: nomination.id,
    disciplineId: nomination.disciplineId,
    divisionId: nomination.divisionId,
    weightClassId: nomination.weightClassId,
    bodyWeightAtWeighIn: nomination.bodyWeightAtWeighIn,
    entryNumber: nomination.entryNumber,
    status: nomination.status,
    discipline: {
      format: nomination.discipline.format,
      attemptCount: nomination.discipline.attemptCount,
    },
    components: nomination.discipline.components.map((component) => ({
      id: component.id,
      attemptCount: component.attemptCount,
      fixedWeightKg: component.fixedWeightKg,
    })),
    attempts: nomination.attempts.map((attempt) => ({
      componentId: attempt.componentId,
      attemptNumber: attempt.attemptNumber,
      weightKg: attempt.weightKg,
      result: attempt.result,
      repsCount: attempt.repsCount,
    })),
  });
  const requiredAttemptCount =
    nomination.discipline.components.length > 0
      ? nomination.discipline.components.reduce((sum, component) => sum + component.attemptCount, 0)
      : nomination.discipline.attemptCount;
  const hasEnoughAttempts = nomination.attempts.length >= requiredAttemptCount;
  const nextStatus =
    nomination.status === 'disqualified' || nomination.status === 'withdrawn'
      ? nomination.status
      : hasEnoughAttempts && !score.hasPendingAttempts
        ? 'finished'
        : nomination.attempts.length > 0
          ? 'on_platform'
          : nomination.status;

  await tx.nomination.update({
    where: { id: nominationId },
    data: {
      bestSuccessfulAttemptKg: score.bestSuccessfulAttemptKg,
      finalScore: score.finalScore,
      status: nextStatus,
    },
  });
}

async function recalculateCompetitionPlacings(
  tx: Prisma.TransactionClient,
  competitionId: string,
): Promise<void> {
  const nominations = await tx.nomination.findMany({
    where: { competitionId },
    select: {
      id: true,
      disciplineId: true,
      divisionId: true,
      weightClassId: true,
      bodyWeightAtWeighIn: true,
      entryNumber: true,
      status: true,
      finalScore: true,
      discipline: { select: { format: true, attemptCount: true } },
    },
  });
  const places = calculateNominationPlaces(
    nominations.map((nomination) => ({
      id: nomination.id,
      disciplineId: nomination.disciplineId,
      divisionId: nomination.divisionId,
      weightClassId: nomination.weightClassId,
      bodyWeightAtWeighIn: nomination.bodyWeightAtWeighIn,
      entryNumber: nomination.entryNumber,
      status: nomination.status,
      finalScore: nomination.finalScore,
      discipline: nomination.discipline,
      components: [],
      attempts: [],
    })),
  );

  await Promise.all(
    places.map((place) =>
      tx.nomination.update({
        where: { id: place.nominationId },
        data: {
          placeInClass: place.placeInClass,
          placeInDivision: place.placeInDivision,
          placeOverall: place.placeOverall,
        },
      }),
    ),
  );
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (!/[",\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function sendCsv(reply: { header: (name: string, value: string) => unknown; send: (body: string) => unknown }, filename: string, rows: unknown[][]) {
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  reply.header('content-type', 'text/csv; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="${filename}"`);
  return reply.send(`\uFEFF${body}\n`);
}

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function xmlEscape(value: unknown): string {
  const safe = Array.from(String(value ?? ''))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join('');
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

function xlsxSheet(rows: unknown[][]): string {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function zipStore(files: Array<{ name: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + content.length;
  }

  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, central, eocd]);
}

function buildXlsx(rows: unknown[][]): Buffer {
  return zipStore([
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
    },
    {
      name: 'docProps/core.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Streetlifting App</dc:creator><dc:title>Competition export</dc:title></cp:coreProperties>',
    },
    {
      name: 'docProps/app.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Streetlifting App</Application></Properties>',
    },
    {
      name: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Protocol" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    { name: 'xl/worksheets/sheet1.xml', content: xlsxSheet(rows) },
  ]);
}

function sendXlsx(reply: { header: (name: string, value: string) => unknown; send: (body: Buffer) => unknown }, filename: string, rows: unknown[][]) {
  reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header('content-disposition', `attachment; filename="${filename}"`);
  return reply.send(buildXlsx(rows));
}

async function getOpsPayload(competitionId: string) {
  const [competition, divisions, platforms, judgeAssignments, nominations] = await Promise.all([
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        federationId: true,
        code: true,
        nameRu: true,
        nameEn: true,
        startDate: true,
        endDate: true,
        entryFeeKopecks: true,
        federation: {
          select: {
            id: true,
            code: true,
            nameRu: true,
            billingTariffKopecksPerNomination: true,
          },
        },
      },
    }),
    prisma.division.findMany({
      where: { competitionId },
      orderBy: [{ gender: 'asc' }, { code: 'asc' }],
      include: { weightClasses: { orderBy: { order: 'asc' } } },
    }),
    prisma.platform.findMany({
      where: { competitionId },
      orderBy: { order: 'asc' },
      include: { flights: { orderBy: { order: 'asc' }, include: { groups: { orderBy: { order: 'asc' } } } } },
    }),
    prisma.judgeAssignment.findMany({
      where: { competitionId },
      orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }],
      include: { judge: true, platform: true },
    }),
    prisma.nomination.findMany({
      where: { competitionId },
      orderBy: [{ entryNumber: 'asc' }, { createdAt: 'asc' }],
      include: nominationInclude,
    }),
  ]);

  if (!competition) return null;

  const total = nominations.length;
  const paid = nominations.filter((n) => n.paymentStatus === 'paid' || n.paymentStatus === 'waived').length;
  const weighedIn = nominations.filter((n) => n.bodyWeightAtWeighIn !== null).length;
  const mandatePassed = nominations.filter((n) => n.isMandatePassed).length;
  const entryFee = Number(competition.entryFeeKopecks);
  const paidEntryFees = nominations.reduce((sum, n) => sum + Number(n.paidAmountKopecks), 0);
  const scoreboardRows = [...nominations]
    .sort(
      (a, b) =>
        (a.discipline.nameRu.localeCompare(b.discipline.nameRu)) ||
        ((a.placeInClass ?? Number.POSITIVE_INFINITY) - (b.placeInClass ?? Number.POSITIVE_INFINITY)) ||
        (Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0)) ||
        ((a.entryNumber ?? Number.POSITIVE_INFINITY) - (b.entryNumber ?? Number.POSITIVE_INFINITY)),
    )
    .map((n) => ({
      nominationId: n.id,
      entryNumber: n.entryNumber,
      athleteName: [n.athlete.lastName, n.athlete.firstName, n.athlete.middleName].filter(Boolean).join(' '),
      discipline: n.discipline.nameRu,
      division: n.division.nameRu,
      weightClass: n.weightClass.nameRu,
      placeInClass: n.placeInClass,
      placeInDivision: n.placeInDivision,
      placeOverall: n.placeOverall,
      bestSuccessfulAttemptKg: n.bestSuccessfulAttemptKg,
      finalScore: n.finalScore,
      status: n.status,
    }));

  return {
    competition,
    divisions,
    platforms,
    judgeAssignments,
    nominations,
    scoreboardRows,
    accounting: {
      totalNominations: total,
      paidNominations: paid,
      unpaidNominations: total - paid,
      weighedInNominations: weighedIn,
      mandatePassedNominations: mandatePassed,
      expectedEntryFeeKopecks: total * entryFee,
      paidEntryFeeKopecks: paidEntryFees,
      federationBillingKopecks:
        weighedIn * Number(competition.federation.billingTariffKopecksPerNomination),
    },
  };
}

type OpsPayload = NonNullable<Awaited<ReturnType<typeof getOpsPayload>>>;

function athleteName(nomination: OpsPayload['nominations'][number]): string {
  return [nomination.athlete.lastName, nomination.athlete.firstName, nomination.athlete.middleName]
    .filter(Boolean)
    .join(' ');
}

function attemptExportSummary(nomination: OpsPayload['nominations'][number]): string {
  return nomination.attempts
    .map((attempt) =>
      [
        attempt.component?.code ?? 'default',
        attempt.attemptNumber,
        attempt.weightKg,
        attempt.repsCount ?? '',
        attempt.result,
      ].join(':'),
    )
    .join(' | ');
}

function protocolRows(payload: OpsPayload): unknown[][] {
  const ranked = [...payload.nominations].sort(
    (a, b) =>
      ((a.placeInClass ?? Number.POSITIVE_INFINITY) - (b.placeInClass ?? Number.POSITIVE_INFINITY)) ||
      (Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0)) ||
      (Number(b.bestSuccessfulAttemptKg ?? 0) - Number(a.bestSuccessfulAttemptKg ?? 0)) ||
      `${a.athlete.lastName} ${a.athlete.firstName}`.localeCompare(`${b.athlete.lastName} ${b.athlete.firstName}`),
  );

  return [
    [
      'place',
      'placeInClass',
      'placeInDivision',
      'placeOverall',
      'entryNumber',
      'athlete',
      'discipline',
      'division',
      'declaredWeightClass',
      'weightClass',
      'bodyWeight',
      'bestKg',
      'score',
      'attempts',
      'status',
    ],
    ...ranked.map((n, index) => [
      index + 1,
      n.placeInClass,
      n.placeInDivision,
      n.placeOverall,
      n.entryNumber,
      athleteName(n),
      n.discipline.nameRu,
      n.division.nameRu,
      n.declaredWeightClass?.nameRu ?? '',
      n.weightClass.nameRu,
      n.bodyWeightAtWeighIn,
      n.bestSuccessfulAttemptKg,
      n.finalScore,
      attemptExportSummary(n),
      n.status,
    ]),
  ];
}

function accountingRows(payload: OpsPayload): unknown[][] {
  return [
    ['competition code', payload.competition.code],
    ['competition', payload.competition.nameRu],
    ['federation code', payload.competition.federation.code],
    ['federation', payload.competition.federation.nameRu],
    ['total nominations', payload.accounting.totalNominations],
    ['paid nominations', payload.accounting.paidNominations],
    ['unpaid nominations', payload.accounting.unpaidNominations],
    ['weighed-in nominations', payload.accounting.weighedInNominations],
    ['expected entry fee kopecks', payload.accounting.expectedEntryFeeKopecks],
    ['paid entry fee kopecks', payload.accounting.paidEntryFeeKopecks],
    ['federation billing kopecks', payload.accounting.federationBillingKopecks],
    [],
    [
      'entryNumber',
      'athlete',
      'paymentStatus',
      'paidAmountKopecks',
      'paymentMethod',
      'paidAt',
      'mandate',
      'bodyWeight',
      'status',
      'entryFeeKopecks',
      'paymentComment',
    ],
    ...payload.nominations.map((n) => [
      n.entryNumber,
      athleteName(n),
      n.paymentStatus,
      n.paidAmountKopecks.toString(),
      n.paymentMethod,
      n.paidAt?.toISOString(),
      n.isMandatePassed ? 'yes' : 'no',
      n.bodyWeightAtWeighIn,
      n.status,
      payload.competition.entryFeeKopecks.toString(),
      n.paymentComment,
    ]),
  ];
}

export const competitionOpsPlugin: FeaturePlugin = {
  name: 'competition-ops',
  register: async (app) => {
    app.get('/health/competition-ops', async () => ({ status: 'ok', module: 'competition-ops' }));

    app.get<{ Params: { id: string } }>(
      '/competitions/:id/ops',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const payload = await getOpsPayload(req.params.id);
        if (!payload) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!canRead(req.user, payload.competition)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        return payload;
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competitions/:id/setup/default',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const competition = await loadCompetition(req.params.id);
        if (!competition) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, competition, ['federation_admin', 'secretary'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'competition setup role required', requestId: req.requestId },
          });
        }

        const parsed = CompetitionDefaultSetup.safeParse(req.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }

        const result = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'competition.default_setup_applied',
            scopeFederationId: competition.federationId,
            scopeCompetitionId: competition.id,
            targetType: 'competition',
            targetId: competition.id,
            before: null,
            after: parsed.data,
          },
          async (tx) => {
            const platform = await tx.platform.upsert({
              where: { competitionId_order: { competitionId: competition.id, order: 1 } },
              create: { competitionId: competition.id, name: parsed.data.platformName, order: 1 },
              update: { name: parsed.data.platformName },
            });
            const flight = await tx.flight.upsert({
              where: { competitionId_code: { competitionId: competition.id, code: parsed.data.flightCode } },
              create: {
                competitionId: competition.id,
                platformId: platform.id,
                code: parsed.data.flightCode,
                name: parsed.data.flightName,
                order: 1,
              },
              update: { platformId: platform.id, name: parsed.data.flightName, order: 1 },
            });
            const existingGroup = await tx.group.findFirst({ where: { flightId: flight.id, order: 1 } });
            if (!existingGroup) {
              await tx.group.create({ data: { flightId: flight.id, name: `${parsed.data.flightCode}-1`, order: 1 } });
            }

            let divisions = 0;
            let weightClasses = 0;
            for (const gender of ['M', 'F'] as const) {
              const division = await tx.division.upsert({
                where: { competitionId_code: { competitionId: competition.id, code: `${gender}_OPEN` } },
                create: {
                  competitionId: competition.id,
                  code: `${gender}_OPEN`,
                  nameRu: gender === 'M' ? 'Мужчины, open' : 'Женщины, open',
                  nameEn: gender === 'M' ? 'Men, open' : 'Women, open',
                  gender,
                  veteranTier: 'open',
                  veteranCoefficient: 1,
                },
                update: {},
              });
              divisions++;

              const presetsForGender = presets.ISF_V51_WEIGHT_CATEGORIES.filter((p) => p.sex === gender);
              for (const [index, p] of presetsForGender.entries()) {
                const existing = await tx.weightClass.findFirst({
                  where: { divisionId: division.id, code: p.code },
                  select: { id: true },
                });
                const data = {
                  code: p.code,
                  nameRu: weightClassNameRu(p),
                  nameEn: weightClassNameEn(p),
                  weightMin: p.minKg,
                  weightMax: p.maxKg,
                  order: index + 1,
                };
                if (existing) {
                  await tx.weightClass.update({ where: { id: existing.id }, data });
                } else {
                  await tx.weightClass.create({ data: { ...data, divisionId: division.id } });
                }
                weightClasses++;
              }
            }

            return { platformId: platform.id, flightId: flight.id, divisions, weightClasses };
          },
        );

        log.info({ competitionId: competition.id, ...result }, 'default competition setup applied');
        return { setup: result };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competitions/:id/judge-assignments',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const competition = await loadCompetition(req.params.id);
        if (!competition) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, competition, ['federation_admin', 'secretary'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'judge assignment role required', requestId: req.requestId },
          });
        }

        const parsed = JudgeAssignmentCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }

        const [judge, platform, duplicate] = await Promise.all([
          prisma.judge.findUnique({ where: { id: parsed.data.judgeId }, select: { id: true } }),
          parsed.data.platformId
            ? prisma.platform.findUnique({
                where: { id: parsed.data.platformId },
                select: { id: true, competitionId: true },
              })
            : Promise.resolve(null),
          prisma.judgeAssignment.findFirst({
            where: {
              competitionId: competition.id,
              judgeId: parsed.data.judgeId,
              platformId: parsed.data.platformId ?? null,
              role: parsed.data.role,
            },
            select: { id: true },
          }),
        ]);

        if (!judge) {
          return reply.code(404).send({
            error: { code: 'judge_not_found', message: 'Judge not found', requestId: req.requestId },
          });
        }
        if (parsed.data.platformId && (!platform || platform.competitionId !== competition.id)) {
          return reply.code(400).send({
            error: { code: 'platform_out_of_scope', message: 'Platform is not in this competition', requestId: req.requestId },
          });
        }
        if (duplicate) {
          return reply.code(409).send({
            error: { code: 'judge_assignment_exists', message: 'Judge assignment already exists', requestId: req.requestId },
          });
        }

        try {
          const judgeAssignment = await prisma.$transaction(async (tx) => {
            const created = await tx.judgeAssignment.create({
              data: {
                competitionId: competition.id,
                judgeId: parsed.data.judgeId,
                platformId: parsed.data.platformId ?? null,
                role: parsed.data.role,
              },
              include: { judge: true, platform: true },
            });
            await audit.record(
              {
                ...audit.fromRequest(req),
                actorUserId: req.user!.id,
                action: 'judge_assignment.created',
                scopeFederationId: competition.federationId,
                scopeCompetitionId: competition.id,
                targetType: 'judge_assignment',
                targetId: created.id,
                before: null,
                after: parsed.data,
                result: 'success',
              },
              tx,
            );
            return created;
          });

          return reply.code(201).send({ judgeAssignment });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: { code: 'judge_assignment_exists', message: 'Judge assignment already exists', requestId: req.requestId },
            });
          }
          throw err;
        }
      },
    );

    app.delete<{ Params: { assignmentId: string } }>(
      '/judge-assignments/:assignmentId',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const before = await prisma.judgeAssignment.findUnique({
          where: { id: req.params.assignmentId },
          include: { competition: { select: { id: true, federationId: true } } },
        });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Judge assignment not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, before.competition, ['federation_admin', 'secretary'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'judge assignment role required', requestId: req.requestId },
          });
        }

        await prisma.$transaction(async (tx) => {
          await tx.judgeAssignment.delete({ where: { id: before.id } });
          await audit.record(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'judge_assignment.deleted',
              scopeFederationId: before.competition.federationId,
              scopeCompetitionId: before.competition.id,
              targetType: 'judge_assignment',
              targetId: before.id,
              before: {
                id: before.id,
                judgeId: before.judgeId,
                platformId: before.platformId,
                role: before.role,
                assignedAt: before.assignedAt.toISOString(),
              },
              after: null,
              result: 'success',
            },
            tx,
          );
        });

        return { deleted: true };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competitions/:id/nominations',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const competition = await loadCompetition(req.params.id);
        if (!competition) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, competition, ['federation_admin', 'secretary'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'nomination write role required', requestId: req.requestId },
          });
        }

        const parsed = NominationCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }
        const refCheck = await validateNominationRefs(competition.id, parsed.data);
        if (!refCheck.ok) {
          return reply.code(400).send({
            error: { code: refCheck.code, message: refCheck.message, requestId: req.requestId },
          });
        }

        try {
          const nomination = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'nomination.created',
              scopeFederationId: competition.federationId,
              scopeCompetitionId: competition.id,
              targetType: 'nomination',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: parsed.data,
            },
            (tx) =>
              tx.nomination.create({
                data: toNominationCreateData(competition.id, parsed.data),
                include: nominationInclude,
              }),
          );
          return reply.code(201).send({ nomination });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: { code: 'nomination_exists', message: 'Athlete already has this nomination', requestId: req.requestId },
            });
          }
          throw err;
        }
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competitions/:id/nominations/draw',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const competition = await loadCompetition(req.params.id);
        if (!competition) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, competition, ['federation_admin', 'secretary'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'nomination draw role required', requestId: req.requestId },
          });
        }

        const parsed = NominationDraw.safeParse(req.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }

        const result = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'nomination.draw_applied',
            scopeFederationId: competition.federationId,
            scopeCompetitionId: competition.id,
            targetType: 'competition',
            targetId: competition.id,
            before: null,
            after: parsed.data,
          },
          async (tx) => {
            const nominations = await tx.nomination.findMany({
              where: {
                competitionId: competition.id,
                ...(parsed.data.overwrite ? {} : { entryNumber: null }),
              },
              include: {
                athlete: true,
                discipline: true,
                division: true,
                weightClass: true,
              },
              orderBy: [
                { discipline: { code: 'asc' } },
                { division: { code: 'asc' } },
                { weightClass: { order: 'asc' } },
                { athlete: { lastName: 'asc' } },
                { athlete: { firstName: 'asc' } },
              ],
            });
            const maxExisting = parsed.data.overwrite
              ? 0
              : ((await tx.nomination.aggregate({
                  where: { competitionId: competition.id },
                  _max: { entryNumber: true },
                }))._max.entryNumber ?? 0);

            await Promise.all(
              nominations.map((nomination, index) =>
                tx.nomination.update({
                  where: { id: nomination.id },
                  data: { entryNumber: maxExisting + index + 1 },
                }),
              ),
            );
            return { assigned: nominations.length, firstNumber: nominations.length > 0 ? maxExisting + 1 : null };
          },
        );

        return { draw: result };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competitions/:id/flights/auto-plan',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const competition = await loadCompetition(req.params.id);
        if (!competition) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, competition, ['federation_admin', 'secretary'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'flight planning role required', requestId: req.requestId },
          });
        }

        const parsed = FlightAutoPlan.safeParse(req.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }

        const result = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'competition.flights_auto_planned',
            scopeFederationId: competition.federationId,
            scopeCompetitionId: competition.id,
            targetType: 'competition',
            targetId: competition.id,
            before: null,
            after: parsed.data,
          },
          async (tx) => {
            const platform = await tx.platform.upsert({
              where: { competitionId_order: { competitionId: competition.id, order: 1 } },
              create: { competitionId: competition.id, name: parsed.data.platformName, order: 1 },
              update: { name: parsed.data.platformName },
            });
            const nominations = await tx.nomination.findMany({
              where: {
                competitionId: competition.id,
                status: { notIn: ['withdrawn', 'disqualified'] },
              },
              include: {
                discipline: { include: { components: { orderBy: { order: 'asc' } } } },
                weightClass: true,
                athlete: true,
              },
              orderBy: [
                { discipline: { code: 'asc' } },
                { weightClass: { order: 'asc' } },
                { entryNumber: 'asc' },
              ],
            });
            const grouped = new Map<string, typeof nominations>();
            for (const nomination of nominations) {
              grouped.set(nomination.disciplineId, [...(grouped.get(nomination.disciplineId) ?? []), nomination]);
            }

            let cursor = parsed.data.startAt
              ? new Date(parsed.data.startAt)
              : new Date(`${competition.startDate.toISOString().slice(0, 10)}T10:00:00.000Z`);
            const plan: Array<{
              flightId: string;
              code: string;
              nominations: number;
              groups: number;
              startTime: string;
              estimatedMinutes: number;
            }> = [];
            let flightOrder = 1;

            for (const nominationsInFlight of grouped.values()) {
              const discipline = nominationsInFlight[0]?.discipline;
              if (!discipline) continue;
              const code = `F${flightOrder}`;
              const flight = await tx.flight.upsert({
                where: { competitionId_code: { competitionId: competition.id, code } },
                create: {
                  competitionId: competition.id,
                  platformId: platform.id,
                  code,
                  name: discipline.nameRu,
                  order: flightOrder,
                  startTime: cursor,
                },
                update: {
                  platformId: platform.id,
                  name: discipline.nameRu,
                  order: flightOrder,
                  startTime: cursor,
                },
              });
              const attemptsPerNomination =
                discipline.components.length > 0
                  ? discipline.components.reduce((sum, component) => sum + component.attemptCount, 0)
                  : discipline.attemptCount;
              const chunks: Array<typeof nominationsInFlight> = [];
              for (let i = 0; i < nominationsInFlight.length; i += parsed.data.maxNominationsPerGroup) {
                chunks.push(nominationsInFlight.slice(i, i + parsed.data.maxNominationsPerGroup));
              }
              for (const [groupIndex, nominationsInGroup] of chunks.entries()) {
                const existingGroup = await tx.group.findFirst({
                  where: { flightId: flight.id, order: groupIndex + 1 },
                  select: { id: true },
                });
                const group = existingGroup
                  ? await tx.group.update({
                      where: { id: existingGroup.id },
                      data: { name: `${code}-${groupIndex + 1}`, order: groupIndex + 1 },
                    })
                  : await tx.group.create({
                      data: { flightId: flight.id, name: `${code}-${groupIndex + 1}`, order: groupIndex + 1 },
                    });
                await Promise.all(
                  nominationsInGroup.map((nomination) =>
                    tx.nomination.update({
                      where: { id: nomination.id },
                      data: { flightId: flight.id, groupId: group.id },
                    }),
                  ),
                );
              }
              const estimatedMinutes = Math.max(
                1,
                nominationsInFlight.length * attemptsPerNomination * parsed.data.minutesPerAttempt,
              );
              plan.push({
                flightId: flight.id,
                code,
                nominations: nominationsInFlight.length,
                groups: chunks.length,
                startTime: cursor.toISOString(),
                estimatedMinutes,
              });
              cursor = new Date(
                cursor.getTime() + (estimatedMinutes + parsed.data.breakBetweenFlightsMinutes) * 60_000,
              );
              flightOrder++;
            }
            return { platformId: platform.id, flights: plan };
          },
        );

        return { plan: result };
      },
    );

    app.patch<{ Params: { nominationId: string } }>(
      '/nominations/:nominationId',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const before = await prisma.nomination.findUnique({
          where: { id: req.params.nominationId },
          include: { competition: { select: { id: true, federationId: true } } },
        });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Nomination not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, before.competition, ['federation_admin', 'secretary', 'head_judge'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'nomination write role required', requestId: req.requestId },
          });
        }

        const parsed = NominationUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }
        const data: NominationUpdate = { ...parsed.data };
        if (data.bodyWeightAtWeighIn !== undefined && data.bodyWeightAtWeighIn !== null && data.weightClassId === undefined) {
          const autoWeightClassId = await findWeightClassForBodyWeight(
            before.divisionId,
            before.disciplineId,
            data.bodyWeightAtWeighIn,
          );
          if (!autoWeightClassId) {
            return reply.code(400).send({
              error: {
                code: 'weight_class_not_found_for_body_weight',
                message: 'No weight class matches body weight',
                requestId: req.requestId,
              },
            });
          }
          data.weightClassId = autoWeightClassId;
        }
        const refCheck = await validateNominationOperationalRefs(before.competition.id, before.divisionId, before.disciplineId, data);
        if (!refCheck.ok) {
          return reply.code(400).send({
            error: { code: refCheck.code, message: refCheck.message, requestId: req.requestId },
          });
        }
        const paymentStatus = paymentStatusFromLegacy(data);
        if ((paymentStatus === 'paid' || paymentStatus === 'waived') && data.paidAt === undefined) {
          data.paidAt = new Date().toISOString();
        }
        const { competition: beforeCompetition, ...beforeNomination } = before;
        void beforeCompetition;

        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'nomination.updated',
            scopeFederationId: before.competition.federationId,
            scopeCompetitionId: before.competition.id,
            targetType: 'nomination',
            targetId: before.id,
            before: {
              ...beforeNomination,
              createdAt: before.createdAt.toISOString(),
              updatedAt: before.updatedAt.toISOString(),
            },
            after: data,
          },
          async (tx) => {
            const result = await tx.nomination.update({
              where: { id: req.params.nominationId },
              data: toNominationUpdateData(data),
              include: nominationInclude,
            });
            await recalculateCompetitionPlacings(tx, before.competition.id);
            return result;
          },
        );
        return { nomination: updated };
      },
    );

    app.put<{ Params: { nominationId: string; attemptNumber: string } }>(
      '/nominations/:nominationId/attempts/:attemptNumber',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const nomination = await prisma.nomination.findUnique({
          where: { id: req.params.nominationId },
          include: {
            competition: { select: { id: true, federationId: true } },
            discipline: { select: { components: { orderBy: { order: 'asc' } } } },
          },
        });
        if (!nomination) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Nomination not found', requestId: req.requestId },
          });
        }
        if (
          !hasScopedRole(req.user, nomination.competition, [
            'federation_admin',
            'secretary',
            'head_judge',
            'judge',
            'scoreboard_operator',
          ])
        ) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'attempt write role required', requestId: req.requestId },
          });
        }

        const attemptNumber = Number(req.params.attemptNumber);
        const parsed = AttemptUpsert.safeParse({ ...(req.body as object), attemptNumber });
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }
        const componentId = parsed.data.componentId ?? nomination.discipline.components[0]?.id ?? null;
        if (componentId && !nomination.discipline.components.some((component) => component.id === componentId)) {
          return reply.code(400).send({
            error: { code: 'component_out_of_scope', message: 'Component is not in nomination discipline', requestId: req.requestId },
          });
        }
        const attemptData = { ...parsed.data, componentId };

        const auditBase = {
          ...audit.fromRequest(req),
          actorUserId: req.user!.id,
          action: 'attempt.upserted',
          scopeFederationId: nomination.competition.federationId,
          scopeCompetitionId: nomination.competition.id,
          targetType: 'attempt',
          before: null,
          after: attemptData,
        };

        const attempt = await prisma.$transaction(async (tx) => {
          const base = toAttemptData(attemptData);
          const existing = await tx.attempt.findFirst({
            where: { nominationId: nomination.id, componentId, attemptNumber },
            select: { id: true },
          });
          const saved = existing
            ? await tx.attempt.update({
                where: { id: existing.id },
                data: stripUndefined({
                  componentId,
                  weightKg: attemptData.weightKg,
                  result: attemptData.result,
                  judgeDecisions: attemptData.judgeDecisions as Prisma.InputJsonValue,
                  repsCount: attemptData.repsCount,
                  timeoutSeconds: attemptData.timeoutSeconds,
                  startedAt: dateOrNull(attemptData.startedAt),
                  decidedAt:
                    attemptData.decidedAt === undefined && attemptData.result !== 'pending'
                      ? new Date()
                      : dateOrNull(attemptData.decidedAt),
                  notes: attemptData.notes,
                }) as Prisma.AttemptUncheckedUpdateInput,
              })
            : await tx.attempt.create({ data: { ...base, nominationId: nomination.id } });
          await recalculateNomination(tx, nomination.id);
          await recalculateCompetitionPlacings(tx, nomination.competition.id);
          await audit.record({ ...auditBase, targetId: saved.id, result: 'success' }, tx);
          return saved;
        });

        const updatedNomination = await prisma.nomination.findUnique({
          where: { id: nomination.id },
          include: nominationInclude,
        });
        return { attempt, nomination: updatedNomination };
      },
    );

    app.put<{ Params: { nominationId: string; componentId: string; attemptNumber: string } }>(
      '/nominations/:nominationId/attempts/:componentId/:attemptNumber',
      { preHandler: requireAuth() },
      async (req, reply) => {
        return app.inject({
          method: 'PUT',
          url: `/nominations/${req.params.nominationId}/attempts/${req.params.attemptNumber}`,
          headers: {
            authorization: req.headers.authorization ?? '',
            cookie: req.headers.cookie ?? '',
          },
          payload: {
            ...(req.body as object),
            componentId: req.params.componentId,
          },
        }).then((res) => {
          reply.code(res.statusCode);
          for (const [name, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') reply.header(name, value);
          }
          return reply.send(res.body);
        });
      },
    );

    app.get<{ Params: { id: string } }>(
      '/competitions/:id/scoreboard',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const payload = await getOpsPayload(req.params.id);
        if (!payload) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!canRead(req.user, payload.competition)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        return {
          competition: payload.competition,
          nominations: payload.nominations,
          rows: payload.scoreboardRows,
          generatedAt: new Date().toISOString(),
        };
      },
    );

    app.get<{ Params: { id: string } }>(
      '/competitions/:id/protocol.csv',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const payload = await getOpsPayload(req.params.id);
        if (!payload) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!canRead(req.user, payload.competition)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }

        return sendCsv(reply, `${payload.competition.code}-protocol.csv`, protocolRows(payload));
      },
    );

    app.get<{ Params: { id: string } }>(
      '/competitions/:id/protocol.xlsx',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const payload = await getOpsPayload(req.params.id);
        if (!payload) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!canRead(req.user, payload.competition)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        return sendXlsx(reply, `${payload.competition.code}-protocol.xlsx`, protocolRows(payload));
      },
    );

    app.get<{ Params: { id: string } }>(
      '/competitions/:id/accounting.csv',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const payload = await getOpsPayload(req.params.id);
        if (!payload) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, payload.competition, ['federation_admin', 'accountant'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'accounting role required', requestId: req.requestId },
          });
        }

        return sendCsv(reply, `${payload.competition.code}-accounting.csv`, accountingRows(payload));
      },
    );

    app.get<{ Params: { id: string } }>(
      '/competitions/:id/accounting.xlsx',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const payload = await getOpsPayload(req.params.id);
        if (!payload) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Competition not found', requestId: req.requestId },
          });
        }
        if (!hasScopedRole(req.user, payload.competition, ['federation_admin', 'accountant'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'accounting role required', requestId: req.requestId },
          });
        }

        return sendXlsx(reply, `${payload.competition.code}-accounting.xlsx`, accountingRows(payload));
      },
    );
  },
};
