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
import { WorkspacePage } from '../../components/workspace.js';
import { useAthletes } from './api.js';
import { formatDateOfBirth } from './format.js';

export default function AthletesListFeature() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isPlatformAdmin = user?.roles.some((r) => r.role === 'platform_admin') ?? false;

  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useAthletes(search);

  return (
    <WorkspacePage
      title={t('athletes.title')}
      subtitle={t('athletes.subtitle')}
      actions={
        isPlatformAdmin ? (
          <Button asChild>
            <Link to="/athletes/new">{t('athletes.create')}</Link>
          </Button>
        ) : null
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('athletes.listTitle')}</CardTitle>
          <CardDescription>
            {data ? t('athletes.count', { count: data.total }) : '…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="search"
            placeholder={t('athletes.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('athletes.searchPlaceholder')}
          />

          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {data && data.athletes.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground italic">{t('athletes.empty')}</p>
          )}
          {data && data.athletes.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('athletes.cols.name')}</TableHead>
                  <TableHead>{t('athletes.cols.dob')}</TableHead>
                  <TableHead>{t('athletes.cols.gender')}</TableHead>
                  <TableHead>{t('athletes.cols.country')}</TableHead>
                  <TableHead>{t('athletes.cols.club')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.athletes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        to="/athletes/$id"
                        params={{ id: a.id }}
                        className="text-primary hover:underline"
                      >
                        {a.lastName} {a.firstName}
                      </Link>
                      {a.middleName && (
                        <span className="text-muted-foreground"> {a.middleName}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateOfBirth(a.dateOfBirth)}
                    </TableCell>
                    <TableCell>{a.gender}</TableCell>
                    <TableCell className="font-mono text-xs">{a.countryCode}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.clubName ?? <span className="italic">—</span>}
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
