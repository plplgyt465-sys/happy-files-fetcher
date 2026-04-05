import { useState, useCallback } from 'react';
import type { CodeFile } from './useCodeStore';

export interface ProjectSnapshot {
  id: string;
  timestamp: Date;
  label: string;
  files: CodeFile[];
}

export function useVersionControl(initialFiles: CodeFile[]) {
  const [history, setHistory] = useState<ProjectSnapshot[]>([
    {
      id: '0',
      timestamp: new Date(),
      label: 'Initial',
      files: initialFiles.map(f => ({ ...f })),
    },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const pushSnapshot = useCallback((files: CodeFile[], label: string) => {
    setHistory(prev => {
      // Trim future history if we're not at the end
      const trimmed = prev.slice(0, currentIndex + 1);
      const snap: ProjectSnapshot = {
        id: Date.now().toString(),
        timestamp: new Date(),
        label,
        files: files.map(f => ({ ...f })),
      };
      return [...trimmed, snap];
    });
    setCurrentIndex(prev => prev + 1);
  }, [currentIndex]);

  const undo = useCallback((): CodeFile[] | null => {
    if (currentIndex <= 0) return null;
    const newIdx = currentIndex - 1;
    setCurrentIndex(newIdx);
    return history[newIdx].files.map(f => ({ ...f }));
  }, [currentIndex, history]);

  const redo = useCallback((): CodeFile[] | null => {
    if (currentIndex >= history.length - 1) return null;
    const newIdx = currentIndex + 1;
    setCurrentIndex(newIdx);
    return history[newIdx].files.map(f => ({ ...f }));
  }, [currentIndex, history]);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  return { history, currentIndex, pushSnapshot, undo, redo, canUndo, canRedo };
}
