INSERT INTO "federation" (
  "id",
  "code",
  "nameRu",
  "nameEn",
  "countryCode",
  "billingTariffKopecksPerNomination",
  "securityKey",
  "affiliationStatus",
  "affiliationBody",
  "affiliationConfirmedAt"
)
VALUES
  (
    gen_random_uuid(),
    'ISF-Russia',
    'Федерация стритлифтинга России',
    'Federation of Streetlifting Russia',
    'RU',
    0,
    gen_random_uuid(),
    'national_member',
    'isf',
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'ISF-Kazakhstan',
    'ISF Казахстан',
    'ISF Kazakhstan',
    'KZ',
    0,
    gen_random_uuid(),
    'national_member',
    'isf',
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'EUSF-Armenia',
    'Федерация стритлифтинга Армении',
    'Federation of Streetlifting Armenia',
    'AM',
    0,
    gen_random_uuid(),
    'national_member',
    'eusf',
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'EUSF-Netherlands',
    'Федерация стритлифтинга Нидерландов',
    'Federation of Streetlifting Netherlands',
    'NL',
    0,
    gen_random_uuid(),
    'national_member',
    'eusf',
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO UPDATE
SET
  "affiliationStatus" = EXCLUDED."affiliationStatus",
  "affiliationBody" = EXCLUDED."affiliationBody",
  "affiliationConfirmedAt" = EXCLUDED."affiliationConfirmedAt",
  "updatedAt" = CURRENT_TIMESTAMP;
