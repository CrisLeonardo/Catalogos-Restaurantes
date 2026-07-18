'use client';

interface DeleteButtonProps {
  action: (formData: FormData) => void;
  hiddenFields: Record<string, string>;
  label?: string;
  confirm?: string;
}

export default function DeleteButton({
  action,
  hiddenFields,
  label = 'Eliminar',
  confirm: confirmMsg = '¿Eliminar? Esta acción no se puede deshacer.',
}: DeleteButtonProps) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMsg)) e.preventDefault();
      }}
    >
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className="press"
        style={{
          background: 'rgba(220,50,50,0.12)',
          border: '1px solid rgba(220,50,50,0.25)',
          color: 'var(--c-danger, #f87171)',
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
  );
}
