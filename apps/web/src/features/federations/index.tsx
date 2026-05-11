import { useEffect } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
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
import { useFederations } from './api.js';
import { formatRub } from './format.js';

export default function FederationsListFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isPlatformAdmin = user?.roles.some((r) => r.role === 'platform_admin') ?? false;
  const { data, isLoading, error } = useFederations();

  useEffect(() => {
    if (isPlatformAdmin || !data || data.federations.length !== 1) return;
    void navigate({
      to: '/federations/$id',
      params: { id: data.federations[0]!.id },
      replace: true,
    });
  }, [data, isPlatformAdmin, navigate]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('federations.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('federations.subtitle')}</p>
        </div>
        {isPlatformAdmin && (
          <Button asChild>
            <Link to="/federations/new">{t('federations.create')}</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('federations.listTitle')}</CardTitle>
          <CardDescription>
            {data ? t('federations.count', { count: data.federations.length }) : '…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {data && data.federations.length === 0 && (
            <p className="text-sm text-muted-foreground italic">{t('federations.empty')}</p>
          )}
          {data && data.federations.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('federations.cols.code')}</TableHead>
                  <TableHead>{t('federations.cols.name')}</TableHead>
                  <TableHead>{t('federations.cols.country')}</TableHead>
                  <TableHead className="text-right">{t('federations.cols.tariff')}</TableHead>
                  {isPlatformAdmin ? (
                    <TableHead className="text-right">{t('federations.cols.workspace')}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.federations.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">{f.code}</TableCell>
                    <TableCell>
                      <Link
                        to="/federations/$id"
                        params={{ id: f.id }}
                        className="text-primary hover:underline"
                      >
                        {f.nameRu}
                      </Link>
                      <div className="text-xs text-muted-foreground">{f.nameEn}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{f.countryCode}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRub(f.billingTariffKopecksPerNomination)}
                    </TableCell>
                    {isPlatformAdmin ? (
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link to="/federations/$id" params={{ id: f.id }}>
                            {t('federations.openWorkspace')}
                          </Link>
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
