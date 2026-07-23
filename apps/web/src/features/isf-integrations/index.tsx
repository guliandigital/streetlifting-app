import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  toast,
} from '@streetlifting/ui';
import { api, ApiClientError } from '../../lib/api-client.js';

const SCOPES = ['isf:protocol:write', 'isf:read', 'openstreetlifting:read', 'isf:webhook'] as const;
type ServiceScope = (typeof SCOPES)[number];

function toPem(label: 'PUBLIC KEY' | 'PRIVATE KEY', buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded =
    btoa(binary)
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${encoded}\n-----END ${label}-----\n`;
}

function savePrivateKey(keyId: string, privateKeyPem: string): void {
  const blob = new Blob([privateKeyPem], { type: 'application/x-pem-file' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${keyId || 'isf-federation'}-ed25519-private.pem`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

export default function IsfIntegrationsFeature() {
  const queryClient = useQueryClient();
  const federations = useQuery({ queryKey: ['federations'], queryFn: api.federations.list });
  const serviceClients = useQuery({
    queryKey: ['isf', 'service-clients'],
    queryFn: api.integrations.isf.serviceClients,
  });
  const protocolKeys = useQuery({
    queryKey: ['isf', 'protocol-keys'],
    queryFn: () => api.integrations.isf.protocolKeys(),
  });

  const [federationId, setFederationId] = useState('');
  const [keyId, setKeyId] = useState('');
  const [sanctioningCertId, setSanctioningCertId] = useState('');
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState<string | null>(null);
  const [serviceCode, setServiceCode] = useState('streetlifting-os');
  const [serviceName, setServiceName] = useState('Streetlifting OS protocol delivery');
  const [scopes, setScopes] = useState<ServiceScope[]>(['isf:protocol:write']);
  const [rateLimitRpm, setRateLimitRpm] = useState('60');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  useEffect(() => {
    const first = federations.data?.federations[0];
    if (first && !federationId) setFederationId(first.id);
  }, [federationId, federations.data?.federations]);

  const federationNameById = useMemo(
    () => new Map((federations.data?.federations ?? []).map((f) => [f.id, f.nameEn || f.nameRu])),
    [federations.data?.federations],
  );

  const createKey = useMutation({
    mutationFn: api.integrations.isf.createProtocolKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['isf', 'protocol-keys'] });
      toast.success('Доверенный публичный ключ зарегистрирован');
    },
  });
  const revokeKey = useMutation({
    mutationFn: api.integrations.isf.revokeProtocolKey,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['isf', 'protocol-keys'] }),
  });
  const createClient = useMutation({
    mutationFn: api.integrations.isf.createServiceClient,
    onSuccess: (result) => {
      setIssuedToken(result.token);
      void queryClient.invalidateQueries({ queryKey: ['isf', 'service-clients'] });
      toast.success('Service token выпущен. Скопируйте его сейчас: повторно он не показывается.');
    },
  });
  const revokeClient = useMutation({
    mutationFn: api.integrations.isf.revokeServiceClient,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['isf', 'service-clients'] }),
  });

  async function generateKeyPair() {
    try {
      const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      const [publicDer, privateDer] = await Promise.all([
        crypto.subtle.exportKey('spki', pair.publicKey),
        crypto.subtle.exportKey('pkcs8', pair.privateKey),
      ]);
      setPublicKeyPem(toPem('PUBLIC KEY', publicDer));
      setPrivateKeyPem(toPem('PRIVATE KEY', privateDer));
      toast.success(
        'Создана Ed25519-пара. Закрытый ключ остаётся только в этом браузере до скачивания.',
      );
    } catch {
      toast.error(
        'Этот браузер не поддерживает генерацию Ed25519. Вставьте публичный PEM из Streetlifting OS.',
      );
    }
  }

  function submitKey(event: FormEvent) {
    event.preventDefault();
    if (!federationId || !keyId.trim() || !publicKeyPem.trim()) {
      toast.error('Выберите федерацию, укажите key ID и публичный PEM');
      return;
    }
    createKey.mutate({
      federationId,
      keyId: keyId.trim(),
      publicKeyPem: publicKeyPem.trim(),
      ...(sanctioningCertId.trim() ? { sanctioningCertId: sanctioningCertId.trim() } : {}),
    });
  }

  function submitServiceClient(event: FormEvent) {
    event.preventDefault();
    const rpm = Number(rateLimitRpm);
    if (
      !serviceCode.trim() ||
      !serviceName.trim() ||
      scopes.length === 0 ||
      !Number.isInteger(rpm)
    ) {
      toast.error('Проверьте код, название, scope и лимит');
      return;
    }
    setIssuedToken(null);
    createClient.mutate({
      code: serviceCode.trim(),
      name: serviceName.trim(),
      scopes,
      rateLimitRpm: rpm,
    });
  }

  function showError(error: unknown): string | null {
    if (!error) return null;
    return error instanceof ApiClientError ? error.message : 'Не удалось выполнить операцию';
  }

  return (
    <div className="max-w-6xl mx-auto my-10 px-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">ISF integrations</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Доверяйте только публичные Ed25519-ключи федераций. Закрытый ключ и service token
          показываются один раз и не сохраняются сервером.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ключ федерации для Streetlifting OS</CardTitle>
            <CardDescription>Подпись обязательна для приёма финального протокола.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitKey} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="federation">Федерация</Label>
                <select
                  id="federation"
                  className="w-full rounded-md border p-2"
                  value={federationId}
                  onChange={(event) => setFederationId(event.target.value)}
                  required
                >
                  <option value="">Выберите федерацию</option>
                  {(federations.data?.federations ?? []).map((federation) => (
                    <option key={federation.id} value={federation.id}>
                      {federation.nameEn || federation.nameRu}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-id">Key ID</Label>
                <Input
                  id="key-id"
                  value={keyId}
                  onChange={(event) => setKeyId(event.target.value)}
                  placeholder="isf-ru-2026-01"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificate">ID санкционирования</Label>
                <Input
                  id="certificate"
                  value={sanctioningCertId}
                  onChange={(event) => setSanctioningCertId(event.target.value)}
                  placeholder="ISF-RU-2026-001"
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void generateKeyPair()}>
                Создать Ed25519 key pair
              </Button>
              {privateKeyPem ? (
                <div className="rounded-md border border-amber-500 p-3 text-sm space-y-2">
                  <p>
                    Скачайте закрытый ключ и импортируйте его в Streetlifting OS. После закрытия
                    страницы он будет потерян.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => savePrivateKey(keyId, privateKeyPem)}
                  >
                    Скачать private key
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="public-key">Публичный ключ PEM</Label>
                <textarea
                  id="public-key"
                  className="min-h-40 w-full rounded-md border p-2 font-mono text-xs"
                  value={publicKeyPem}
                  onChange={(event) => setPublicKeyPem(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={createKey.isPending}>
                Зарегистрировать доверенный ключ
              </Button>
              {showError(createKey.error) ? (
                <p className="text-sm text-red-600">{showError(createKey.error)}</p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service token</CardTitle>
            <CardDescription>
              Отдельный bearer token для Streetlifting OS и сервисных интеграций.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitServiceClient} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="service-code">Код сервиса</Label>
                <Input
                  id="service-code"
                  value={serviceCode}
                  onChange={(event) => setServiceCode(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-name">Название</Label>
                <Input
                  id="service-name"
                  value={serviceName}
                  onChange={(event) => setServiceName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Scopes</Label>
                {SCOPES.map((scope) => (
                  <label key={scope} className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={(event) =>
                        setScopes((items) =>
                          event.target.checked
                            ? [...items, scope]
                            : items.filter((item) => item !== scope),
                        )
                      }
                    />
                    {scope}
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rpm">Лимит, запросов в минуту</Label>
                <Input
                  id="rpm"
                  type="number"
                  min="1"
                  max="10000"
                  value={rateLimitRpm}
                  onChange={(event) => setRateLimitRpm(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={createClient.isPending}>
                Выпустить token
              </Button>
              {issuedToken ? (
                <div className="rounded-md border border-amber-500 p-3 space-y-2">
                  <p className="text-sm">Скопируйте token сейчас. Он не будет показан повторно.</p>
                  <code className="block break-all text-xs">{issuedToken}</code>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(issuedToken)
                        .then(() => toast.success('Token скопирован'))
                    }
                  >
                    Скопировать token
                  </Button>
                </div>
              ) : null}
              {showError(createClient.error) ? (
                <p className="text-sm text-red-600">{showError(createClient.error)}</p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Доверенные ключи</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th>Федерация</th>
                  <th>Key ID</th>
                  <th>Fingerprint</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(protocolKeys.data?.keys ?? []).map((key) => (
                  <tr key={key.id} className="border-t">
                    <td>{federationNameById.get(key.federationId) ?? key.federationId}</td>
                    <td>{key.keyId}</td>
                    <td className="font-mono text-xs">{key.publicKeyFingerprint.slice(0, 16)}…</td>
                    <td>{key.isActive ? 'active' : `revoked ${formatDate(key.revokedAt)}`}</td>
                    <td>
                      {key.isActive ? (
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Отозвать ${key.keyId}?`)) revokeKey.mutate(key.id);
                          }}
                        >
                          Отозвать
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {protocolKeys.data?.keys.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Ключи пока не зарегистрированы.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Service clients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th>Код</th>
                  <th>Scopes</th>
                  <th>Лимит</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(serviceClients.data?.clients ?? []).map((client) => (
                  <tr key={client.id} className="border-t">
                    <td>
                      <strong>{client.name}</strong>
                      <br />
                      {client.code}
                    </td>
                    <td>{client.scopes.join(', ')}</td>
                    <td>{client.rateLimitRpm} rpm</td>
                    <td>
                      {client.isActive ? 'active' : `revoked ${formatDate(client.revokedAt)}`}
                    </td>
                    <td>
                      {client.isActive ? (
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Отозвать ${client.name}?`))
                              revokeClient.mutate(client.id);
                          }}
                        >
                          Отозвать
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {serviceClients.data?.clients.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Service clients пока нет.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
