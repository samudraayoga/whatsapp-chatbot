import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createChatbotDraft,
  getChatbotVersion,
  listChatbotVersions,
  publishChatbotVersion,
  replaceChatbotRules,
  rollbackChatbotVersion,
  testChatbotRules
} from '../api/chatbot';
import type {
  ChatbotRule,
  ChatbotVersionDetailResponse
} from '../api/contracts';
import { StatusBadge } from '../components/StatusBadge';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Operasi gagal. Coba lagi.';

const comparableRule = (rule: ChatbotRule) =>
  JSON.stringify({
    triggerType: rule.triggerType,
    triggerValues: rule.triggerValues,
    responseText: rule.responseText,
    priority: rule.priority,
    enabled: rule.enabled,
    action: rule.action
  });

const versionTone = (status: 'draft' | 'published' | 'archived') =>
  status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'neutral';

const localProblems = (rules: ChatbotRule[]) => {
  const problems: string[] = [];
  const priorities = rules.map((rule) => rule.priority);
  if (new Set(priorities).size !== priorities.length) {
    problems.push('Priority harus unik.');
  }
  if (rules.filter((rule) => rule.enabled && rule.triggerType === 'empty').length !== 1) {
    problems.push('Harus ada tepat satu empty rule aktif.');
  }
  if (rules.filter((rule) => rule.enabled && rule.triggerType === 'fallback').length !== 1) {
    problems.push('Harus ada tepat satu fallback rule aktif.');
  }
  if (rules.some((rule) => !rule.responseText.trim())) {
    problems.push('Semua response wajib diisi.');
  }
  const triggers = rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) =>
      rule.triggerValues.map((value) => value.trim().toLowerCase())
    )
    .filter(Boolean);
  if (new Set(triggers).size !== triggers.length) {
    problems.push('Trigger aktif tidak boleh duplikat.');
  }
  return problems;
};

type WorkspaceProps = {
  detail: ChatbotVersionDetailResponse;
  activeDetail?: ChatbotVersionDetailResponse;
  activeVersionId: string;
  refresh: () => Promise<void>;
};

