import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bulkKnowledgeAction,
  createKnowledge,
  createKnowledgeCategory,
  deleteKnowledgeCategory,
  deleteKnowledgeDraft,
  listKnowledge,
  listKnowledgeCategories,
  reindexKnowledge,
  transitionKnowledge,
  updateKnowledge,
  updateKnowledgeCategory,
  type CategoryWriteInput,
  type KnowledgeFilters,
  type KnowledgeWriteInput
} from '../api/knowledge';
import type { KnowledgeCategory, KnowledgeItem } from '../api/contracts';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import { AiKnowledgeDocuments } from './AiKnowledgeDocuments';
import { navigate } from '../routing/navigation';

const categoriesKey = ['ai-chatbot', 'knowledge-categories'] as const;
const knowledgeKey = ['ai-chatbot', 'knowledge'] as const;

const statusTone: Record<KnowledgeItem['status'], StatusTone> = {
  draft: 'neutral', review: 'info', approved: 'warning',
  published: 'success', archived: 'neutral'
};

const emptyKnowledge = (sourceType: 'faq' | 'article'): KnowledgeWriteInput => ({
  categoryId: null,
  sourceType,
  title: '',
  question: sourceType === 'faq' ? '' : null,
  questionVariants: [],
  content: '',
  sourceReference: null,
  internalNotes: null,
  tags: [],
  metadata: {},
  requiresDisclaimer: false,
  priority: 0,
  validFrom: null,
  validUntil: null
});

const fromItem = (item: KnowledgeItem): KnowledgeWriteInput => ({
  categoryId: item.categoryId,
  sourceType: item.sourceType,
  title: item.title,
  question: item.question,
  questionVariants: item.questionVariants,
  content: item.content,
  sourceReference: item.sourceReference,
  internalNotes: item.internalNotes,
  tags: item.tags,
  metadata: item.metadata,
  requiresDisclaimer: item.requiresDisclaimer,
  priority: item.priority,
  validFrom: item.validFrom,
  validUntil: item.validUntil
});

const localDateTime = (value: string | null): string =>
  value ? new Date(value).toISOString().slice(0, 16) : '';
const isoDateTime = (value: string): string | null =>
  value ? new Date(value).toISOString() : null;

