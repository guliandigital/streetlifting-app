import { PrismaClient } from '../generated/prisma/index.js';

declare global {
  var __isfIdPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__isfIdPrisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') global.__isfIdPrisma = prisma;
