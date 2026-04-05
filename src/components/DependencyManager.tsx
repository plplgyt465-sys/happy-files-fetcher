import { useState } from 'react';
import { Package, Plus, X, ExternalLink } from 'lucide-react';

export interface Dependency {
  name: string;
  version: string;
  cdnUrl: string;
}

interface DependencyManagerProps {
  dependencies: Dependency[];
  onAddDependency: (name: string, version?: string) => void;
  onRemoveDependency: (name: string) => void;
}

const DependencyManager = ({ dependencies, onAddDependency, onRemoveDependency }: DependencyManagerProps) => {
  const [showAdd, setShowAdd] = useState(false);
  const [packageName, setPackageName] = useState('');

  const handleAdd = () => {
    if (!packageName.trim()) return;
    const [name, version] = packageName.trim().split('@');
    onAddDependency(name, version || 'latest');
    setPackageName('');
    setShowAdd(false);
  };

  return (
    <div className="flex flex-col border-t border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Dependencies
          </span>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="p-1 text-muted-foreground hover:text-primary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {showAdd && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-secondary/50">
          <input
            autoFocus
            type="text"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') setShowAdd(false);
            }}
            placeholder="package@version"
            className="flex-1 bg-secondary text-xs text-foreground px-2 py-1 rounded outline-none font-mono placeholder:text-muted-foreground"
          />
        </div>
      )}

      <div className="overflow-y-auto max-h-32 px-1">
        {dependencies.map((dep) => (
          <div key={dep.name} className="group flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-sm hover:bg-secondary/30">
            <Package className="w-3 h-3 text-[hsl(var(--success))]" />
            <span className="font-mono truncate">{dep.name}</span>
            <span className="text-[10px] text-muted-foreground">@{dep.version}</span>
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100">
              <a href={dep.cdnUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={() => onRemoveDependency(dep.name)} className="text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
        {dependencies.length === 0 && (
          <p className="text-[10px] text-muted-foreground px-2 py-1 italic">No CDN dependencies</p>
        )}
      </div>
    </div>
  );
};

export default DependencyManager;
