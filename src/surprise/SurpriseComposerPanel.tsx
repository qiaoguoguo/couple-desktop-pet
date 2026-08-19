import {
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type {
  SurpriseMessageContent,
  SurpriseTheme,
} from "../../shared/syncProtocol";
import {
  buildSurpriseFallbackText,
  getSurpriseThemeCopy,
  SURPRISE_THEME_ORDER,
} from "./surpriseThemes";

export interface SurpriseComposerPanelResult {
  ok: boolean;
  message?: string;
}

interface SurpriseComposerPanelProps {
  onSubmit(
    content: SurpriseMessageContent,
    fallbackText: string,
  ): SurpriseComposerPanelResult | Promise<SurpriseComposerPanelResult>;
  onClose(): void;
}

interface SurpriseComposerErrors {
  secret?: string;
  note?: string;
}

const secretPattern = /^[A-Za-z0-9-]+$/;

export function SurpriseComposerPanel({
  onSubmit,
  onClose,
}: SurpriseComposerPanelProps) {
  const [theme, setTheme] = useState<SurpriseTheme>("general");
  const [secret, setSecret] = useState("");
  const [note, setNote] = useState(getSurpriseThemeCopy("general").defaultNote);
  const [errors, setErrors] = useState<SurpriseComposerErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const secretRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  function selectTheme(nextTheme: SurpriseTheme) {
    setTheme(nextTheme);
    setNote(getSurpriseThemeCopy(nextTheme).defaultNote);
    setErrors({});
    setStatus(null);
  }

  async function submit() {
    if (sending) {
      return;
    }

    const trimmedSecret = secret.trim();
    const trimmedNote = note.trim();
    const validation = validateFields(trimmedSecret, trimmedNote);
    setErrors(validation.errors);
    setStatus(null);

    if (!validation.ok) {
      focusFirstInvalidField(validation.errors, secretRef, noteRef);
      return;
    }

    const content: SurpriseMessageContent = {
      kind: "surprise",
      version: 1,
      theme,
      secret: trimmedSecret,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };
    const fallbackText = buildSurpriseFallbackText(content);

    setSending(true);

    try {
      const result = await onSubmit(content, fallbackText);

      if (result.ok) {
        onClose();
        return;
      }

      setStatus(result.message ?? "发送失败，请稍后重试");
      setSending(false);
    } catch {
      setStatus("发送失败，请稍后重试");
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (sending) {
        return;
      }

      onClose();
    }
  }

  return (
    <section
      className="composer-panel surprise-composer-panel"
      aria-label="送一份小心意"
      onKeyDown={handleKeyDown}
    >
      <div
        className="composer-card-shell surprise-composer-card"
        data-desktop-interactive-region=""
      >
        <header className="composer-card-header surprise-composer-header">
          <p className="composer-eyebrow">小心意</p>
          <h1 className="composer-title">送一份小心意</h1>
        </header>

        <fieldset className="surprise-composer-themes">
          <legend>这次想说</legend>
          <div className="surprise-composer-theme-list">
            {SURPRISE_THEME_ORDER.map((themeId) => {
              const copy = getSurpriseThemeCopy(themeId);

              return (
                <button
                  key={themeId}
                  type="button"
                  className="composer-choice"
                  aria-pressed={theme === themeId}
                  disabled={sending}
                  onClick={() => selectTheme(themeId)}
                >
                  {copy.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="surprise-composer-field">
          <span>惊喜暗号</span>
          <input
            className="composer-field-control"
            ref={secretRef}
            value={secret}
            disabled={sending}
            aria-invalid={errors.secret ? "true" : undefined}
            aria-describedby={errors.secret ? "surprise-secret-error" : undefined}
            onChange={(event) => setSecret(event.currentTarget.value)}
            autoFocus
          />
          {errors.secret ? (
            <span id="surprise-secret-error" className="surprise-composer-error">
              {errors.secret}
            </span>
          ) : null}
        </label>

        <label className="surprise-composer-field">
          <span>想对 TA 说</span>
          <textarea
            className="composer-field-control"
            ref={noteRef}
            value={note}
            disabled={sending}
            rows={4}
            aria-invalid={errors.note ? "true" : undefined}
            aria-describedby={errors.note ? "surprise-note-error" : undefined}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
          {errors.note ? (
            <span id="surprise-note-error" className="surprise-composer-error">
              {errors.note}
            </span>
          ) : null}
        </label>

        <div className="composer-footer surprise-composer-footer">
          <span className="composer-meta">{Array.from(note).length}/120</span>
          <div className="composer-actions surprise-composer-actions">
            <button
              type="button"
              className="composer-action composer-action--secondary"
              disabled={sending}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="composer-action composer-action--primary"
              disabled={sending}
              onClick={() => void submit()}
            >
              送出这份心意
            </button>
          </div>
        </div>

        {status ? (
          <p className="composer-status surprise-composer-status">{status}</p>
        ) : null}
      </div>
    </section>
  );
}

function validateFields(
  secret: string,
  note: string,
): { ok: true; errors: SurpriseComposerErrors } | { ok: false; errors: SurpriseComposerErrors } {
  const errors: SurpriseComposerErrors = {};
  const secretLength = Array.from(secret).length;
  const noteLength = Array.from(note).length;

  if (secretLength === 0) {
    errors.secret = "先填一个惊喜暗号";
  } else if (secretLength > 24) {
    errors.secret = "暗号最多 24 个字符";
  } else if (!secretPattern.test(secret)) {
    errors.secret = "暗号只能使用英文字母、数字或短横线";
  }

  if (noteLength > 120) {
    errors.note = "留言最多 120 个字符";
  }

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, errors };
}

function focusFirstInvalidField(
  errors: SurpriseComposerErrors,
  secretRef: RefObject<HTMLInputElement | null>,
  noteRef: RefObject<HTMLTextAreaElement | null>,
) {
  if (errors.secret) {
    secretRef.current?.focus();
    return;
  }

  if (errors.note) {
    noteRef.current?.focus();
  }
}
