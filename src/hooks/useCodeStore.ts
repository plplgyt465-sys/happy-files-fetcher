import { useState, useCallback, useEffect } from 'react';
import { useVersionControl } from './useVersionControl';
import type { Dependency } from '@/components/DependencyManager';

export interface CodeFile {
  id: string;
  name: string;
  language: string;
  content: string;
}

export interface FileOperation {
  filename: string;
  content: string;
  type: 'create' | 'update';
}

export interface AgentLog {
  agent: string;
  status: string;
  message: string;
  filesCreated?: string[];
}

export interface ToolCallResult {
  tool: string;
  success: boolean;
  result: unknown;
  duration?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  fileOps?: FileOperation[];
  agentLogs?: AgentLog[];
  toolResults?: ToolCallResult[];
  mode?: 'CREATE' | 'EDIT' | 'FIX';
}

const defaultAppTsx = `import React, { useState } from 'react';
import './App.css';

const App: React.FC = () => {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <h1>Hello, Vibe Coder! 🚀</h1>
      <p>Start editing to see live changes</p>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
};

export default App;`;

const defaultAppCss = `.app {
  text-align: center;
  padding: 2rem;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: #e2e8f0;
  font-family: 'Inter', sans-serif;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  background: linear-gradient(90deg, #22d3ee, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

p {
  color: #94a3b8;
  margin-bottom: 2rem;
}

button {
  padding: 0.75rem 2rem;
  background: #22d3ee;
  color: #0f172a;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  font-size: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(34, 211, 238, 0.3);
}`;

const defaultIndexTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);`;

const defaultFiles: CodeFile[] = [
  { id: '1', name: 'App.tsx', language: 'typescript', content: defaultAppTsx },
  { id: '2', name: 'App.css', language: 'css', content: defaultAppCss },
  { id: '3', name: 'index.tsx', language: 'typescript', content: defaultIndexTsx },
];

function getLanguageFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'html', css: 'css', js: 'javascript', ts: 'typescript',
    jsx: 'javascript', tsx: 'typescript', json: 'json', md: 'markdown', txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

function decodeEscapedCodeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\\!/g, '!')
    .replace(/\\#/g, '#')
    .replace(/\\_/g, '_')
    .replace(/\\\*/g, '*')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\</g, '<')
    .replace(/\\>/g, '>')
    .replace(/\\~/g, '~');
}

function parseFileOperations(reply: string): { text: string; fileOps: FileOperation[] } {
  const fileOps: FileOperation[] = [];
  const fileRegex = /\[FILE:([\w.\-/]+)\]\n([\s\S]*?)\n?\[\/FILE\]/g;
  let match;

  while ((match = fileRegex.exec(reply)) !== null) {
    fileOps.push({
      filename: match[1].trim(),
      content: decodeEscapedCodeContent(match[2]),
      type: 'create',
    });
  }

  const text = reply.replace(fileRegex, '').trim();
  return { text, fileOps };
}

function shouldUseMultiAgent(prompt: string): boolean {
  const multiAgentKeywords = [
    'create', 'build', 'make', 'أنشئ', 'اصنع', 'ابني',
    'website', 'app', 'application', 'موقع', 'تطبيق',
    'store', 'shop', 'متجر', 'landing', 'portfolio',
    'dashboard', 'لوحة', 'blog', 'مدونة',
    'e-commerce', 'ecommerce', 'todo', 'chat',
    'project', 'مشروع', 'page', 'صفحة',
  ];
  const lower = prompt.toLowerCase();
  const matchCount = multiAgentKeywords.filter(k => lower.includes(k)).length;
  return matchCount >= 2;
}

function detectAIMode(prompt: string): 'CREATE' | 'EDIT' | 'FIX' {
  const lower = prompt.toLowerCase();
  if (lower.includes('fix') || lower.includes('error') || lower.includes('bug') || lower.includes('auto-fix') || lower.includes('إصلاح') || lower.includes('خطأ')) return 'FIX';
  if (lower.includes('edit') || lower.includes('change') || lower.includes('modify') || lower.includes('update') || lower.includes('عدل') || lower.includes('غير')) return 'EDIT';
  return 'CREATE';
}

export type AIProvider = 'official' | 'unofficial';

export function useCodeStore() {
  const [files, setFiles] = useState<CodeFile[]>(defaultFiles);
  const [activeFileId, setActiveFileId] = useState(defaultFiles[0].id);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [multiAgentMode, setMultiAgentMode] = useState(true);
  const [aiProvider, setAiProvider] = useState<AIProvider>('unofficial');
  const [agentProgress, setAgentProgress] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<{ file: string; line: number } | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'ai',
      content: '👋 Welcome to **VibeCode**! Powered by **10 AI agents**, **44 tools** & **16 skills**!\n\n🛠️ **44 Tools**: FileRead, FileWrite, FileEdit, Grep, Glob, LSP, CodeComplexity, TaskCreate, AgentTool, TeamCreate, BashTool, MemoryStore, and more!\n\n⚡ **16 Skills**: Scaffold, ComponentGen, CodeReview, SecurityScan, SearchReplace, TestGen, and more!\n\nClick the 🔧 button in the toolbar to browse all tools & skills.\n\nTry: "Build an e-commerce store" or "Create a portfolio website"!',
      timestamp: new Date(),
    },
  ]);

  const versionControl = useVersionControl(defaultFiles);

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  const updateFileContent = useCallback((fileId: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, content } : f)));
  }, []);

  const addFile = useCallback((name: string, language: string) => {
    const newFile: CodeFile = {
      id: Date.now().toString(),
      name,
      language,
      content: '',
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
  }, []);

  const deleteFile = useCallback(
    (fileId: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== fileId);
        if (activeFileId === fileId && next.length > 0) {
          setActiveFileId(next[0].id);
        }
        return next;
      });
    },
    [activeFileId]
  );

  const renameFile = useCallback((fileId: string, newName: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, name: newName, language: getLanguageFromFilename(newName) }
          : f
      )
    );
  }, []);

  const addDependency = useCallback((name: string, version = 'latest') => {
    const cdnUrl = `https://esm.sh/${name}${version !== 'latest' ? '@' + version : ''}`;
    setDependencies((prev) => {
      if (prev.some((d) => d.name === name)) return prev;
      return [...prev, { name, version, cdnUrl }];
    });
  }, []);

  const removeDependency = useCallback((name: string) => {
    setDependencies((prev) => prev.filter((d) => d.name !== name));
  }, []);

  const applyFileOperations = useCallback((fileOps: FileOperation[]) => {
    setFiles((prev) => {
      const updated = [...prev];
      for (const op of fileOps) {
        const existingIndex = updated.findIndex((f) => f.name === op.filename);
        if (existingIndex >= 0) {
          updated[existingIndex] = { ...updated[existingIndex], content: op.content };
          op.type = 'update';
        } else {
          const newFile: CodeFile = {
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            name: op.filename,
            language: getLanguageFromFilename(op.filename),
            content: op.content,
          };
          updated.push(newFile);
          op.type = 'create';
        }
      }
      return updated;
    });

    if (fileOps.length > 0) {
      setTimeout(() => {
        setFiles((current) => {
          const target = current.find((f) => f.name === fileOps[0].filename);
          if (target) setActiveFileId(target.id);
          return current;
        });
      }, 50);
    }
  }, []);

  // Save version snapshot after AI changes
  const saveSnapshot = useCallback((label: string) => {
    setFiles((current) => {
      versionControl.pushSnapshot(current, label);
      return current;
    });
  }, [versionControl]);

  const handleUndo = useCallback(() => {
    const prev = versionControl.undo();
    if (prev) {
      setFiles(prev);
      if (prev.length > 0) setActiveFileId(prev[0].id);
    }
  }, [versionControl]);

  const handleRedo = useCallback(() => {
    const next = versionControl.redo();
    if (next) {
      setFiles(next);
      if (next.length > 0) setActiveFileId(next[0].id);
    }
  }, [versionControl]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const sendMessage = useCallback(async (content: string) => {
    const mode = detectAIMode(content);
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
      mode,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsAiLoading(true);
    setAgentProgress(null);

    try {
      let currentFiles: CodeFile[] = [];
      setFiles((prev) => {
        currentFiles = prev;
        return prev;
      });
      const filesPayload = currentFiles.map((f) => ({ name: f.name, content: f.content }));

      const useMulti = multiAgentMode && shouldUseMultiAgent(content);
      let functionName: string;
      if (aiProvider === 'unofficial') {
        functionName = 'gemini-unofficial';
      } else {
        functionName = useMulti ? 'multi-agent' : 'gemini-chat';
      }
      const rpcMode = useMulti ? 'multi' : 'single';

      if (useMulti) {
        setAgentProgress('🤖 Agent 0 (Orchestrator) is planning...');
      }

      // Send conversation history for context
      const recentHistory = chatMessages.slice(-20).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const endpointMap: Record<string, string> = {
        'multi-agent': '/api/multi-agent',
        'gemini-unofficial': '/api/gemini-unofficial',
        'gemini-chat': '/api/gemini-chat',
      };
      const endpoint = endpointMap[functionName] || '/api/gemini-unofficial';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: content, files: filesPayload, mode: rpcMode, history: recentHistory }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || 'Connection error');
      }

      const data = await response.json();
      const rawReply = data?.reply || 'Could not get a response.';
      const agentLogs: AgentLog[] = data?.agentLogs || [];
      const { text, fileOps } = parseFileOperations(rawReply);

      if (fileOps.length > 0) {
        applyFileOperations(fileOps);
        // Push version snapshot
        const label = mode === 'FIX' ? `Fix: ${content.slice(0, 30)}` : mode === 'EDIT' ? `Edit: ${content.slice(0, 30)}` : `Create: ${content.slice(0, 30)}`;
        setTimeout(() => saveSnapshot(label), 100);
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: text || (fileOps.length > 0 ? 'Changes applied! ✅' : rawReply),
        timestamp: new Date(),
        fileOps: fileOps.length > 0 ? fileOps : undefined,
        agentLogs: agentLogs.length > 0 ? agentLogs : undefined,
        mode,
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch {
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: 'Sorry, a connection error occurred. Please try again.',
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsAiLoading(false);
      setAgentProgress(null);
    }
  }, [applyFileOperations, multiAgentMode, aiProvider, saveSnapshot]);

  const autoFixError = useCallback(async (errorDetails: { file: string; line: number | null; column: number | null; message: string; errorType: string; codeSnippet: string }, allFiles: CodeFile[]) => {
    if (errorDetails.file && errorDetails.line) {
      setErrorLine({ file: errorDetails.file, line: errorDetails.line });
    }

    let fixPrompt = `🔧 AUTO-FIX REQUEST\n\n`;
    fixPrompt += `❌ Error Type: ${errorDetails.errorType}\n`;
    if (errorDetails.file) fixPrompt += `📁 File: ${errorDetails.file}\n`;
    if (errorDetails.line) fixPrompt += `📍 Line: ${errorDetails.line}${errorDetails.column ? `, Column: ${errorDetails.column}` : ''}\n`;
    fixPrompt += `💬 Error Message: ${errorDetails.message}\n`;

    if (errorDetails.codeSnippet) {
      fixPrompt += `\n--- Code around the error ---\n${errorDetails.codeSnippet}\n--- End code context ---\n`;
    }

    if (errorDetails.file) {
      const errorFile = allFiles.find(f => f.name === errorDetails.file);
      if (errorFile) {
        fixPrompt += `\n--- Full content of ${errorDetails.file} ---\n${errorFile.content}\n--- End full content ---\n`;
      }
    }

    fixPrompt += `\nFix this ${errorDetails.errorType} error and return the full corrected files using [FILE:filename.ext] blocks. Focus on the specific error location. IMPORTANT: Do not escape normal code characters with markdown backslashes.`;

    const prevMode = multiAgentMode;
    setMultiAgentMode(false);
    await sendMessage(fixPrompt);
    setMultiAgentMode(prevMode);
    setErrorLine(null);
  }, [sendMessage, multiAgentMode]);

  return {
    files,
    activeFile,
    activeFileId,
    setActiveFileId,
    updateFileContent,
    addFile,
    deleteFile,
    renameFile,
    chatMessages,
    sendMessage,
    isAiLoading,
    autoFixError,
    multiAgentMode,
    setMultiAgentMode,
    aiProvider,
    setAiProvider,
    agentProgress,
    errorLine,
    // Version control
    versionControl,
    handleUndo,
    handleRedo,
    // Dependencies
    dependencies,
    addDependency,
    removeDependency,
  };
}
