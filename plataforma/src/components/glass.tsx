"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

type GlassVariant = "default" | "quiet" | "solid";

interface GlassProps {
  variant?: GlassVariant;
  sheen?: boolean;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: () => void;
}

/**
 * Panel liquid-glass con sheen especular que sigue al puntero.
 * Portado de Glass.jsx del prototipo. El brillo se mueve via --mx/--my.
 */
export function Glass({
  variant = "default",
  sheen = true,
  interactive = false,
  className = "",
  style,
  children,
  onClick,
}: GlassProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cls = variant === "quiet" ? "glass-quiet" : variant === "solid" ? "glass-solid" : "glass";

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sheen || variant !== "default" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    ref.current.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <div
      ref={ref}
      className={`${cls} ${interactive ? "press" : ""} ${className}`}
      onMouseMove={handleMove}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}

/** Precio con símbolo de moneda compacto (Q por defecto). */
export function Price({
  amount,
  symbol = "Q",
  size = 16,
}: {
  amount: number;
  symbol?: string;
  size?: number;
}) {
  return (
    <span className="t-mono" style={{ fontSize: size, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ fontSize: size * 0.66, opacity: 0.6, marginRight: 2 }}>{symbol}</span>
      {amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

/** Pill / etiqueta sobre glass. */
export function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.10)",
        border: "1px solid var(--u-hair-2)",
        color: "var(--u-text)",
        fontWeight: 600,
        fontSize: 10.5,
        letterSpacing: "0.02em",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {label}
    </span>
  );
}
