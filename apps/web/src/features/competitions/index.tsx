import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
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
import { useAuthStore } from '../../lib/auth/store.js';
import { WorkspacePage } from '../../components/workspace.js';
import { formatRub } from '../../lib/money.js';
import { useCompetitions } from './api.js';
import { formatDate } from './format.js';

export default function CompetitionsListFeature() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const canCreate =
    user?.roles.some((r) => r.role === 'platform_admin' || r.role === 'federation_admin') ?? false;
  const { data, isLoading, error } = useCompetitions();

  return (
    <WorkspacePage
      title={t('competitions.title')}
      subtitle={t('competitions.subtitle')}
      actions={
        canCreate ? (
          <Button asChild>
            <Link to="/competitions/new">{t('competitions.create')}</Link>
          </Button>
        ) : null
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('competitions.listTitle')}</CardTitle>
          <CardDescription>
            {data ? t('competitions.count', { count: data.total }) : '...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {data && data.competitions.length === 0 && (
            <p className="text-sm text-muted-foreground italic">{t('competitions.empty')}</p>
          )}
          {data && data.competitions.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('competitions.cols.name')}</TableHead>
                  <TableHead>{t('competitions.cols.federation')}</TableHead>
                  <TableHead>{t('competitions.cols.dates')}</TableHead>
                  <TableHead>{t('competitions.cols.status')}</TableHead>
                  <TableHead className="text-right">{t('competitions.cols.entryFee')}</TableHead>
                  <TableHead className="text-right">{t('competitions.cols.nominations')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.competitions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to="/competitions/$id"
                        params={{ id: c.id }}
                        className="text-primary hover:underline"
                      >
                        {c.nameRu}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        <code>{c.code}</code> · {c.nameEn}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.federation.nameRu}
                      <div className="text-xs text-muted-foreground">{c.federation.code}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(c.startDate)}
                      {c.endDate !== c.startDate && ` - ${formatDate(c.endDate)}`}
                    </TableCell>
                    <TableCell>{t(`competitions.status.${c.status}`)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRub(c.entryFeeKopecks)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c._count?.nominations ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}
