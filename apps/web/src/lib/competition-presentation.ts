/** Strip only the observed imported date trailer when it matches the event date. */
export function competitionCity(city: string | null | undefined, startDate: string): string | null {
  if (!city) return null;
  const date = startDate.slice(0, 10).split('-');
  if (date.length !== 3) return city;
  const trailer = ` ${date[2]}.${date[1]}.${date[0]} -`;
  return city.trimEnd().endsWith(trailer) ? city.trimEnd().slice(0, -trailer.length).trim() : city;
}

export function competitionSourceLabel(
  description: string | null,
  status: string,
): 'importedArchive' | 'externalAnnouncement' | 'sourceUnspecified' {
  const imported =
    description?.includes('Imported from PowerTable public snapshot.') ||
    description?.includes('Карточка импортирована');
  if (!imported) return 'sourceUnspecified';
  return ['archived', 'finalized'].includes(status) ? 'importedArchive' : 'externalAnnouncement';
}
