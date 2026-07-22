import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@streetlifting/ui';
import { api } from '../../lib/api-client.js';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceSectionTitle,
} from '../../components/workspace.js';

const ROLES = [
  ['organizer', 'Организатор'],
  ['head_judge', 'Главный судья'],
  ['judge', 'Судья'],
  ['secretary', 'Секретарь'],
  ['assistant', 'Ассистент'],
  ['scoreboard_operator', 'Оператор табло'],
  ['speaker', 'Ведущий'],
  ['technical_official', 'Технический специалист'],
  ['medical_official', 'Медицинский специалист'],
] as const;

type TeamRole = (typeof ROLES)[number][0];

export function CompetitionTeamPanel({ competitionId }: { competitionId: string }) {
  const qc = useQueryClient();
  const team = useQuery({
    queryKey: ['competitions', competitionId, 'team-members'],
    queryFn: () => api.competitions.teamMembers(competitionId),
  });
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<TeamRole>('organizer');
  const [judgeAssignmentId, setJudgeAssignmentId] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    await qc.invalidateQueries({ queryKey: ['competitions', competitionId, 'team-members'] });
    await qc.invalidateQueries({ queryKey: ['cabinet', 'overview'] });
  }

  async function invite(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      await api.competitions.inviteTeamMember(competitionId, {
        userId: userId.trim(),
        role,
        ...(judgeAssignmentId.trim() ? { judgeAssignmentId: judgeAssignmentId.trim() } : {}),
      });
      setUserId('');
      setJudgeAssignmentId('');
      await refresh();
      toast.success('Приглашение отправлено');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось отправить приглашение');
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: string): Promise<void> {
    setBusy(true);
    try {
      await api.competitions.completeTeamMember(id);
      await refresh();
      toast.success('Участие подтверждено как завершённое');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось завершить участие');
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspacePanel className="p-3">
      <WorkspaceSectionTitle>Команда соревнования</WorkspaceSectionTitle>
      <form className="mt-2 grid gap-2 md:grid-cols-4" onSubmit={(e) => void invite(e)}>
        <label className="pt-label md:col-span-2">
          ID пользователя из паспорта
          <input
            className="pt-field mt-1 w-full font-mono"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="UUID из паспорта"
            required
          />
        </label>
        <label className="pt-label">
          Роль
          <select
            className="pt-field mt-1 w-full"
            value={role}
            onChange={(event) => setRole(event.target.value as TeamRole)}
          >
            {ROLES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="pt-label">
          Назначение судьи (опционально)
          <input
            className="pt-field mt-1 w-full font-mono"
            value={judgeAssignmentId}
            onChange={(event) => setJudgeAssignmentId(event.target.value)}
          />
        </label>
        <div className="md:col-span-4">
          <WorkspaceButton type="submit" tone="green" disabled={busy || !userId.trim()}>
            Пригласить
          </WorkspaceButton>
        </div>
      </form>
      <div className="mt-3 overflow-x-auto">
        <table className="pt-grid">
          <thead>
            <tr>
              <th>Участник</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Назначение</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {team.data?.teamMembers.map((member) => (
              <tr key={member.id}>
                <td>{member.memberNameSnapshot}</td>
                <td>{ROLES.find(([value]) => value === member.role)?.[1] ?? member.role}</td>
                <td>{member.status}</td>
                <td>{member.judgeAssignmentId ? 'связано' : '—'}</td>
                <td>
                  {member.status === 'confirmed' ? (
                    <WorkspaceButton
                      type="button"
                      disabled={busy}
                      onClick={() => void complete(member.id)}
                    >
                      Завершить
                    </WorkspaceButton>
                  ) : null}
                </td>
              </tr>
            ))}
            {team.data?.teamMembers.length === 0 ? (
              <tr>
                <td colSpan={5} className="pt-muted italic">
                  Команда пока не сформирована.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </WorkspacePanel>
  );
}
