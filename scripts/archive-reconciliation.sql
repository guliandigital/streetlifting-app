-- Read-only candidates for manual review. Counts are not proof of erroneous
-- historical work. Never use these predicates as an automatic UPDATE/merge.
WITH findings AS (
  SELECT 'nomination_discipline_weight_class' AS finding, n.id::text AS id,
    'nomination + weight_class' AS source
  FROM nomination n JOIN weight_class w ON w.id=n."weightClassId"
  WHERE w."disciplineId" IS NOT NULL AND w."disciplineId"<>n."disciplineId"
  UNION ALL
  SELECT 'attempt_above_component_limit', a.id::text, 'attempt + nomination + discipline/component'
  FROM attempt a JOIN nomination n ON n.id=a."nominationId"
  JOIN discipline d ON d.id=n."disciplineId"
  LEFT JOIN discipline_component c ON c.id=a."componentId"
  WHERE a."attemptNumber">coalesce(c."attemptCount",d."attemptCount")
  UNION ALL
  SELECT 'record_discipline_weight_class', r.id::text, 'record + weight_class'
  FROM record r JOIN weight_class w ON w.id=r."weightClassId"
  WHERE w."disciplineId" IS NOT NULL AND w."disciplineId"<>r."disciplineId"
  UNION ALL
  SELECT 'january_first_birth_date', id::text, 'athlete.dateOfBirth; identity document needed'
  FROM athlete WHERE extract(month FROM "dateOfBirth")=1 AND extract(day FROM "dateOfBirth")=1
  UNION ALL
  SELECT 'final_result_without_attempts', n.id::text, 'nomination + attempt; original protocol needed'
  FROM nomination n WHERE (n."finalScore" IS NOT NULL OR n."bestSuccessfulAttemptKg" IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a."nominationId"=n.id)
  UNION ALL
  SELECT 'unverified_external_identity', id::text, 'external_identity_link; external source verification needed'
  FROM external_identity_link WHERE "verifiedAt" IS NULL AND "rejectedAt" IS NULL
  UNION ALL
  SELECT 'record_without_ratification', id::text, 'record; federation ratification evidence needed'
  FROM record WHERE "ratifiedAt" IS NULL OR "ratifiedByUserId" IS NULL
  UNION ALL
  SELECT 'possible_duplicate_identity', a.id::text, 'athlete; names/date are insufficient to merge identities'
  FROM athlete a WHERE a."dateOfBirth" IS NOT NULL AND EXISTS (
    SELECT 1 FROM athlete b WHERE a.id<>b.id
      AND lower(trim(a."firstName"))=lower(trim(b."firstName"))
      AND lower(trim(a."lastName"))=lower(trim(b."lastName"))
      AND a."dateOfBirth"=b."dateOfBirth"
  )
)
SELECT finding, min(source) AS source, count(*)::int AS count,
  array_agg(id ORDER BY id) AS "reviewIds"
FROM findings GROUP BY finding ORDER BY finding;