const KnowledgeEditor = ({
  item,
  initialSourceType,
  categories,
  onDone,
  onCancel
}: {
  item: KnowledgeItem | null;
  initialSourceType: 'faq' | 'article';
  categories: KnowledgeCategory[];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState<KnowledgeWriteInput>(() =>
    item ? fromItem(item) : emptyKnowledge(initialSourceType)
  );
  const [variants, setVariants] = useState(item?.questionVariants.join('\n') ?? '');
  const [tags, setTags] = useState(item?.tags.join(', ') ?? '');
  const [dirty, setDirty] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: KnowledgeWriteInput) =>
      item ? updateKnowledge(item, input) : createKnowledge(input),
    onSuccess: async () => {
      setDirty(false);
      await onDone();
    }
  });

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const update = <Key extends keyof KnowledgeWriteInput>(key: Key, value: KnowledgeWriteInput[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      ...draft,
      question: draft.sourceType === 'faq' ? draft.question : null,
      questionVariants: variants.split('\n').map((value) => value.trim()).filter(Boolean),
      tags: tags.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    });
  };

  return (
    <section className="panel knowledge-editor">
      <div className="panel__heading">
        <div>
          <p className="eyebrow">{item ? `Version ${item.version} · revision ${item.revision}` : 'New draft'}</p>
          <h2>{item ? `Edit ${item.title}` : `Tambah ${initialSourceType === 'faq' ? 'FAQ' : 'Artikel'}`}</h2>
        </div>
        {item && <StatusBadge tone={statusTone[item.status]}>{item.status}</StatusBadge>}
      </div>
      {item?.status === 'published' && (
        <p className="notice notice--warning">Konten published tidak diubah langsung. Save akan membuat draft version {item.version + 1}.</p>
      )}
      <form className="knowledge-editor__form" onSubmit={submit}>
        <div className="form-grid form-grid--two">
          <label>Jenis knowledge<select value={draft.sourceType} onChange={(event) => update('sourceType', event.target.value as 'faq' | 'article')}><option value="faq">FAQ</option><option value="article">Artikel Markdown</option></select></label>
          <label>Kategori<select value={draft.categoryId ?? ''} onChange={(event) => update('categoryId', event.target.value || null)}><option value="">Tanpa kategori</option>{categories.filter((category) => category.active || category.id === draft.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        </div>
        <label>Judul<input required minLength={3} maxLength={255} value={draft.title} onChange={(event) => update('title', event.target.value)} /></label>
        {draft.sourceType === 'faq' && <label>Pertanyaan utama<textarea required rows={3} maxLength={2000} value={draft.question ?? ''} onChange={(event) => update('question', event.target.value)} /></label>}
        <label>Variasi pertanyaan <span className="field-hint">Satu per baris</span><textarea rows={4} maxLength={10000} value={variants} onChange={(event) => { setVariants(event.target.value); setDirty(true); }} /></label>
        <label>Jawaban resmi / konten Markdown<textarea required rows={12} maxLength={100000} value={draft.content} onChange={(event) => update('content', event.target.value)} /></label>
        {draft.sourceType === 'article' && <details className="knowledge-preview"><summary>Preview aman</summary><article><h3>{draft.title || 'Judul artikel'}</h3><pre>{draft.content || 'Konten artikel akan tampil di sini.'}</pre></article></details>}
        <div className="form-grid form-grid--two">
          <label>Tags <span className="field-hint">Pisahkan koma</span><input value={tags} maxLength={1000} onChange={(event) => { setTags(event.target.value); setDirty(true); }} /></label>
          <label>Prioritas<input type="number" min="0" max="100" value={draft.priority} onChange={(event) => update('priority', Number(event.target.value))} /></label>
          <label>Berlaku mulai<input type="datetime-local" value={localDateTime(draft.validFrom)} onChange={(event) => update('validFrom', isoDateTime(event.target.value))} /></label>
          <label>Berlaku sampai<input type="datetime-local" value={localDateTime(draft.validUntil)} onChange={(event) => update('validUntil', isoDateTime(event.target.value))} /></label>
        </div>
        <label>Sumber resmi<input maxLength={2000} value={draft.sourceReference ?? ''} onChange={(event) => update('sourceReference', event.target.value || null)} /></label>
        <label>Catatan internal<textarea rows={3} maxLength={5000} value={draft.internalNotes ?? ''} onChange={(event) => update('internalNotes', event.target.value || null)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={draft.requiresDisclaimer} onChange={(event) => update('requiresDisclaimer', event.target.checked)} /> Wajib menampilkan disclaimer</label>
        <div className="ai-form-actions"><button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Menyimpan…' : 'Save draft'}</button><button className="button button--secondary" type="button" onClick={onCancel}>Batal</button></div>
        {mutation.isError && <p className="form-error" role="alert">{mutation.error.message}</p>}
      </form>
    </section>
  );
};

const CategoryManager = ({ categories, refresh }: { categories: KnowledgeCategory[]; refresh: () => Promise<void> }) => {
  const empty: CategoryWriteInput = { name: '', slug: '', description: null, active: true, sortOrder: categories.length + 1 };
  const [selected, setSelected] = useState<KnowledgeCategory | null>(null);
  const [draft, setDraft] = useState<CategoryWriteInput>(empty);
  const save = useMutation({
    mutationFn: () => selected
      ? updateKnowledgeCategory(selected.id, selected.revision, draft)
      : createKnowledgeCategory(draft),
    onSuccess: async () => { setSelected(null); setDraft(empty); await refresh(); }
  });
  const remove = useMutation({ mutationFn: deleteKnowledgeCategory, onSuccess: refresh });
  const select = (category: KnowledgeCategory) => {
    setSelected(category);
    setDraft({ name: category.name, slug: category.slug, description: category.description, active: category.active, sortOrder: category.sortOrder });
  };
  return (
    <details className="panel knowledge-categories">
      <summary><span><span className="eyebrow">Governance</span><strong>Kelola kategori ({categories.length})</strong></span></summary>
      <div className="knowledge-categories__layout">
        <ul>{categories.map((category) => <li key={category.id}><button type="button" className="text-button" onClick={() => select(category)}>{category.name}</button><span>{category.knowledgeCount} knowledge · {category.active ? 'aktif' : 'nonaktif'}</span><button type="button" className="text-button text-button--danger" disabled={category.knowledgeCount > 0 || remove.isPending} onClick={() => remove.mutate(category.id)}>Hapus</button></li>)}</ul>
        <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <h3>{selected ? 'Edit kategori' : 'Kategori baru'}</h3>
          <label>Nama<input required minLength={2} maxLength={150} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></label>
          <label>Deskripsi<textarea rows={2} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value || null })} /></label>
          <label>Urutan<input type="number" min="0" max="10000" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Aktif</label>
          <div className="ai-form-actions"><button type="submit" disabled={save.isPending}>Simpan kategori</button>{selected && <button type="button" className="button button--secondary" onClick={() => { setSelected(null); setDraft(empty); }}>Batal</button>}</div>
          {(save.isError || remove.isError) && <p className="form-error" role="alert">{save.error?.message ?? remove.error?.message}</p>}
        </form>
      </div>
    </details>
  );
};

