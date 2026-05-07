import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@streetlifting/ui';
import { useAuthStore } from '../../lib/auth/store.js';
import { useJudges } from './api.js';

export default function JudgesListFeature() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isPlatformAdmin = user?.roles.some((r) => r.role === 'platform_admin') ?? false;

  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useJudges(search);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('judges.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('judges.subtitle')}</p>
        </div>
        {isPlatformAdmin && (
          <Button asChild>
            <Link to="/judges/new">{t('judges.create')}</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('judges.listTitle')}</CardTitle>
          <CardDescription>
            {data ? t('judges.count', { count: data.total }) : '…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="search"
            placeholder={t('judges.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('judges.searchPlaceholder')}
          />

          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {data && data.judges.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground italic">{t('judges.empty')}</p>
          )}
          {data && data.judges.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('judges.cols.name')}</TableHead>
                  <TableHead>{t('judges.cols.category')}</TableHead>
                  <TableHead>{t('judges.cols.cardNumber')}</TableHead>
                  <TableHead>{t('judges.cols.cityRegion')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.judges.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Link
                        to="/judges/$id"
                        params={{ id: j.id }}
                        className="text-primary hover:underline"
                      >
                        {j.lastName} {j.firstName}
                      </Link>
                      {j.middleName && (
                        <span className="text-muted-foreground"> {j.middleName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {j.categoryRu ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {j.cardNumber ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {j.cityRegion ?? <span className="italic">—</span>}
                    </TableCell>
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
