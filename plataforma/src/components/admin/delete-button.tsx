'use client';

import { useConfirm } from '@/components/ui/confirm-dialog';

interface DeleteButtonProps {
  action: (formData: FormData) => void;
  hiddenFields: Record<string, string>;
  label?: string;
  /** La pregunta (título del diálogo). */
  confirm?: string;
  /** Una línea debajo con la consecuencia. */
  description?: string;
}

export default function DeleteButton({
  action,
  hiddenFields,
  label = 'Eliminar',
  confirm: confirmMsg = '¿Eliminar?',
  description = 'No se puede deshacer.',
}: DeleteButtonProps) {
  const { confirmSubmit, dialog } = useConfirm();
  return (
    <>
    {dialog}
    <form
      action={action}
      onSubmit={confirmSubmit({ title: confirmMsg, description, confirmLabel: label })}
    >
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className="press"
        style={{
          background: 'var(--c-danger-bg)',
          border: '1px solid var(--c-danger-line)',
          color: 'var(--c-danger)',
          padding: '5px 12px',
          borderRadius: 'var(--radius-full)',
          fontSize: 12,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </button>
    </form>
    </>
  );
}
