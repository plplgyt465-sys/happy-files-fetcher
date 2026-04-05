import { useState } from 'react';
import { Terminal, AlertTriangle, AlertCircle, Info, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { Diagnostic } from '@/hooks/useStaticAnalysis';
import type { ErrorDetails } from '@/components/LivePreview';

interface ConsolePanelProps {
  diagnostics: Diagnostic[];
  runtimeErrors: ErrorDetails[];
  onGoToError?: (file: string, line: number) => void;
}

const severityIcon = {
  error: <AlertCircle className="w-3.5 h-3.5 text-destructive" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-warning" />,
  info: <Info className="w-3.5 h-3.5 text-primary" />,
};

const ConsolePanel = ({ diagnostics, runtimeErrors, onGoToError }: ConsolePanelProps) => {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const filtered = filter === 'all' ? diagnostics : diagnostics.filter(d => d.severity === filter);
  const errorCount = diagnostics.filter(d => d.severity === 'error').length + runtimeErrors.length;
  const warnCount = diagnostics.filter(d => d.severity === 'warning').length;

  return (
    <div className="flex flex-col border-t border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Terminal className="w-3.5 h-3.5 text-primary" />
          <span>Problems</span>
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>

        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-destructive">
            <AlertCircle className="w-3 h-3" /> {errorCount}
          </span>
        )}
        {warnCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-warning">
            <AlertTriangle className="w-3 h-3" /> {warnCount}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {(['all', 'error', 'warning', 'info'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                filter === f ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="overflow-y-auto max-h-40 font-mono text-xs">
          {/* Runtime errors */}
          {(filter === 'all' || filter === 'error') && runtimeErrors.map((err, i) => (
            <div
              key={`rt-${i}`}
              onClick={() => err.file && err.line && onGoToError?.(err.file, err.line)}
              className="flex items-start gap-2 px-3 py-1.5 hover:bg-secondary/30 cursor-pointer border-b border-border/30"
            >
              <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-destructive">[Runtime] </span>
                <span className="text-foreground">{err.message}</span>
                {err.file && (
                  <span className="ml-2 text-muted-foreground">
                    {err.file}{err.line ? `:${err.line}` : ''}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Static diagnostics */}
          {filtered.map((d, i) => (
            <div
              key={`diag-${i}`}
              onClick={() => onGoToError?.(d.file, d.line)}
              className="flex items-start gap-2 px-3 py-1.5 hover:bg-secondary/30 cursor-pointer border-b border-border/30"
            >
              {severityIcon[d.severity]}
              <div className="flex-1 min-w-0">
                <span className="text-foreground">{d.message}</span>
                <span className="ml-2 text-muted-foreground">
                  {d.file}:{d.line}:{d.column}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{d.type}</span>
            </div>
          ))}

          {filtered.length === 0 && runtimeErrors.length === 0 && (
            <div className="px-3 py-3 text-muted-foreground text-center">
              No problems detected ✓
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConsolePanel;
