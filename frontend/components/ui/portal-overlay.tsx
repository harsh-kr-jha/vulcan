"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface PortalOverlayProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  backdropClassName?: string;
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
  lockScroll?: boolean;
  ariaLabel?: string;
  role?: "dialog" | "alertdialog";
}

/**
 * Universal Portal Overlay Component
 * Strictly complies with Newdesign.md Section 6.3:
 * - DOM Portaling: Mounts directly to document.body
 * - Dynamic Scroll Locking: Injects overflow: hidden on document.body to prevent background jitter
 * - Accessible keyboard (Escape) and backdrop dismiss
 */
export function PortalOverlay({
  isOpen,
  onClose,
  children,
  backdropClassName = "modal-backdrop",
  closeOnEscape = true,
  closeOnBackdropClick = true,
  lockScroll = true,
  ariaLabel,
  role = "dialog",
}: PortalOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Dynamic Scroll Locking on document.body
  useEffect(() => {
    if (!isOpen || !lockScroll) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, lockScroll]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className={backdropClassName}
      role="presentation"
      onClick={closeOnBackdropClick ? onClose : undefined}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
      }}
    >
      <div
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        style={{ display: "contents" }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
