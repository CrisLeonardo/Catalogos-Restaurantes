"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useThemeConfig } from "@/lib/theme/context";

type GlassVariant = "default" | "quiet" | "solid";

interface GlassProps {
  variant?: GlassVariant;
  /** Fuerza el sheen on/off. Sin prop, obedece config.sheen del tema
      (en superficies de plataforma sin tema queda activo por defecto). */
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
  sheen,
  interactive = false,
  className = "",
  style,
  children,
  onClick,
}: GlassProps) {
  const ref = useRef<HTMLDivElement>(null);
  const config = useThemeConfig();
  // El toggle "Brillo que sigue al cursor" del editor vive en config.sheen;
  // antes nadie lo leía y la opción no tenía efecto real.
  const sheenOn = sheen ?? config.sheen ?? true;
  const cls = variant === "quiet" ? "glass-quiet" : variant === "solid" ? "glass-solid" : "glass";

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sheenOn || variant !== "default" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    ref.current.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  // a11y: un panel clicable se comporta como botón también con teclado.
  const clickable = Boolean(onClick);
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      ref={ref}
      className={`${cls} ${interactive ? "press" : ""} ${className}`}
      onMouseMove={handleMove}
      onClick={onClick}
      onKeyDown={clickable ? handleKey : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={style}
    >
      {children}
    </div>
  );
}
