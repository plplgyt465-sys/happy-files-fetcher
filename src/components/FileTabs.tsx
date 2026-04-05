import { useState } from 'react';
import { X, Plus, FileCode, FileText, FileJson } from 'lucide-react';
import type { CodeFile } from '@/hooks/useCodeStore';

interface FileTabsProps {
  files: CodeFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onAddFile: (name: string, language: string) => void;
  onDeleteFile: (id: string) => void;
}

const getFileIcon = (name: string) => {
  if (name.endsWith('.html')) return <FileCode className="w-3.5 h-3.5 text-[hsl(0,70%,65%)]" />;
  if (name.endsWith('.css')) return <FileText className="w-3.5 h-3.5 text-primary" />;
  if (name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.jsx')) return <FileCode className="w-3.5 h-3.5 text-warning" />;
  if (name.endsWith('.json')) return <FileJson className="w-3.5 h-3.5 text-success" />;
  return <FileText className="w-3.5 h-3.5" />;
};

const FileTabs = ({ files, activeFileId, onSelectFile, onAddFile, onDeleteFile }: FileTabsProps) => {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    const ext = newName.split('.').pop() || 'txt';
    const langMap: Record<string, string> = {
      html: 'html', css: 'css', js: 'javascript', ts: 'typescript',
      json: 'json', jsx: 'javascript', tsx: 'typescript',
    };
    onAddFile(newName.trim(), langMap[ext] || 'text');
    setNewName('');
    setShowNew(false);
  };

  return (
    <div className="flex items-stretch bg-secondary/50 border-b border-border overflow-x-auto">
      <div className="flex items-stretch">
        {files.map((file) => (
          <button
            key={file.id}
            onClick={() => onSelectFile(file.id)}
            className={`group flex items-center gap-1.5 px-3 py-2 text-xs border-r border-border transition-colors ${
              file.id === activeFileId
                ? 'bg-card text-foreground border-t-2 border-t-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            {getFileIcon(file.name)}
            <span className="font-mono">{file.name}</span>
            {files.length > 1 && (
              <X
                className="w-3 h-3 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center px-1">
        {showNew ? (
          <div className="flex items-center gap-1 px-1">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setShowNew(false);
              }}
              onBlur={() => { if (!newName.trim()) setShowNew(false); }}
              placeholder="filename.ext"
              className="w-28 bg-secondary text-xs text-foreground px-2 py-1 rounded outline-none font-mono placeholder:text-muted-foreground"
            />
          </div>
        ) : (
          <button
            onClick={() => setShowNew(true)}
            className="p-2 text-muted-foreground hover:text-primary transition-colors"
            title="New file"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default FileTabs;
