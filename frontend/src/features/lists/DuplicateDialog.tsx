import { useState, type FormEvent } from 'react';
import type { DuplicateListInput } from '@bwinkeler-lists/shared';

interface DuplicateDialogProps {
  defaultName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (options: DuplicateListInput) => void;
}

export function DuplicateDialog({
  defaultName,
  pending,
  onCancel,
  onConfirm,
}: DuplicateDialogProps) {
  const [name, setName] = useState(`${defaultName} (copy)`);
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [resetCompleted, setResetCompleted] = useState(false);

  function submit(event: FormEvent): void {
    event.preventDefault();
    onConfirm({
      name: name.trim() || undefined,
      includeCompleted,
      resetCompleted: includeCompleted ? resetCompleted : false,
    });
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Duplicate list"
      onClick={onCancel}
    >
      <form className="modal" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <h2>Duplicate list</h2>
        <div className="field">
          <label htmlFor="dup-name">New list name</label>
          <input id="dup-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <label className="check-row">
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(event) => setIncludeCompleted(event.target.checked)}
          />
          <span className="check-row__text">
            <strong>Include completed items</strong>
            <span className="subtle">Uncheck to copy only the items that aren’t done yet.</span>
          </span>
        </label>

        <label className="check-row" style={{ opacity: includeCompleted ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={resetCompleted}
            disabled={!includeCompleted}
            onChange={(event) => setResetCompleted(event.target.checked)}
          />
          <span className="check-row__text">
            <strong>Reset copied items to not done</strong>
            <span className="subtle">Bring everything over as unchecked.</span>
          </span>
        </label>

        <div className="modal__actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={pending}>
            {pending ? 'Duplicating…' : 'Duplicate'}
          </button>
        </div>
      </form>
    </div>
  );
}
