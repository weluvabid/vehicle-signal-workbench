'use client';

import { useEffect } from 'react';
import { CHART_INTENTS } from '@/intents/chart-intents';

interface WorkspaceShortcutOptions {
  readonly onHelp: () => void;
  readonly onNewWorkload: () => void;
}

/** Registers application-level shortcuts while leaving editable controls untouched. */
export function useWorkspaceShortcuts({ onHelp, onNewWorkload }: WorkspaceShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.shiftKey && event.key !== '+'))
        return;

      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [role="textbox"], [contenteditable="true"], [role="dialog"]',
          ))
      )
        return;

      if (event.key === '?') {
        event.preventDefault();
        onHelp();
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        onNewWorkload();
      } else if (event.key === '0') {
        event.preventDefault();
        window.dispatchEvent(new Event(CHART_INTENTS.RESET_ZOOM));
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        window.dispatchEvent(new Event(CHART_INTENTS.ZOOM_IN));
      } else if (event.key === '-') {
        event.preventDefault();
        window.dispatchEvent(new Event(CHART_INTENTS.ZOOM_OUT));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onHelp, onNewWorkload]);
}
