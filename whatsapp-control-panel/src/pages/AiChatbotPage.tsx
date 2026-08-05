import { useQuery } from '@tanstack/react-query';
import { getAiChatbotFoundation } from '../api/ai-chatbot';
import type {
  AiChatbotFoundationResponse,
  AiChatbotModule
} from '../api/contracts';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import { navigate } from '../routing/navigation';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { AiChatbotSettings } from './AiChatbotSettings';
import { AiChatbotInstructions } from './AiChatbotInstructions';
import { AiKnowledgeBase } from './AiKnowledgeBase';
import { AiChatbotPlayground } from './AiChatbotPlayground';
import { AiHandoffQueue } from './AiHandoffQueue';
import { AiConversationLogs } from './AiConversationLogs';
import { AiUnansweredQuestions } from './AiUnansweredQuestions';

const aiChatbotFoundationQueryKey = [
  'ai-chatbot',
  'foundation'
] as const;

const moduleDescription: Record<AiChatbotModule['key'], string> = {
  overview: 'Status fondasi, guardrail, dependency, dan roadmap delivery.',
  knowledge: 'Kelola FAQ, artikel, dokumen, kategori, dan workflow publikasi.',
  instructions: 'Kelola system instruction dan versi prompt yang dapat diaudit.',
  playground: 'Uji retrieval dan jawaban tanpa mengirim pesan ke customer.',
  conversations: 'Telusuri jawaban, sumber knowledge, model, token, dan latency.',
  unanswered: 'Ubah pertanyaan tanpa jawaban menjadi coverage Knowledge Base.',
  handoffs: 'Teruskan percakapan yang memerlukan tindak lanjut kepada Admin RAHO.',
  analytics: 'Pantau answer rate, fallback, handoff, kualitas, dan biaya.',
  settings: 'Atur provider, retrieval, safety, memory, dan feature activation.'
};

const capabilityLabel = {
  enabled: 'Tersedia',
  disabled: 'Dikonfigurasi · nonaktif',
  not_instrumented: 'Belum terhubung',
  unavailable: 'Tidak tersedia'
} as const;

const capabilityTone: Record<
  keyof typeof capabilityLabel,
  StatusTone
> = {
  enabled: 'success',
  disabled: 'info',
  not_instrumented: 'warning',
  unavailable: 'danger'
};

const shouldHandleNavigation = (
  event: ReactMouseEvent<HTMLAnchorElement>
) =>
  event.button === 0 &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey;

const AiModuleNavigation = ({
  modules,
  pathname
}: {
  modules: AiChatbotModule[];
  pathname: string;
}) => (
  <nav aria-label="Menu Integrasi Chatbot AI" className="ai-module-nav">
    <ul>
      {modules.map((module) => {
        const active =
          module.path === pathname ||
          pathname.startsWith(`${module.path}/`) ||
          (module.key === 'overview' && pathname === '/ai-chatbot');
        return (
          <li key={module.key}>
            <a
              aria-current={active ? 'page' : undefined}
              data-active={active}
              href={module.path}
              onClick={(event) => {
                if (!shouldHandleNavigation(event)) return;
                event.preventDefault();
                navigate(module.path);
              }}
            >
              <span>{module.label}</span>
              <small>
                <span aria-hidden="true">S{module.targetSprint}</span>
                <span className="sr-only">Sprint {module.targetSprint}</span>
              </small>
            </a>
          </li>
        );
      })}
    </ul>
  </nav>
);