const ChatbotWorkspace = ({
  detail,
  activeDetail,
  activeVersionId,
  refresh
}: WorkspaceProps) => {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<ChatbotRule[]>(detail.data.rules);
  const [testInput, setTestInput] = useState('menu');
  const [changeSummary, setChangeSummary] = useState('');
  const [publishConfirmation, setPublishConfirmation] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackConfirmation, setRollbackConfirmation] = useState('');
  const version = detail.data.version;
  const problems = useMemo(() => localProblems(rules), [rules]);
  const dirty = JSON.stringify(rules) !== JSON.stringify(detail.data.rules);
  const changedRules = useMemo(() => {
    if (!activeDetail || version.status === 'published') return 0;
    const activeByPriority = new Map(
      activeDetail.data.rules.map((rule) => [rule.priority, rule])
    );
    return rules.filter(
      (rule) =>
        comparableRule(rule) !==
        (activeByPriority.get(rule.priority)
          ? comparableRule(activeByPriority.get(rule.priority)!)
          : undefined)
    ).length;
  }, [activeDetail, rules, version.status]);

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['chatbot'] });
    await refresh();
  };
  const saveMutation = useMutation({
    mutationFn: () =>
      replaceChatbotRules({
        versionId: version.id,
        expectedRevision: version.revision,
        rules
      }),
    onSuccess: refreshAll
  });
  const testMutation = useMutation({
    mutationFn: () => testChatbotRules({ versionId: version.id, input: testInput })
  });
  const publishMutation = useMutation({
    mutationFn: () =>
      publishChatbotVersion({
        versionId: version.id,
        expectedActiveVersionId: activeVersionId,
        changeSummary,
        confirmation: publishConfirmation
      }),
    onSuccess: refreshAll
  });
  const rollbackMutation = useMutation({
    mutationFn: () =>
      rollbackChatbotVersion({
        versionId: version.id,
        expectedActiveVersionId: activeVersionId,
        reason: rollbackReason,
        confirmation: rollbackConfirmation
      }),
    onSuccess: refreshAll
  });

  const updateRule = (index: number, patch: Partial<ChatbotRule>) =>
    setRules((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      )
    );

  return (
    <div className="chatbot-workspace">
      <section className="panel chatbot-editor">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Rule editor</p>
            <h2>{version.name}</h2>
            <small>
              v{version.versionNumber} · revision {version.revision} ·{' '}
              {version.ruleCount} rules
            </small>
          </div>
          <StatusBadge tone={versionTone(version.status)}>
            {version.status}
          </StatusBadge>
        </div>

        {version.status === 'draft' && (
          <div className="editor-toolbar">
            <span>
              {dirty ? 'Perubahan lokal belum disimpan' : 'Draft tersimpan'}
            </span>
            <button
              className="button"
              type="button"
              onClick={() =>
                setRules((current) => [
                  ...current,
                  {
                    triggerType: 'exact',
                    triggerValues: [''],
                    responseText: '',
                    priority:
                      Math.max(0, ...current.map((rule) => rule.priority)) + 10,
                    enabled: true,
                    action: 'reply'
                  }
                ])
              }
            >
              Tambah rule
            </button>
            <button
              className="button button--primary"
              disabled={
                !dirty || problems.length > 0 || saveMutation.isPending
              }
              type="button"
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Menyimpan…' : 'Simpan draft'}
            </button>
          </div>
        )}

        {problems.length > 0 && version.status === 'draft' && (
          <div className="form-alert form-alert--error" role="alert">
            {problems.map((problem) => (
              <span key={problem}>{problem}</span>
            ))}
          </div>
        )}
        {saveMutation.error && (
          <div className="form-alert form-alert--error" role="alert">
            {errorMessage(saveMutation.error)}
          </div>
        )}

        <div className="rule-list">
          {rules.map((rule, index) => (
            <article className="rule-card" key={rule.id ?? `new-${index}`}>
              <div className="rule-card__meta">
                <strong>Rule {index + 1}</strong>
                <label>
                  Priority
                  <input
                    disabled={version.status !== 'draft'}
                    min="0"
                    type="number"
                    value={rule.priority}
                    onChange={(event) =>
                      updateRule(index, { priority: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Trigger
                  <select
                    disabled={version.status !== 'draft'}
                    value={rule.triggerType}
                    onChange={(event) =>
                      updateRule(index, {
                        triggerType: event.target
                          .value as ChatbotRule['triggerType'],
                        triggerValues: ['empty', 'fallback'].includes(
                          event.target.value
                        )
                          ? []
                          : rule.triggerValues
                      })
                    }
                  >
                    <option value="exact">Exact</option>
                    <option value="alias">Alias</option>
                    <option value="empty">Empty input</option>
                    <option value="fallback">Fallback</option>
                  </select>
                </label>
                <label>
                  Action
                  <select
                    disabled={version.status !== 'draft'}
                    value={rule.action}
                    onChange={(event) =>
                      updateRule(index, {
                        action: event.target.value as ChatbotRule['action']
                      })
                    }
                  >
                    <option value="reply">Reply</option>
                    <option value="create_handoff">Reply + handoff</option>
                  </select>
                </label>
                <label className="toggle-label">
                  <input
                    checked={rule.enabled}
                    disabled={version.status !== 'draft'}
                    type="checkbox"
                    onChange={(event) =>
                      updateRule(index, { enabled: event.target.checked })
                    }
                  />
                  Aktif
                </label>
              </div>
              <label>
                Trigger values
                <input
                  disabled={
                    version.status !== 'draft' ||
                    ['empty', 'fallback'].includes(rule.triggerType)
                  }
                  placeholder="Pisahkan alias dengan koma"
                  value={rule.triggerValues.join(', ')}
                  onChange={(event) =>
                    updateRule(index, {
                      triggerValues: event.target.value
                        .split(',')
                        .map((value) => value.trim())
                    })
                  }
                />
              </label>
              <label>
                Response
                <textarea
                  disabled={version.status !== 'draft'}
                  maxLength={4096}
                  rows={5}
                  value={rule.responseText}
                  onChange={(event) =>
                    updateRule(index, { responseText: event.target.value })
                  }
                />
              </label>
              {version.status === 'draft' && (
                <button
                  className="rule-card__delete"
                  type="button"
                  onClick={() =>
                    setRules((current) =>
                      current.filter((_, ruleIndex) => ruleIndex !== index)
                    )
                  }
                >
                  Hapus rule
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <aside className="chatbot-tools">
        <section className="panel">
          <p className="eyebrow">Dry-run · tidak mengirim pesan</p>
          <h2>Test console</h2>
          {dirty && (
            <p className="tool-hint">
              Simpan draft dulu agar test memakai perubahan terbaru.
            </p>
          )}
          <textarea
            aria-label="Input test chatbot"
            maxLength={4096}
            rows={3}
            value={testInput}
            onChange={(event) => setTestInput(event.target.value)}
          />
          <button
            className="button"
            disabled={dirty || testMutation.isPending}
            type="button"
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? 'Menguji…' : 'Jalankan test'}
          </button>
          {testMutation.data && (
            <div className="test-result" aria-live="polite">
              <dl>
                <div>
                  <dt>Normalized</dt>
                  <dd>{testMutation.data.data.normalizedInput || '(empty)'}</dd>
                </div>
                <div>
                  <dt>Matched</dt>
                  <dd>
                    {testMutation.data.data.matchedRule.triggerType} · priority{' '}
                    {testMutation.data.data.matchedRule.priority}
                  </dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>v{testMutation.data.data.versionNumber}</dd>
                </div>
              </dl>
              <pre>{testMutation.data.data.response}</pre>
            </div>
          )}
          {testMutation.error && (
            <div className="form-alert form-alert--error">
              {errorMessage(testMutation.error)}
            </div>
          )}
        </section>

        {version.status === 'draft' && (
          <section className="panel publish-panel">
            <p className="eyebrow">Protected publish</p>
            <h2>Publish draft</h2>
            <p className="tool-hint">
              Diff terhadap active: {changedRules} rule berubah,{' '}
              {rules.length - (activeDetail?.data.rules.length ?? 0)} net rule.
            </p>
            <label>
              Ringkasan perubahan
              <textarea
                maxLength={500}
                rows={3}
                value={changeSummary}
                onChange={(event) => setChangeSummary(event.target.value)}
              />
            </label>
            <label>
              Ketik PUBLISH
              <input
                autoComplete="off"
                value={publishConfirmation}
                onChange={(event) => setPublishConfirmation(event.target.value)}
              />
            </label>
            <button
              className="button button--primary"
              disabled={
                dirty ||
                problems.length > 0 ||
                changeSummary.trim().length < 5 ||
                publishConfirmation !== 'PUBLISH' ||
                publishMutation.isPending
              }
              type="button"
              onClick={() => publishMutation.mutate()}
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish version'}
            </button>
            {publishMutation.error && (
              <div className="form-alert form-alert--error">
                {errorMessage(publishMutation.error)}
              </div>
            )}
          </section>
        )}

        {version.status === 'archived' && version.publishedAt && (
          <section className="panel publish-panel">
            <p className="eyebrow">Protected rollback</p>
            <h2>Rollback ke v{version.versionNumber}</h2>
            <label>
              Alasan rollback
              <textarea
                maxLength={500}
                rows={3}
                value={rollbackReason}
                onChange={(event) => setRollbackReason(event.target.value)}
              />
            </label>
            <label>
              Ketik ROLLBACK
              <input
                autoComplete="off"
                value={rollbackConfirmation}
                onChange={(event) => setRollbackConfirmation(event.target.value)}
              />
            </label>
            <button
              className="button button--danger"
              disabled={
                rollbackReason.trim().length < 5 ||
                rollbackConfirmation !== 'ROLLBACK' ||
                rollbackMutation.isPending
              }
              type="button"
              onClick={() => rollbackMutation.mutate()}
            >
              {rollbackMutation.isPending ? 'Rolling back…' : 'Rollback'}
            </button>
            {rollbackMutation.error && (
              <div className="form-alert form-alert--error">
                {errorMessage(rollbackMutation.error)}
              </div>
            )}
          </section>
        )}
      </aside>
    </div>
  );
};

export const ChatbotRulesPage = () => {
  const queryClient = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null
  );
  const [draftName, setDraftName] = useState('');
  const versions = useQuery({
    queryKey: ['chatbot', 'versions'],
    queryFn: listChatbotVersions
  });
  const active = versions.data?.data.find(
    (version) => version.status === 'published'
  );
  const selectedId =
    selectedVersionId ?? active?.id ?? versions.data?.data[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ['chatbot', 'version', selectedId],
    queryFn: () => getChatbotVersion(selectedId!),
    enabled: Boolean(selectedId)
  });
  const activeDetail = useQuery({
    queryKey: ['chatbot', 'version', active?.id],
    queryFn: () => getChatbotVersion(active!.id),
    enabled: Boolean(active?.id && active.id !== selectedId)
  });
  const createMutation = useMutation({
    mutationFn: () => createChatbotDraft(draftName.trim() || 'Draft perubahan'),
    onSuccess: async (created) => {
      setSelectedVersionId(created.data.version.id);
      setDraftName('');
      await queryClient.invalidateQueries({ queryKey: ['chatbot'] });
    }
  });

  if (versions.isPending) {
    return <section className="page-state">Memuat chatbot rules…</section>;
  }
  if (versions.error || !active) {
    return (
      <section className="page-state page-state--error">
        <h1>Chatbot rules tidak tersedia</h1>
        <p>{errorMessage(versions.error)}</p>
      </section>
    );
  }

  return (
    <section>
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Sprint 5 · Versioned configuration</p>
          <h1>Chatbot rule management</h1>
          <p>
            Edit draft, verifikasi response, lalu publish tanpa mengubah source
            code.
          </p>
        </div>
        <div className="new-draft">
          <input
            aria-label="Nama draft"
            maxLength={150}
            placeholder="Nama draft"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <button
            className="button button--primary"
            disabled={createMutation.isPending}
            type="button"
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Membuat…' : 'Buat draft dari active'}
          </button>
        </div>
      </header>
      {createMutation.error && (
        <div className="form-alert form-alert--error">
          {errorMessage(createMutation.error)}
        </div>
      )}

      <div className="chatbot-layout">
        <aside className="panel version-history">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Immutable history</p>
              <h2>Versions</h2>
            </div>
          </div>
          <div className="version-list">
            {versions.data.data.map((version) => (
              <button
                data-active={selectedId === version.id}
                key={version.id}
                type="button"
                onClick={() => setSelectedVersionId(version.id)}
              >
                <span>
                  <strong>v{version.versionNumber}</strong>
                  <small>{version.name}</small>
                </span>
                <StatusBadge tone={versionTone(version.status)}>
                  {version.status}
                </StatusBadge>
              </button>
            ))}
          </div>
        </aside>

        {detail.isPending ? (
          <section className="page-state">Memuat version…</section>
        ) : detail.data ? (
          <ChatbotWorkspace
            activeDetail={
              detail.data.data.version.status === 'published'
                ? detail.data
                : activeDetail.data
            }
            activeVersionId={active.id}
            detail={detail.data}
            key={`${detail.data.data.version.id}:${detail.data.data.version.revision}:${detail.data.data.version.status}`}
            refresh={async () => {
              await versions.refetch();
              await detail.refetch();
            }}
          />
        ) : (
          <section className="page-state page-state--error">
            {errorMessage(detail.error)}
          </section>
        )}
      </div>
    </section>
  );
};
