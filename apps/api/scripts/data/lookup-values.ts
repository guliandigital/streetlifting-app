/**
 * Initial values for the `lookup_value` table. Admins extend each kind
 * via `/lookups/values`. The seed is idempotent — re-running upserts
 * by `(kind, code)` and refreshes translations + sortOrder.
 */

export interface LookupValueEntry {
  kind: 'judge_category' | 'sport_rank' | 'club_type' | 'federation_tag';
  code: string;
  nameRu: string;
  nameEn: string;
  sortOrder: number;
}

export const LOOKUP_VALUES: ReadonlyArray<LookupValueEntry> = [
  // ─── Judge categories ───────────────────────────────────────────
  { kind: 'judge_category', code: 'head_judge',          sortOrder: 10,
    nameRu: 'Главный судья',                  nameEn: 'Head judge' },
  { kind: 'judge_category', code: 'category_1',          sortOrder: 20,
    nameRu: 'Спортивный судья 1 категории',   nameEn: 'Judge, 1st category' },
  { kind: 'judge_category', code: 'category_2',          sortOrder: 30,
    nameRu: 'Спортивный судья 2 категории',   nameEn: 'Judge, 2nd category' },
  { kind: 'judge_category', code: 'category_3',          sortOrder: 40,
    nameRu: 'Спортивный судья 3 категории',   nameEn: 'Judge, 3rd category' },
  { kind: 'judge_category', code: 'side_judge',          sortOrder: 50,
    nameRu: 'Боковой судья',                  nameEn: 'Side judge' },
  { kind: 'judge_category', code: 'technical_secretary', sortOrder: 60,
    nameRu: 'Технический секретарь',          nameEn: 'Technical secretary' },
  { kind: 'judge_category', code: 'jury_member',         sortOrder: 70,
    nameRu: 'Член жюри',                      nameEn: 'Jury member' },

  // ─── Sport ranks ────────────────────────────────────────────────
  { kind: 'sport_rank',    code: 'mssh',     sortOrder: 10,
    nameRu: 'Мастер спорта международного класса', nameEn: 'Master of Sport, International Class' },
  { kind: 'sport_rank',    code: 'ms',       sortOrder: 20,
    nameRu: 'Мастер спорта',                  nameEn: 'Master of Sport' },
  { kind: 'sport_rank',    code: 'kms',      sortOrder: 30,
    nameRu: 'Кандидат в мастера спорта',      nameEn: 'Candidate Master of Sport' },
  { kind: 'sport_rank',    code: 'rank_1',   sortOrder: 40,
    nameRu: '1 разряд',                       nameEn: '1st rank' },
  { kind: 'sport_rank',    code: 'rank_2',   sortOrder: 50,
    nameRu: '2 разряд',                       nameEn: '2nd rank' },
  { kind: 'sport_rank',    code: 'rank_3',   sortOrder: 60,
    nameRu: '3 разряд',                       nameEn: '3rd rank' },
  { kind: 'sport_rank',    code: 'rank_1y',  sortOrder: 70,
    nameRu: '1 юношеский разряд',             nameEn: '1st junior rank' },
  { kind: 'sport_rank',    code: 'rank_2y',  sortOrder: 80,
    nameRu: '2 юношеский разряд',             nameEn: '2nd junior rank' },
  { kind: 'sport_rank',    code: 'rank_3y',  sortOrder: 90,
    nameRu: '3 юношеский разряд',             nameEn: '3rd junior rank' },

  // ─── Club types ─────────────────────────────────────────────────
  { kind: 'club_type',     code: 'gym',                sortOrder: 10,
    nameRu: 'Спортивный зал',                 nameEn: 'Gym' },
  { kind: 'club_type',     code: 'section',            sortOrder: 20,
    nameRu: 'Секция',                         nameEn: 'Section' },
  { kind: 'club_type',     code: 'school',             sortOrder: 30,
    nameRu: 'Спортивная школа',               nameEn: 'Sports school' },
  { kind: 'club_type',     code: 'amateur_club',       sortOrder: 40,
    nameRu: 'Любительский клуб',              nameEn: 'Amateur club' },
  { kind: 'club_type',     code: 'professional_club',  sortOrder: 50,
    nameRu: 'Профессиональный клуб',          nameEn: 'Professional club' },

  // ─── Federation tags ────────────────────────────────────────────
  // Empty by default — admins add tags as their use case requires.
];
