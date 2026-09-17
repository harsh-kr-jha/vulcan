"use client";

import React, { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

// ============================================================================
// 1. MetricNa (Zero Synthetic Data Badge - Section 1.1)
// ============================================================================
export function MetricNa({ label = "N/A", tooltip = "No verified data for this period" }: { label?: string; tooltip?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold tnum select-none"
      title={tooltip}
      style={{
        background: "var(--color-surface-track, #eee7dd)",
        color: "var(--color-text-muted, #6d7a71)",
        border: "1px solid var(--color-stone, #d8d2c8)",
        letterSpacing: "0.04em",
        minWidth: "2.2rem",
        height: "1.4rem",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label}
    </span>
  );
}

// ============================================================================
// 2. InteractiveChip (Tactile Filter Chip - Section 8.1)
// ============================================================================
export interface InteractiveChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

export function InteractiveChip({
  selected = false,
  icon,
  children,
  badge,
  className = "",
  style,
  ...props
}: InteractiveChipProps) {
  return (
    <button
      type="button"
      className={`touch-spring inline-flex items-center gap-2 cursor-pointer select-none transition-all ${className}`}
      style={{
        borderRadius: "var(--radius-chip, 14px)",
        padding: "8px 16px",
        minHeight: "44px",
        background: selected
          ? "linear-gradient(135deg, var(--color-primary, #00a06c) 0%, var(--color-primary-dark, #006a46) 100%)"
          : "var(--color-surface-card, #ffffff)",
        color: selected ? "#ffffff" : "var(--color-text-primary, #1e1b15)",
        border: selected
          ? "1px solid var(--color-primary-dark, #006a46)"
          : "1px solid rgba(0, 160, 108, 0.18)",
        boxShadow: selected
          ? "0 4px 12px rgba(0, 160, 108, 0.25)"
          : "var(--shadow-resting-card)",
        fontSize: "0.875rem",
        fontWeight: selected ? 650 : 500,
        ...style,
      }}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
      {badge && <span className="shrink-0">{badge}</span>}
    </button>
  );
}

// ============================================================================
// 3. ViewSwitcher (Segmented Pill Switcher - Section 8.3)
// ============================================================================
export interface ViewSwitcherOption<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface ViewSwitcherProps<T extends string = string> {
  options: Array<ViewSwitcherOption<T>>;
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
}

export function ViewSwitcher<T extends string = string>({
  options,
  activeId,
  onChange,
  ariaLabel = "View switcher",
  className = "",
}: ViewSwitcherProps<T>) {
  return (
    <nav
      className={`inline-flex items-center gap-1 select-none p-1 ${className}`}
      aria-label={ariaLabel}
      style={{
        background: "var(--color-surface-track, #eee7dd)",
        borderRadius: "var(--radius-pill, 9999px)",
        border: "1px solid var(--color-stone, #d8d2c8)",
        minHeight: "44px",
      }}
    >
      {options.map((opt) => {
        const isActive = opt.id === activeId;
        return (
          <button
            key={opt.id}
            type="button"
            className="touch-spring inline-flex items-center justify-center gap-1.5 px-4 py-1.5 cursor-pointer font-medium text-xs sm:text-sm transition-all"
            style={{
              borderRadius: "var(--radius-pill, 9999px)",
              minHeight: "36px",
              background: isActive ? "var(--color-surface-card, #ffffff)" : "transparent",
              color: isActive ? "var(--color-text-primary, #1e1b15)" : "var(--color-text-secondary, #3d4a42)",
              fontWeight: isActive ? 700 : 500,
              boxShadow: isActive ? "0 2px 8px rgba(18, 26, 20, 0.08)" : "none",
              border: isActive ? "1px solid rgba(0, 160, 108, 0.12)" : "1px solid transparent",
            }}
            onClick={() => onChange(opt.id)}
            aria-selected={isActive}
            role="tab"
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className="tnum text-xs px-1.5 py-0.2 rounded-full font-bold ml-1"
                style={{
                  background: isActive ? "var(--color-surface-track, #eee7dd)" : "rgba(0,0,0,0.06)",
                  color: "var(--color-text-secondary, #3d4a42)",
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ============================================================================
// 4. InfoBadge (Contextual Explainer Tooltip - Section 8.6)
// ============================================================================
export interface InfoBadgeProps {
  title: string;
  description: string;
  formula?: string;
  align?: "left" | "center" | "right";
}

export function InfoBadge({ title, description, formula, align = "center" }: InfoBadgeProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popoverWidth = 280;
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    if (align === "left") left = rect.left;
    if (align === "right") left = rect.right - popoverWidth;

    // Viewport collision avoidance
    const padding = 12;
    if (left < padding) left = padding;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - padding - popoverWidth;
    }

    setCoords({
      top: rect.bottom + 6,
      left,
    });
  }, [open, align]);

  // Click outside listener
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", handleClickOutside);
    return () => window.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

  return (
    <span ref={containerRef} className="inline-flex items-center relative">
      <button
        type="button"
        className="touch-spring inline-flex items-center justify-center cursor-pointer transition-colors p-1"
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          color: open ? "var(--color-primary-dark, #006a46)" : "var(--color-text-muted, #6d7a71)",
          background: open ? "var(--color-primary-tint, rgba(0, 160, 108, 0.12))" : "transparent",
        }}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Explainer: ${title}`}
        aria-expanded={open}
      >
        <Info size={14} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="fixed z-50 p-3 bg-white border border-stone-300 rounded-xl shadow-xl text-left select-text animate-in fade-in zoom-in-95 duration-150"
          style={{
            top: coords.top,
            left: coords.left,
            width: "280px",
            boxShadow: "var(--shadow-elevated-hover)",
            borderColor: "var(--color-stone, #d8d2c8)",
          }}
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 mb-1.5">
            <h4 className="text-xs font-bold text-stone-900 m-0">{title}</h4>
          </div>
          <p className="text-xs text-stone-600 m-0 leading-relaxed">{description}</p>
          {formula && (
            <div className="mt-2 p-1.5 bg-stone-50 rounded border border-stone-200">
              <span className="text-[12px] font-semibold text-stone-500 uppercase tracking-wide block mb-0.5">
                Formula
              </span>
              <code className="text-xs font-mono text-emerald-800 break-words">{formula}</code>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// ============================================================================
// 5. InteractiveCard (Entity Card - Section 8.2)
// ============================================================================
export interface InteractiveCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  elevation?: 1 | 2 | 3;
}

export function InteractiveCard({
  children,
  className = "",
  elevation = 1,
  style,
  ...props
}: InteractiveCardProps) {
  const shadow =
    elevation === 3
      ? "var(--shadow-floating-dock)"
      : elevation === 2
      ? "var(--shadow-elevated-hover)"
      : "var(--shadow-resting-card)";

  return (
    <article
      className={`interactive-card p-5 bg-white border transition-all ${className}`}
      style={{
        borderRadius: "var(--radius-card, 20px)",
        borderColor: "var(--color-stone, #d8d2c8)",
        boxShadow: shadow,
        ...style,
      }}
      {...props}
    >
      {children}
    </article>
  );
}
