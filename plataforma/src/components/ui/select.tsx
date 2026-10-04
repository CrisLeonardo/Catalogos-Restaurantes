'use client';

import * as React from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/icons';

/**
 * Select accesible (Base UI) — reemplaza el <select> nativo cuyo popup de
 * <option> ignora `color-scheme` en Chrome/Windows (bug documentado: el
 * listado salía siempre blanco/negro fijo sin importar el tema del panel).
 * Aquí el popup es un <div> propio: hereda los tokens del tema sin ese bug.
 */
export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  /** Nombre accesible cuando no hay un <label> visible al lado. */
  'aria-label'?: string;
}

function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Selecciona…',
  disabled,
  className,
  name,
  'aria-label': ariaLabel,
}: SelectProps) {
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(v as string)}
      disabled={disabled}
      name={name}
    >
      <BaseSelect.Trigger
        data-slot="select-trigger"
        aria-label={ariaLabel}
        className={cn(
          // Se ve como los demás campos (`.adm-field`, T-26): antes era una
          // ficha blanca con borde junto a campos con relleno gris.
          'adm-field flex items-center justify-between gap-2 text-left cursor-pointer',
          'disabled:pointer-events-none',
          className
        )}
      >
        <BaseSelect.Value className="truncate text-left">
          {(v: string | null) => options.find((o) => o.value === v)?.label ?? placeholder}
        </BaseSelect.Value>
        <BaseSelect.Icon className="text-adm-text-3">
          <Icon name="chevronDown" size={15} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={6} className="z-[500] outline-none">
          <BaseSelect.Popup
            className={cn(
              'max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-adm-lg border border-adm-border-2 bg-adm-overlay p-1 shadow-adm-lg outline-none',
              'origin-[var(--transform-origin)] transition-[transform,opacity] data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0'
            )}
          >
            {options.map((opt) => (
              <BaseSelect.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-adm-md px-3 py-2 text-[13px] text-adm-text outline-none scroll-my-1',
                  'data-[highlighted]:bg-adm-accent-500/12 data-[highlighted]:text-adm-accent-ink',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40'
                )}
              >
                <BaseSelect.ItemText>{opt.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="text-adm-accent-ink">
                  <Icon name="check" size={14} />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export { Select };
