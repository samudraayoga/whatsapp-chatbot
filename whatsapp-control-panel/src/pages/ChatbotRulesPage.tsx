import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getChatbotConfig,
  saveChatbotConfig,
  testChatbotRules
} from '../api/chatbot';
import { ApiClientError } from '../api/client';
import type { ChatbotConfigResponse, ChatbotRule } from '../api/contracts';
import { ChatbotPreview } from '../chatbot/ChatbotPreview';
import { ChatbotRuleCard } from '../chatbot/ChatbotRuleCard';
import {
  createChatbotRuleClientKey,
  createEditableRule,
  findChatbotRuleProblems,
  reviseChatbotEditSession,
  toChatbotPayloadRules,
  toEditableRules,
  type ChatbotEditSession,
  type EditableChatbotRule
} from '../chatbot/editor';
import { beforeNavigationEvent } from '../routing/navigation';

const chatbotConfigQueryKey = ['chatbot', 'config'] as const;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Operasi gagal. Coba lagi.';

const ChatbotEditor = ({
  config
}: {
  config: ChatbotConfigResponse['data'];
}) => {
  const queryClient = useQueryClient();
  const [editSession, setEditSession] = useState<ChatbotEditSession | null>(
    null
  );
  const [testInput, setTestInput] = useState('menu');
  const activeRules = useMemo(
    () => toEditableRules(config.rules),
    [config.rules]
  );
  const editorRules = editSession?.rules ?? activeRules;
  const payloadRules = useMemo(
    () => toChatbotPayloadRules(editorRules),
    [editorRules]
  );
  const problems = useMemo(
    () => findChatbotRuleProblems(payloadRules),
    [payloadRules]
  );
  const dirty = editSession !== null;
  const remoteAdvanced =
    editSession !== null && config.revision > editSession.baseRevision;

  useEffect(() => {
    if (!dirty) return;

    const preventAccidentalExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const confirmInternalNavigation = (event: Event) => {
      if (
        !window.confirm(
          'Perubahan chatbot belum disimpan. Tinggalkan halaman ini?'
        )
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', preventAccidentalExit);
    window.addEventListener(beforeNavigationEvent, confirmInternalNavigation);
    return () => {
      window.removeEventListener('beforeunload', preventAccidentalExit);
      window.removeEventListener(
        beforeNavigationEvent,
        confirmInternalNavigation
      );
    };
  }, [dirty]);

  const saveMutation = useMutation({
    mutationFn: saveChatbotConfig,
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: chatbotConfigQueryKey }),
    onSuccess: (saved) => {
      queryClient.setQueryData(chatbotConfigQueryKey, saved);
      setEditSession(null);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: chatbotConfigQueryKey });
      }
    }
  });
  const testMutation = useMutation({
    mutationFn: testChatbotRules
  });
  const saveErrorMessage =
    saveMutation.error &&
    !(
      saveMutation.error instanceof ApiClientError &&
      saveMutation.error.status === 409
    )
      ? errorMessage(saveMutation.error)
      : null;

  const resetFeedback = () => {
    saveMutation.reset();
    testMutation.reset();
  };

  const reviseRules = (
    revise: (rules: EditableChatbotRule[]) => EditableChatbotRule[]
  ) => {
    resetFeedback();
    setEditSession((current) =>
      reviseChatbotEditSession(current, config, revise)
    );
  };

  const updateRule = (index: number, patch: Partial<ChatbotRule>) => {
    reviseRules((rules) =>
      rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      )
    );
  };

  const addRule = () => {
    const clientKey = createChatbotRuleClientKey();
    reviseRules((rules) =>
      [...rules, createEditableRule(rules, clientKey)].sort(
        (left, right) => left.priority - right.priority
      )
    );
  };

  const deleteRule = (index: number) => {
    reviseRules((rules) =>
      rules.filter((_, ruleIndex) => ruleIndex !== index)
    );
  };

  const discardChanges = () => {
    resetFeedback();
    setEditSession(null);
  };

  const save = () => {
    if (!editSession || remoteAdvanced) return;
    saveMutation.mutate({
      expectedRevision: editSession.baseRevision,
      rules: payloadRules
    });
  };

  const runTest = () => {
    testMutation.mutate({ input: testInput, rules: payloadRules });
  };

  const showTestPanel = () => {
    const testPanel = document.getElementById('chatbot-test-panel');
    testPanel?.scrollIntoView({ block: 'start' });
    testPanel?.focus({ preventScroll: true });
  };

  return (
    <div className="chatbot-workspace">
      <section className="panel chatbot-editor">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Langkah 1 · Edit</p>
            <h2>Jawaban chatbot</h2>
          </div>
          <span className="chatbot-save-state" data-dirty={dirty}>
            {dirty ? 'Ada perubahan belum disimpan' : 'Konfigurasi aktif'}
          </span>
        </div>

        <div className="editor-toolbar chatbot-editor__toolbar">
          <button
            className="button"
            disabled={editorRules.length >= 100 || saveMutation.isPending}
            type="button"
            onClick={addRule}
          >
            Tambah jawaban
          </button>
        </div>

        {problems.length > 0 && (
          <div className="form-alert form-alert--error" role="alert">
            {problems.map((problem) => (
              <span key={problem}>{problem}</span>
            ))}
          </div>
        )}
        {remoteAdvanced && (
          <div className="form-alert form-alert--error" role="alert">
            Konfigurasi aktif berubah di tab lain. Batalkan perubahan untuk
            memuat konfigurasi terbaru.
          </div>
        )}
        {saveMutation.isSuccess && (
          <div className="form-alert form-alert--success" role="status">
            Konfigurasi aktif berhasil disimpan.
          </div>
        )}
        {saveErrorMessage && (
          <div className="form-alert form-alert--error" role="alert">
            {saveErrorMessage}
          </div>
        )}

        <div className="rule-list">
          {editorRules.map((rule, index) => (
            <ChatbotRuleCard
              disabled={saveMutation.isPending}
              index={index}
              key={rule.clientKey}
              rule={rule}
              onChange={(patch) => updateRule(index, patch)}
              onDelete={() => deleteRule(index)}
            />
          ))}
        </div>

        <footer
          aria-label="Simpan konfigurasi chatbot"
          className="editor-toolbar chatbot-action-bar"
        >
          <div className="chatbot-action-bar__copy">
            <strong>Langkah 3 · Simpan & aktifkan</strong>
            <span className="tool-hint">
              Pastikan hasil pengujian sudah sesuai sebelum mengaktifkannya.
            </span>
          </div>
          <button
            className="button chatbot-action-bar__test"
            onClick={showTestPanel}
            type="button"
          >
            Uji perubahan
          </button>
          <button
            className="button"
            disabled={!dirty || saveMutation.isPending}
            type="button"
            onClick={discardChanges}
          >
            Batalkan perubahan
          </button>
          <button
            aria-label="Simpan & aktifkan"
            className="button button--primary"
            disabled={
              !dirty ||
              remoteAdvanced ||
              problems.length > 0 ||
              saveMutation.isPending
            }
            type="button"
            onClick={save}
          >
            {saveMutation.isPending ? 'Menyimpan…' : 'Simpan & aktifkan'}
          </button>
        </footer>
      </section>

      <ChatbotPreview
        disabled={problems.length > 0 || saveMutation.isPending}
        errorMessage={
          testMutation.error ? errorMessage(testMutation.error) : undefined
        }
        input={testInput}
        isPending={testMutation.isPending}
        result={testMutation.data}
        onInputChange={(value) => {
          testMutation.reset();
          setTestInput(value);
        }}
        onRun={runTest}
      />
    </div>
  );
};

export const ChatbotRulesPage = () => {
  const config = useQuery({
    queryKey: chatbotConfigQueryKey,
    queryFn: getChatbotConfig
  });

  if (config.isPending) {
    return <section className="page-state">Memuat konfigurasi chatbot…</section>;
  }
  if (config.error || !config.data) {
    return (
      <section className="page-state page-state--error">
        <h1>Konfigurasi chatbot tidak tersedia</h1>
        <p>{errorMessage(config.error)}</p>
      </section>
    );
  }

  return (
    <section>
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Satu konfigurasi aktif</p>
          <h1>Chatbot</h1>
          <p>Edit jawaban, uji dengan contoh pesan, lalu simpan dan aktifkan.</p>
        </div>
      </header>
      <ChatbotEditor config={config.data.data} />
    </section>
  );
};
