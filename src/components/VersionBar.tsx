import { Undo2, Redo2, History, Clock } from 'lucide-react';
import type { ProjectSnapshot } from '@/hooks/useVersionControl';

interface VersionBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  history: ProjectSnapshot[];
  currentIndex: number;
}

const VersionBar = ({ canUndo, canRedo, onUndo, onRedo, history, currentIndex }: VersionBarProps) => {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-card text-xs">
      <History className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">v{currentIndex + 1}/{history.length}</span>

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="w-3 h-3" />
        <span className="hidden sm:inline">Undo</span>
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 className="w-3 h-3" />
        <span className="hidden sm:inline">Redo</span>
      </button>

      {history.length > 1 && (
        <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{history[currentIndex]?.label}</span>
        </div>
      )}
    </div>
  );
};

export default VersionBar;
