import type { ChatbotTestResponse } from '../api/contracts';

type ChatbotPreviewProps = {
  disabled: boolean;
  errorMessage?: string;
  input: string;
  isPending: boolean;
  result?: ChatbotTestResponse;
  onInputChange: (value: string) => void;
  onRun: () => void;
};

export const ChatbotPreview = ({
  disabled,
  errorMessage,
  input,
  isPending,
  result,
  onInputChange,
  onRun
}: ChatbotPreviewProps) => (
  <aside className="chatbot-tools">
    <section
      className="panel chatbot-preview-panel"
      id="chatbot-test-panel"
      tabIndex={-1}
    >
      <p className="eyebrow">Langkah 2 · Uji tanpa mengirim</p>
      <h2>Coba jawaban chatbot</h2>
      <p className="tool-hint">
        Masukkan contoh pesan pelanggan. Pengujian memakai perubahan di editor,
        termasuk yang belum disimpan.
      </p>
      <label className="chatbot-preview__input">
        Pesan pelanggan
        <textarea
          aria-label="Input test chatbot"
          maxLength={4096}
          placeholder="Contoh: menu"
          rows={3}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
        />
      </label>
      <button
        aria-label="Jalankan test"
        className="button"
        disabled={disabled || isPending}
        type="button"
        onClick={onRun}
      >
        {isPending ? 'Menguji…' : 'Uji perubahan'}
      </button>
      {result && (
        <div className="test-result chatbot-preview__result" aria-live="polite">
          <div
            aria-label="Simulasi percakapan chatbot"
            className="chatbot-preview__conversation"
          >
            <div className="message-row" data-direction="outgoing">
              <div className="message-bubble">
                <p>{input.trim() || '(pesan kosong)'}</p>
                <div className="message-bubble__meta">
                  <span>Pelanggan</span>
                </div>
              </div>
            </div>
            <div className="message-row" data-direction="incoming">
              <div className="message-bubble">
                <p>{result.data.response || '(tidak ada jawaban)'}</p>
                <div className="message-bubble__meta">
                  <span>Chatbot</span>
                </div>
              </div>
            </div>
          </div>
          <dl className="chatbot-preview__details">
            <div>
              <dt>Pesan dibaca sebagai</dt>
              <dd>{result.data.normalizedInput || '(kosong)'}</dd>
            </div>
            <div>
              <dt>Jawaban yang cocok</dt>
              <dd>
                {result.data.matchedRule
                  ? `Jawaban urutan ${result.data.matchedRule.priority}`
                  : 'Tidak ada jawaban yang cocok'}
              </dd>
            </div>
            <div>
              <dt>Tindakan</dt>
              <dd>
                {result.data.matchedRule?.action === 'create_handoff'
                  ? 'Balas dan alihkan ke admin'
                  : result.data.matchedRule
                    ? 'Balas otomatis'
                    : 'Tidak ada'}
              </dd>
            </div>
          </dl>
        </div>
      )}
      {errorMessage && (
        <div className="form-alert form-alert--error" role="alert">
          {errorMessage}
        </div>
      )}
    </section>
  </aside>
);