export const AiKnowledgeBase = ({ pathname }: { pathname: string }) => {
  const queryClient = useQueryClient();
  const initialSourceType = pathname.endsWith('/new-article') ? 'article' : 'faq';
  const [filters, setFilters] = useState<KnowledgeFilters>({});
  const [editor, setEditor] = useState<KnowledgeItem | null | undefined>(
    pathname.endsWith('/new-faq') || pathname.endsWith('/new-article') ? null : undefined
  );
  const [editorKey, setEditorKey] = useState(0);
  const [editorSource, setEditorSource] = useState<'faq' | 'article'>(initialSourceType);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reason, setReason] = useState('Reviewed for Sprint 3');
  const categories = useQuery({ queryKey: categoriesKey, queryFn: listKnowledgeCategories });
  const knowledge = useQuery({ queryKey: [...knowledgeKey, filters], queryFn: () => listKnowledge(filters) });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: knowledgeKey }),
      queryClient.invalidateQueries({ queryKey: categoriesKey })
    ]);
  };
  const transition = useMutation({
    mutationFn: ({ item, action }: { item: KnowledgeItem; action: 'submit-review' | 'request-revision' | 'approve' | 'publish' | 'archive' }) => transitionKnowledge(item, action, reason),
    onSuccess: async () => { setEditor(undefined); await refresh(); }
  });
  const remove = useMutation({ mutationFn: deleteKnowledgeDraft, onSuccess: refresh });
  const bulk = useMutation({
    mutationFn: (action: 'publish' | 'archive') => bulkKnowledgeAction(selectedIds, action, reason),
    onSuccess: async () => { setSelectedIds([]); await refresh(); }
  });
  const reindex = useMutation({ mutationFn: reindexKnowledge, onSuccess: refresh });
  const categoryOptions = categories.data?.data ?? [];
  const rows = knowledge.data?.data ?? [];
  const counts = {
    published: rows.filter((row) => row.status === 'published').length,
    expired: rows.filter((row) => row.expired).length
  };

  const openNew = (sourceType: 'faq' | 'article') => {
    setEditor(null);
    setEditorSource(sourceType);
    setEditorKey((value) => value + 1);
  };

  const subNavigation = (
    <nav className="knowledge-subnav" aria-label="Bagian Knowledge Base">
      <button type="button" data-active={!pathname.includes('/documents') && !pathname.includes('/processing')} onClick={() => navigate('/ai-chatbot/knowledge')}>FAQ & Artikel</button>
      <button type="button" data-active={pathname.includes('/documents')} onClick={() => navigate('/ai-chatbot/knowledge/documents')}>Documents</button>
      <button type="button" data-active={pathname.includes('/processing')} onClick={() => navigate('/ai-chatbot/knowledge/processing')}>Processing Queue</button>
    </nav>
  );

  if (pathname.includes('/documents') || pathname.includes('/processing')) {
    return (
      <div className="knowledge-page">
        {subNavigation}
        <AiKnowledgeDocuments
          categories={categoryOptions}
          processingOnly={pathname.includes('/processing')}
        />
      </div>
    );
  }

  return (
    <div className="knowledge-page">
      {subNavigation}
      <section className="knowledge-summary metric-grid">
        <article className="metric-card"><p className="eyebrow">Current view</p><h2>{rows.length}</h2><p>Knowledge tenant-scoped</p></article>
        <article className="metric-card"><p className="eyebrow">Published</p><h2>{counts.published}</h2><p>Masuk indexing queue Sprint 3</p></article>
        <article className="metric-card"><p className="eyebrow">Expired</p><h2>{counts.expired}</h2><p>Tidak menjadi retrieval candidate</p></article>
      </section>

      {categories.data && <CategoryManager categories={categoryOptions} refresh={refresh} />}

      <section className="panel knowledge-list-panel">
        <div className="panel__heading"><div><p className="eyebrow">Knowledge Admin Alpha</p><h2>FAQ dan artikel resmi</h2></div><div className="ai-form-actions"><button type="button" onClick={() => openNew('faq')}>Tambah FAQ</button><button type="button" className="button button--secondary" onClick={() => openNew('article')}>Tambah Artikel</button></div></div>
        <div className="knowledge-filters">
          <label>Search<input value={filters.query ?? ''} onChange={(event) => setFilters({ ...filters, query: event.target.value || undefined })} placeholder="Judul, pertanyaan, atau konten" /></label>
          <label>Status<select value={filters.status ?? ''} onChange={(event) => setFilters({ ...filters, status: (event.target.value || undefined) as KnowledgeFilters['status'] })}><option value="">Semua</option>{['draft', 'review', 'approved', 'published', 'archived'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Jenis<select value={filters.sourceType ?? ''} onChange={(event) => setFilters({ ...filters, sourceType: (event.target.value || undefined) as KnowledgeFilters['sourceType'] })}><option value="">Semua</option><option value="faq">FAQ</option><option value="article">Artikel</option></select></label>
          <label>Kategori<select value={filters.categoryId ?? ''} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value || undefined })}><option value="">Semua</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        </div>
        <label className="ai-change-reason">Alasan workflow<input value={reason} minLength={5} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
        {selectedIds.length > 0 && <div className="knowledge-bulk"><strong>{selectedIds.length} dipilih</strong><button type="button" disabled={bulk.isPending || reason.trim().length < 5} onClick={() => bulk.mutate('publish')}>Bulk publish</button><button type="button" className="button button--secondary" disabled={bulk.isPending || reason.trim().length < 5} onClick={() => bulk.mutate('archive')}>Bulk archive</button></div>}

        {knowledge.isPending || categories.isPending ? <div className="page-state"><span className="loader" aria-hidden="true" /><h3>Memuat Knowledge Base…</h3></div>
          : knowledge.isError || categories.isError ? <div className="page-state page-state--error" role="alert"><h3>Knowledge Base belum dapat dimuat</h3><p>{knowledge.error?.message ?? categories.error?.message}</p><button type="button" onClick={() => { knowledge.refetch(); categories.refetch(); }}>Coba lagi</button></div>
          : rows.length === 0 ? <div className="empty-stage"><h3>Belum ada knowledge pada filter ini</h3><p>Buat FAQ atau artikel resmi sebagai draft pertama.</p></div>
          : <div className="knowledge-table-wrap"><table className="data-table knowledge-table"><thead><tr><th><span className="sr-only">Pilih</span></th><th>Knowledge</th><th>Kategori</th><th>Status</th><th>Validity</th><th>Updated</th><th>Action</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><input aria-label={`Pilih ${item.title}`} type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></td><td><strong>{item.title}</strong><span>{item.sourceType} · v{item.version}.{item.revision}</span></td><td>{item.categoryName ?? '—'}</td><td><StatusBadge tone={item.expired ? 'danger' : statusTone[item.status]}>{item.expired ? 'expired' : item.status}</StatusBadge><small>{item.status === 'published' && !item.expired ? 'Searchable setelah worker selesai' : 'Tidak aktif di index'}</small></td><td>{item.validUntil ? new Date(item.validUntil).toLocaleDateString('id-ID') : 'Tanpa batas'}</td><td>{new Date(item.updatedAt).toLocaleString('id-ID')}</td><td><div className="table-actions"><button type="button" className="text-button" onClick={() => { setEditor(item); setEditorKey((value) => value + 1); }}>Edit</button>{item.status === 'draft' && <><button type="button" className="text-button" disabled={transition.isPending} onClick={() => transition.mutate({ item, action: 'submit-review' })}>Submit review</button><button type="button" className="text-button text-button--danger" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>Delete draft</button></>}{item.status === 'review' && <><button type="button" className="text-button" onClick={() => transition.mutate({ item, action: 'approve' })}>Approve</button><button type="button" className="text-button" onClick={() => transition.mutate({ item, action: 'request-revision' })}>Request revision</button></>}{item.status === 'approved' && <button type="button" className="text-button" onClick={() => transition.mutate({ item, action: 'publish' })}>Publish</button>}{item.status === 'published' && <><button type="button" className="text-button" disabled={reindex.isPending} onClick={() => reindex.mutate(item.id)}>Re-index</button><button type="button" className="text-button text-button--danger" onClick={() => transition.mutate({ item, action: 'archive' })}>Archive</button></>}</div></td></tr>)}</tbody></table></div>}
        {(transition.isError || remove.isError || bulk.isError || reindex.isError) && <p className="form-error" role="alert">{transition.error?.message ?? remove.error?.message ?? bulk.error?.message ?? reindex.error?.message}</p>}
      </section>

      {editor !== undefined && <KnowledgeEditor key={`${editor?.id ?? editorSource}-${editor?.revision ?? 0}-${editorKey}`} item={editor} initialSourceType={editor?.sourceType ?? editorSource} categories={categoryOptions} onDone={async () => { setEditor(undefined); await refresh(); }} onCancel={() => setEditor(undefined)} />}
    </div>
  );
};
