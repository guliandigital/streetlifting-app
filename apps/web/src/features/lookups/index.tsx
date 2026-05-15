import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@streetlifting/ui';
import { WorkspacePage } from '../../components/workspace.js';
import { useCountries, useRegions, useCities, useLookups } from '../../lib/references-api.js';

interface SectionLink {
  to: '/lookups/countries' | '/lookups/regions' | '/lookups/cities' | '/lookups/values';
  titleKey: string;
  descKey: string;
  count: number | undefined;
}

export default function LookupsLandingFeature() {
  const { t } = useTranslation();
  const { data: countries } = useCountries();
  const { data: regions } = useRegions();
  const { data: cities } = useCities({});
  const { data: lookups } = useLookups();

  const sections: ReadonlyArray<SectionLink> = [
    {
      to: '/lookups/countries',
      titleKey: 'lookups.cards.countries.title',
      descKey: 'lookups.cards.countries.desc',
      count: countries?.countries.length,
    },
    {
      to: '/lookups/regions',
      titleKey: 'lookups.cards.regions.title',
      descKey: 'lookups.cards.regions.desc',
      count: regions?.regions.length,
    },
    {
      to: '/lookups/cities',
      titleKey: 'lookups.cards.cities.title',
      descKey: 'lookups.cards.cities.desc',
      count: cities?.total,
    },
    {
      to: '/lookups/values',
      titleKey: 'lookups.cards.values.title',
      descKey: 'lookups.cards.values.desc',
      count: lookups?.lookups.length,
    },
  ];

  return (
    <WorkspacePage title={t('lookups.title')} subtitle={t('lookups.subtitle')}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
          >
            <Card className="hover:border-primary transition-colors">
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between">
                  <span>{t(s.titleKey)}</span>
                  <span className="text-2xl font-mono tabular-nums text-muted-foreground">
                    {s.count ?? '…'}
                  </span>
                </CardTitle>
                <CardDescription>{t(s.descKey)}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </WorkspacePage>
  );
}
