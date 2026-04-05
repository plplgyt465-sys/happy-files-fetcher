import React, { useCallback } from 'react';

interface CodeEditorProps {
  content: string;
  language: string;
  onChange: (content: string) => void;
  errorLine?: number | null;
}

const CodeEditor = ({ content, onChange, errorLine }: CodeEditorProps) => {
  const lines = content.split('\n');

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const newValue = content.substring(0, start) + '  ' + content.substring(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          target.selectionStart = target.selectionEnd = start + 2;
        });
      }
    },
    [content, onChange]
  );

  return (
    <div className="relative flex h-full bg-[hsl(var(--editor-bg))] font-mono text-sm overflow-hidden">
      {/* Line numbers */}
      <div className="flex flex-col items-end py-4 px-3 select-none bg-[hsl(var(--editor-bg))] border-r border-border min-w-[3rem]">
        {lines.map((_, i) => (
          <span
            key={i}
            className={`text-xs leading-6 h-6 ${
              errorLine === i + 1
                ? 'text-destructive font-bold bg-destructive/10 px-1 rounded'
                : 'line-number'
            }`}
          >
            {i + 1}
          </span>
        ))}
      </div>

      {/* Error highlight overlay */}
      {errorLine && errorLine <= lines.length && (
        <div
          className="absolute left-12 right-0 h-6 bg-destructive/10 border-l-2 border-destructive pointer-events-none"
          style={{ top: `${(errorLine - 1) * 24 + 16}px` }}
        />
      )}

      {/* Textarea */}
      <textarea
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="flex-1 bg-transparent text-foreground resize-none outline-none py-4 px-4 leading-6 font-mono text-sm whitespace-pre overflow-auto"
        style={{ tabSize: 2 }}
      />
    </div>
  );
};

export default CodeEditor;
