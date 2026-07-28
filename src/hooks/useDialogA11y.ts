'use client';

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseDialogA11yOptions {
  open: boolean;
  onClose: () => void;
  /** Set false for non-modal surfaces (a docked desktop panel, say). */
  modal?: boolean;
}

/**
 * The four behaviours a dialog needs to be usable without a mouse, in one place:
 * Escape closes it, Tab cycles inside it, focus returns to whatever opened it,
 * and the page behind it stops scrolling.
 *
 * Spread `dialogProps` on the dialog element and give it a heading referenced by
 * `labelledBy`:
 *
 *   const { dialogProps } = useDialogA11y({ open, onClose });
 *   <div {...dialogProps} aria-labelledby="mi-titulo"> <h3 id="mi-titulo">…</h3>
 */
export function useDialogA11y({ open, onClose, modal = true }: UseDialogA11yOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Remember the opener so focus can go home when the dialog closes.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Move focus in — otherwise the first Tab lands behind the dialog.
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus?.();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // Escape closes, Tab is trapped.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !modal) return;
      const node = ref.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose, modal]);

  // Stop the page behind from scrolling under the dialog.
  useEffect(() => {
    if (!open || !modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, modal]);

  return {
    dialogProps: {
      ref,
      role: 'dialog' as const,
      'aria-modal': modal,
      tabIndex: -1,
    },
  };
}

/**
 * Escape + outside-click for lightweight popovers (device menus, emoji picker).
 * Closing only on `mousedown` left them unreachable from the keyboard.
 */
export function usePopoverA11y(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  const handler = useCallback(
    (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, handler, onClose]);

  return ref;
}
