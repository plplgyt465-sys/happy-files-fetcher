import { useState } from 'react';
import {
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type { CodeFile } from '@/hooks/useCodeStore';

interface FileExplorerProps {
  files: CodeFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onAddFile: (name: string, language: string) => void;
  onDeleteFile: (id: string) => void;
  onRenameFile?: (id: string, newName: string) => void;
}

const getFileIcon = (name: string) => {
  if (/\.(tsx|jsx)$/.test(name)) return <FileCode className="w-3.5 h-3.5 text-warning" />;
  if (/\.(ts|js)$/.test(name)) return <FileCode className="w-3.5 h-3.5 text-[hsl(38,90%,55%)]" />;
  if (name.endsWith('.css')) return <FileText className="w-3.5 h-3.5 text-primary" />;
  if (name.endsWith('.json')) return <FileJson className="w-3.5 h-3.5 text-[hsl(var(--success))]" />;
  if (name.endsWith('.html')) return <FileCode className="w-3.5 h-3.5 text-destructive" />;
  return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
};

const langMap: Record<string, string> = {
  html: 'html', css: 'css', js: 'javascript', ts: 'typescript',
  json: 'json', jsx: 'javascript', tsx: 'typescript', md: 'markdown',
};

const FileExplorer = ({
  files,
  activeFileId,
  onSelectFile,
  onAddFile,
  onDeleteFile,
  onRenameFile,
}: FileExplorerProps) => {
  const [expanded, setExpanded] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    const ext = newName.split('.').pop() || 'txt';
    onAddFile(newName.trim(), langMap[ext] || 'plaintext');
    setNewName('');
    setShowNew(false);
  };

  const handleRename = (id: string) => {
    if (renameValue.trim() && onRenameFile) {
      onRenameFile(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col h-full bg-card text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <button
          onClick={() => setShowNew(true)}
          className="p-1 text-muted-foreground hover:text-primary transition-colors"
          title="New file"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New file input */}
      {showNew && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-secondary/50">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setShowNew(false);
            }}
            placeholder="filename.ext"
            className="flex-1 bg-secondary text-xs text-foreground px-2 py-1 rounded outline-none font-mono placeholder:text-muted-foreground"
          />
          <button onClick={handleCreate} className="text-[hsl(var(--success))]"><Check className="w-3 h-3" /></button>
          <button onClick={() => setShowNew(false)} className="text-destructive"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Project folder */}
      <div className="flex-1 overflow-y-auto py-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <FolderOpen className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium">project</span>
          <span className="ml-auto text-[10px]">{files.length}</span>
        </button>

        {expanded && (
          <div className="ml-3">
            {files.map((file) => (
              <div key={file.id} className="group flex items-center">
                {renamingId === file.id ? (
                  <div className="flex items-center gap-1 w-full px-2 py-0.5">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(file.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="flex-1 bg-secondary text-xs text-foreground px-1 py-0.5 rounded outline-none font-mono"
                    />
                    <button onClick={() => handleRename(file.id)} className="text-[hsl(var(--success))]"><Check className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectFile(file.id)}
                    className={`flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded-sm transition-colors ${
                      file.id === activeFileId
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    {getFileIcon(file.name)}
                    <span className="font-mono truncate">{file.name}</span>
                    <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onRenameFile && (
                        <Edit2
                          className="w-3 h-3 text-muted-foreground hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(file.id);
                            setRenameValue(file.name);
                          }}
                        />
                      )}
                      {files.length > 1 && (
                        <Trash2
                          className="w-3 h-3 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFile(file.id);
                          }}
                        />
                      )}
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File count */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground">
        {files.length} file{files.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
};

export default FileExplorer;
