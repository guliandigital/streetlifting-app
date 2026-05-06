import { z } from 'zod';
import {
  AttachmentId,
  FederationId,
  CompetitionId,
  AthleteId,
  UserId,
} from './ids.js';
import { AttachmentKind } from './enums.js';

/**
 * Generic file attachment. Stored on disk under a sandboxed path; row holds
 * metadata + sha256 for integrity. Uploaded files are audit-logged when they
 * are attached to a federation page or competition deliverable.
 *
 * MIME validation, size limits, and image re-encoding are enforced at the
 * upload endpoint — see ADR-0004 §"Input validation".
 */
export const Attachment = z.object({
  id: AttachmentId,
  kind: AttachmentKind,
  federationId: FederationId.nullable(),
  competitionId: CompetitionId.nullable(),
  athleteId: AthleteId.nullable(),
  uploadedByUserId: UserId,
  /** Original filename as supplied by the client; sanitized. */
  filename: z.string().min(1).max(256),
  /** MIME type detected from the file's magic bytes (NOT the extension). */
  mimeType: z.string().min(3),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(64),
  /** Storage path relative to the configured uploads root. */
  storagePath: z.string().min(1),
  uploadedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Attachment = z.infer<typeof Attachment>;