const FoundationOverview = ({
  data
}: {
  data: AiChatbotFoundationResponse['data'];
}) => {
  const dependencies = [
    {
      label: 'Tenant context',
      state: data.tenant.state,
      value: data.tenant.tenantId ? 'Bootstrap tenant tersedia' : 'Tenant belum dipilih'
    },
    {
      label: 'Vector store',
      state: data.infrastructure.vectorStore.state,
      value: 'PostgreSQL + pgvector'
    },
    {
      label: 'Processing queue',
      state: data.infrastructure.queue.state,
      value: 'Redis'
    },
    {
      label: 'Object storage',
      state: data.infrastructure.objectStorage.state,
      value: 'S3-compatible'
    }
  ];

  return (
    <>
      <section className="ai-foundation-callout" aria-label="Status rollout">
        <div>
          <p className="eyebrow">Fail-closed sejak hari pertama</p>
          <h2>Belum ada traffic customer yang memakai AI</h2>
        </div>
        <p>
          Runtime tetap nonaktif sampai Knowledge Base, safety validator, evaluasi,
          UAT, dan pilot gate dinyatakan lulus.
        </p>
      </section>

      <div className="metric-grid ai-foundation-metrics">
        <article className="metric-card">
          <div className="metric-card__header">
            <div>
              <p className="eyebrow">Runtime</p>
              <h2>RAG terkontrol</h2>
            </div>
            <StatusBadge tone={data.runtime.enabled ? 'success' : 'warning'}>
              Feature flag {data.runtime.enabled ? 'aktif' : 'nonaktif'}
            </StatusBadge>
          </div>
          <p className="metric-card__description">
            Knowledge Base adalah sumber kebenaran; model tidak boleh menjawab
            bebas tanpa context.
          </p>
          <dl className="ai-foundation-facts">
            <div><dt>Mode</dt><dd>RAG</dd></div>
            <div><dt>Strict grounding</dt><dd>{data.runtime.strictGrounding ? 'Aktif' : 'Nonaktif'}</dd></div>
          </dl>
        </article>

        <article className="metric-card">
          <div className="metric-card__header">
            <div>
              <p className="eyebrow">AI provider</p>
              <h2>{data.provider.name ?? 'Belum dipilih'}</h2>
            </div>
            <StatusBadge tone={capabilityTone[data.provider.state]}>
              {capabilityLabel[data.provider.state]}
            </StatusBadge>
          </div>
          <p className="metric-card__description">
            Provider dan model akan dikunci setelah evaluasi Bahasa Indonesia,
            structured output, latency, dan biaya.
          </p>
          <p className="ai-foundation-note">
            Secret hanya direferensikan dari server dan tidak pernah dikirim ke browser.
          </p>
        </article>

        <article className="metric-card">
          <div className="metric-card__header">
            <div>
              <p className="eyebrow">Release</p>
              <h2>
                {data.status === 'development_ready'
                  ? 'Development ready'
                  : 'Foundation blocked'}
              </h2>
            </div>
            <StatusBadge
              tone={data.status === 'development_ready' ? 'success' : 'danger'}
            >
              Sprint 6
            </StatusBadge>
          </div>
          <p className="metric-card__description">
            Namespace, route shell, kontrak API, guardrail, dan boundary keamanan
            Settings, AI Instructions, dan Knowledge Governance tersedia untuk development.
          </p>
          <p className="ai-foundation-note">API contract: /api/admin/v1/ai-chatbot</p>
        </article>
      </div>

      <div className="ai-foundation-layout">
        <section className="panel">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Dependency readiness</p>
              <h2>Fondasi infrastruktur</h2>
            </div>
          </div>
          <ul className="ai-readiness-list">
            {dependencies.map((dependency) => (
              <li key={dependency.label}>
                <div>
                  <strong>{dependency.label}</strong>
                  <span>{dependency.value}</span>
                </div>
                <StatusBadge tone={capabilityTone[dependency.state]}>
                  {capabilityLabel[dependency.state]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Safety boundary</p>
              <h2>Batas yang tidak boleh dilewati</h2>
            </div>
          </div>
          <ul className="ai-guardrail-list">
            <li><span aria-hidden="true">✓</span> Hanya FAQ berbasis knowledge resmi</li>
            <li><span aria-hidden="true">✓</span> Fallback dan human handoff wajib</li>
            <li><span aria-hidden="true">×</span> Tidak menangani booking atau pembayaran</li>
            <li><span aria-hidden="true">×</span> Tidak memberi diagnosis atau saran medis personal</li>
            <li><span aria-hidden="true">×</span> Tidak menjawab tanpa context yang valid</li>
          </ul>
        </section>
      </div>

      <section className="panel ai-roadmap-panel">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Route map</p>
            <h2>Modul menuju production</h2>
          </div>
          <StatusBadge tone="info">9 modul</StatusBadge>
        </div>
        <div className="ai-module-grid">
          {data.modules.map((module) => (
            <article key={module.key}>
              <div>
                <strong>{module.label}</strong>
                <StatusBadge tone={module.state === 'available' ? 'success' : 'neutral'}>
                  Sprint {module.targetSprint}
                </StatusBadge>
              </div>
              <p>{moduleDescription[module.key]}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
};

const PlannedModule = ({ module }: { module: AiChatbotModule }) => (
  <section className="empty-stage ai-module-placeholder">
    <p className="eyebrow">Dijadwalkan pada Sprint {module.targetSprint}</p>
    <h2>Route {module.label} sudah disiapkan</h2>
    <p>{moduleDescription[module.key]}</p>
    <p>
      Modul ini belum masuk delivery Sprint 6. Data atau aksi palsu tidak
      ditampilkan sebagai fitur yang sudah tersedia.
    </p>
    <a
      className="button"
      href="/ai-chatbot/overview"
      onClick={(event) => {
        if (!shouldHandleNavigation(event)) return;
        event.preventDefault();
        navigate('/ai-chatbot/overview');
      }}
    >
      Kembali ke overview AI
    </a>
  </section>
);

export const AiChatbotPage = ({ pathname }: { pathname: string }) => {
  const foundationQuery = useQuery({
    queryKey: aiChatbotFoundationQueryKey,
    queryFn: getAiChatbotFoundation,
    staleTime: 60_000
  });

  if (foundationQuery.isPending) {
    return (
      <section className="page-state" aria-live="polite">
        <span className="loader" aria-hidden="true" />
        <h1>Menyiapkan Integrasi Chatbot AI…</h1>
        <p>Memuat kontrak fondasi dan status guardrail.</p>
      </section>
    );
  }

  if (foundationQuery.isError || !foundationQuery.data) {
    return (
      <section className="page-state page-state--error" role="alert">
        <p className="eyebrow">Foundation API unavailable</p>
        <h1>Integrasi Chatbot AI belum dapat dimuat</h1>
        <p>
          {foundationQuery.error instanceof Error
            ? foundationQuery.error.message
            : 'Terjadi kesalahan yang tidak diketahui.'}
        </p>
        <button type="button" onClick={() => foundationQuery.refetch()}>
          Coba lagi
        </button>
      </section>
    );
  }

  const data = foundationQuery.data.data;
  const normalizedPath =
    pathname === '/ai-chatbot' ? '/ai-chatbot/overview' : pathname;
  const activeModule = data.modules.find(
    (module) =>
      module.path === normalizedPath ||
      normalizedPath.startsWith(`${module.path}/`)
  );

  if (!activeModule) {
    return (
      <div className="ai-chatbot-page">
        <AiModuleNavigation modules={data.modules} pathname={normalizedPath} />
        <section className="page-state page-state--error" role="alert">
          <p className="eyebrow">404 · Modul AI</p>
          <h1>Modul tidak ditemukan</h1>
          <button type="button" onClick={() => navigate('/ai-chatbot/overview')}>
            Kembali ke overview AI
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="ai-chatbot-page">
      <header className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">Sprint 6 · Admin Operations Beta</p>
          <h1>{activeModule.key === 'overview' ? 'Integrasi Chatbot AI' : activeModule.label}</h1>
          <p>
            Chatbot FAQ RAHO berbasis RAG yang aman, terkontrol, dan dapat diaudit.
          </p>
        </div>
        <StatusBadge tone={data.status === 'development_ready' ? 'success' : 'danger'}>
          {data.status === 'development_ready' ? 'Development ready' : 'Blocked'}
        </StatusBadge>
      </header>

      <AiModuleNavigation modules={data.modules} pathname={normalizedPath} />

      {activeModule.key === 'overview' ? (
        <FoundationOverview data={data} />
      ) : activeModule.key === 'settings' ? (
        <AiChatbotSettings />
      ) : activeModule.key === 'instructions' ? (
        <AiChatbotInstructions />
      ) : activeModule.key === 'knowledge' ? (
        <AiKnowledgeBase pathname={normalizedPath} />
      ) : activeModule.key === 'playground' ? (
        <AiChatbotPlayground />
      ) : activeModule.key === 'handoffs' ? (
        <AiHandoffQueue />
      ) : activeModule.key === 'conversations' ? (
        <AiConversationLogs
          key={normalizedPath.split('/')[3] ?? 'conversation-list'}
          conversationId={normalizedPath.split('/')[3] ?? null}
        />
      ) : activeModule.key === 'unanswered' ? (
        <AiUnansweredQuestions />
      ) : (
        <PlannedModule module={activeModule} />
      )}
    </div>
  );
};
