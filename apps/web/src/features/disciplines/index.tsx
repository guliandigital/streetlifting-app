import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@streetlifting/ui';
import { useDisciplines, type DisciplineDto } from './api.js';

interface Section {
  key: string;
  match: (d: DisciplineDto) => boolean;
}

const SECTION_ORDER: ReadonlyArray<Section> = [
  { key: 'classic',        match: (d) => d.family === 'streetlifting' && d.format === 'three_attempts_max' },
  { key: 'multirepTotal',  match: (d) => d.family === 'streetlifting' && d.code.startsWith('multirep_total_') },
  { key: 'multirepPu',     match: (d) => d.family === 'streetlifting' && d.code.startsWith('multirep_pu_') },
  { key: 'multirepDi',     match: (d) => d.family === 'streetlifting' && d.code.startsWith('multirep_di_') },
  { key: 'wc',             match: (d) => d.family === 'weighted_calisthenics' },
];

function partition(disciplines: DisciplineDto[]): Map<string, DisciplineDto[]> {
  const groups = new Map<string, DisciplineDto[]>();
  for (const section of SECTION_ORDER) {
    groups.set(section.key, []);
  }
  for (const d of disciplines) {
    const section = SECTION_ORDER.find((s) => s.match(d));
    if (section) groups.get(section.key)!.push(d);
  }
  return groups;
}

export default function DisciplinesListFeature() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useDisciplines();

  const total = data?.disciplines.length ?? 0;
  const groups = data ? partition(data.disciplines) : new Map<string, DisciplineDto[]>();

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('disciplines.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('disciplines.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('disciplines.listTitle')}</CardTitle>
          <CardDescription>{t('disciplines.count', { count: total })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {data && total === 0 && (
            <p className="text-sm text-muted-foreground italic">{t('disciplines.empty')}</p>
          )}

          {data && total > 0 &&
            SECTION_ORDER.map(({ key }) => {
              const items = groups.get(key) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={key}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                    {t(`disciplines.sections.${key}`)}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">{t('disciplines.cols.code')}</TableHead>
                        <TableHead>{t('disciplines.cols.name')}</TableHead>
                        <TableHead className="text-right w-[120px]">{t('disciplines.cols.attemptCount')}</TableHead>
                        <TableHead className="text-right w-[100px]">{t('disciplines.cols.fixedWeight')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono text-xs">
                            <Link
                              to="/disciplines/$id"
                              params={{ id: d.id }}
                              className="text-primary hover:underline"
                            >
                              {d.code}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {d.nameRu}
                            <div className="text-xs text-muted-foreground">{d.nameEn}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{d.attemptCount}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {d.fixedWeightKg !== null ? `${d.fixedWeightKg} ${t('common.kg')}` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
