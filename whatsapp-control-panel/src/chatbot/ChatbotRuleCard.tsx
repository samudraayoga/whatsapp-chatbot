import type { ChatbotRule } from '../api/contracts';
import {
  parseTriggerEditorValue,
  type EditableChatbotRule
} from './editor';

type ChatbotRuleCardProps = {
  disabled: boolean;
  index: number;
  rule: EditableChatbotRule;
  onChange: (patch: Partial<ChatbotRule>) => void;
  onDelete: () => void;
};

export const ChatbotRuleCard = ({
  disabled,
  index,
  rule,
  onChange,
  onDelete
}: ChatbotRuleCardProps) => (
  <article className="rule-card">
    <div className="rule-card__heading">
      <strong>Jawaban {index + 1}</strong>
      <button
        aria-label={`Hapus jawaban ${index + 1}`}
        className="rule-card__delete"
        disabled={disabled}
        type="button"
        onClick={onDelete}
      >
        Hapus jawaban
      </button>
    </div>
    <div className="rule-card__meta">
      <label>
        Urutan
        <input
          disabled={disabled}
          min="0"
          type="number"
          value={rule.priority}
          onChange={(event) => onChange({ priority: Number(event.target.value) })}
        />
      </label>
      <label>
        Kapan jawaban digunakan
        <select
          disabled={disabled}
          value={rule.triggerType}
          onChange={(event) => {
            const triggerType = event.target.value as ChatbotRule['triggerType'];
            onChange({
              triggerType,
              triggerValues: ['empty', 'fallback'].includes(triggerType)
                ? []
                : rule.triggerValues.length > 0
                  ? rule.triggerValues
                  : ['']
            });
          }}
        >
          <option value="exact">Pesan harus sama persis</option>
          <option value="alias">Salah satu kata kunci</option>
          <option value="empty">Pesan pertama atau kosong</option>
          <option value="fallback">Jika tidak ada yang cocok</option>
        </select>
      </label>
      <label className="toggle-label">
        <input
          checked={rule.action === 'create_handoff'}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              action: event.target.checked ? 'create_handoff' : 'reply'
            })
          }
          type="checkbox"
        />
        Alihkan ke admin
      </label>
      <label className="toggle-label">
        <input
          checked={rule.enabled}
          disabled={disabled}
          type="checkbox"
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        Aktif
      </label>
    </div>
    {['exact', 'alias'].includes(rule.triggerType) ? (
      <label>
        Kata kunci
        <input
          disabled={disabled}
          placeholder="Pisahkan beberapa kata kunci dengan koma"
          value={rule.triggerValues.join(', ')}
          onChange={(event) =>
            onChange({ triggerValues: parseTriggerEditorValue(event.target.value) })
          }
        />
      </label>
    ) : (
      <p className="tool-hint">
        Jenis jawaban ini tidak memerlukan kata kunci.
      </p>
    )}
    <label>
      Jawaban
      <textarea
        disabled={disabled}
        maxLength={4096}
        rows={5}
        value={rule.responseText}
        onChange={(event) => onChange({ responseText: event.target.value })}
      />
    </label>
  </article>
);
