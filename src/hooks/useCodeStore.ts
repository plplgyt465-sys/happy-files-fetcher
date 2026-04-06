import { useState, useCallback, useEffect, useRef } from 'react';
import { useVersionControl } from './useVersionControl';
import type { Dependency } from '@/components/DependencyManager';
import { useAgentLoop, type AgentState, type AgentStep, STATE_LABELS } from './useAgentLoop';
import { useStaticAnalysis } from './useStaticAnalysis';
import { supabase } from '@/integrations/supabase/client';

export type { AgentState, AgentStep };

export interface CodeFile {
  id: string;
  name: string;
  language: string;
  content: string;
}

export interface FileOperation {
  filename: string;
  content: string;
  type: 'create' | 'update' | 'delete';
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

const STORAGE_KEY = 'vibecode_project_files';
const STORAGE_ACTIVE_KEY = 'vibecode_active_file';

function saveFilesToStorage(files: CodeFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch { /* ignore quota errors */ }
}

function loadFilesFromStorage(): CodeFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CodeFile[];
  } catch {
    return [];
  }
}

function loadActiveIdFromStorage(files: CodeFile[]): string {
  try {
    const saved = localStorage.getItem(STORAGE_ACTIVE_KEY);
    if (saved && files.some(f => f.id === saved)) return saved;
  } catch { /* ignore */ }
  return files[0]?.id ?? '';
}

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
  const [files, setFiles] = useState<CodeFile[]>(() => loadFilesFromStorage());
  const [activeFileId, setActiveFileId] = useState<string>(() => {
    const loaded = loadFilesFromStorage();
    return loadActiveIdFromStorage(loaded);
  });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [multiAgentMode, setMultiAgentMode] = useState(true);
  const [aiProvider, setAiProvider] = useState<AIProvider>('unofficial');
  const [agentProgress, setAgentProgress] = useState<string | null>(null);
  const [agentCurrentState, setAgentCurrentState] = useState<AgentState>('idle');
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [errorLine, setErrorLine] = useState<{ file: string; line: number } | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'ai',
      content: '👋 مرحباً بك في **VibeCode**!\n\n🧠 **Ω — Intelligent Autonomous Coding Agent**\nيفهم → يخطط → ينفذ → يعكس → يتحقق → يصلّح → يكرر\n\n🔁 **13 مرحلة ذكاء متكاملة:**\n🧠 Intent → 📂 Context → 📋 Planning → 🔧 Selecting → ⚙️ Executing → 🏗️ Building → 🔍 Detecting → 🩺 Fixing → 🪞 Reflecting → ✅ Verifying → 🧠 Memory → 🏁 Finalizing\n\n🛠️ **17 أداة**: FileWrite, FileEdit, GlobTool, GrepTool, TSChecker, ErrorParser, MemoryStore, PlanCreate, **ReflectTool, GoalCheckTool, VerifyCodeTool** والمزيد!\n\n🚨 **بيئة نظيفة**: يُعيد كتابة App.tsx/App.css دائماً — لا ملفات افتراضية!\n🎯 **تتبع الأهداف**: يضع معايير النجاح ولا يتوقف إلا عند اكتمالها.\n🪞 **التأمل الذاتي**: يراجع ما أنجز ويكتشف ما ينقص تلقائياً.\n⚡ **توقف ذكي**: يتوقف فقط عندما: لا أخطاء + App.tsx محدّث + 6+ ملفات + كل المعايير مكتملة.\n\nجرّب: "أنشئ موقع مطعم احترافي" أو "ابنِ تطبيق todo كامل"!',
      timestamp: new Date(),
    },
  ]);

  const versionControl = useVersionControl([]);
  const agentLoop = useAgentLoop();
  const diagnostics = useStaticAnalysis(files);

  const activeFile = files.find((f) => f.id === activeFileId) ?? files[0] ?? null;

  // Persist files to localStorage whenever they change
  useEffect(() => {
    saveFilesToStorage(files);
  }, [files]);

  // Persist active file id whenever it changes
  useEffect(() => {
    try { localStorage.setItem(STORAGE_ACTIVE_KEY, activeFileId); } catch { /* ignore */ }
  }, [activeFileId]);

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

  const startNewProject = useCallback(() => {
    setFiles([]);
    setActiveFileId('');
    setDependencies([]);
    setErrorLine(null);
    setAgentProgress(null);
    setAgentSteps([]);
    setAgentCurrentState('idle');
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_ACTIVE_KEY);
    } catch { /* ignore */ }
  }, []);

  const applyFileOperations = useCallback((fileOps: FileOperation[]) => {
    setFiles((prev) => {
      let updated = [...prev];
      for (const op of fileOps) {
        if (op.type === 'delete') {
          updated = updated.filter((f) => f.name !== op.filename);
          continue;
        }
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

    const firstWrite = fileOps.find((op) => op.type !== 'delete');
    if (firstWrite) {
      setTimeout(() => {
        setFiles((current) => {
          const target = current.find((f) => f.name === firstWrite.filename);
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
    setAgentSteps([]);
    setAgentCurrentState('intent');

    let currentFiles: CodeFile[] = [];
    setFiles((prev) => { currentFiles = prev; return prev; });

    try {
      // ── Multi-agent mode (orchestrator + parallel agents) ──────────────────
      if (aiProvider === 'official' && multiAgentMode && shouldUseMultiAgent(content)) {
        setAgentProgress('🤖 Agent 0 (Orchestrator) is planning...');

        const recentHistory = chatMessages.slice(-20).map(m => ({ role: m.role, content: m.content }));
        const { data, error } = await supabase.functions.invoke('multi-agent', {
          body: {
            prompt: content,
            files: currentFiles.map(f => ({ name: f.name, content: f.content })),
            mode: 'multi',
            history: recentHistory,
          },
        });

        if (error) {
          throw new Error(error.message || 'Multi-agent error');
        }

        const rawReply = data?.reply || '';
        const agentLogs: AgentLog[] = data?.agentLogs || [];
        const { text, fileOps } = parseFileOperations(rawReply);

        if (fileOps.length > 0) {
          applyFileOperations(fileOps);
          setTimeout(() => saveSnapshot(`Build: ${content.slice(0, 30)}`), 100);
        }

        setChatMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          content: text || (fileOps.length > 0 ? '✅ تم البناء بنجاح' : rawReply),
          timestamp: new Date(),
          fileOps: fileOps.length > 0 ? fileOps : undefined,
          agentLogs: agentLogs.length > 0 ? agentLogs : undefined,
          mode,
        }]);
        return;
      }

      // ── ReAct Agent Loop (single-agent) ───────────────────────────────────
      const result = await agentLoop.run(
        content,
        currentFiles,
        diagnostics,
        aiProvider,
        // onStateChange
        (state: AgentState, thought?: string) => {
          setAgentCurrentState(state);
          setAgentProgress(thought ? `${STATE_LABELS[state]} — ${thought}` : STATE_LABELS[state]);
        },
        // onStep
        (step: AgentStep) => {
          setAgentSteps((prev) => [...prev, step]);
        },
      );

      if (result.fileOps.length > 0) {
        applyFileOperations(result.fileOps);
        const label = mode === 'FIX'
          ? `Fix: ${content.slice(0, 30)}`
          : mode === 'EDIT' ? `Edit: ${content.slice(0, 30)}` : `Create: ${content.slice(0, 30)}`;
        setTimeout(() => saveSnapshot(label), 100);
      }

      // Build toolResults for display from steps
      const toolResults = result.steps.map(s => ({
        tool: s.tool,
        success: true,
        result: s.result,
        duration: s.durationMs,
      }));

      setChatMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: result.text || (result.fileOps.length > 0 ? '✅ تم التنفيذ' : 'لا توجد تغييرات'),
        timestamp: new Date(),
        fileOps: result.fileOps.length > 0 ? result.fileOps : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        mode,
      }]);

    } catch (err) {
      setChatMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: `❌ خطأ: ${String(err)}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsAiLoading(false);
      setAgentProgress(null);
      setAgentCurrentState('idle');
    }
  }, [applyFileOperations, multiAgentMode, aiProvider, saveSnapshot, agentLoop, diagnostics, chatMessages]);

  const autoFixError = useCallback(async (
    errorDetails: { file: string; line: number | null; column: number | null; message: string; errorType: string; codeSnippet: string },
    allFiles: CodeFile[],
  ) => {
    if (errorDetails.file && errorDetails.line) {
      setErrorLine({ file: errorDetails.file, line: errorDetails.line });
    }

    // Structured error payload — the agent loop will use FileRead + ErrorParser tools
    const structuredError = {
      file: errorDetails.file,
      line: errorDetails.line,
      column: errorDetails.column,
      message: errorDetails.message,
      type: errorDetails.errorType,
      codeSnippet: errorDetails.codeSnippet,
    };

    const fixPrompt = [
      `🔧 AUTO-FIX`,
      ``,
      `ERROR:`,
      JSON.stringify(structuredError, null, 2),
      ``,
      `Fix this ${errorDetails.errorType} error. Read the file, fix the exact line, verify no new errors.`,
    ].join('\n');

    await sendMessage(fixPrompt);
    setErrorLine(null);
  }, [sendMessage]);

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
    agentCurrentState,
    agentSteps,
    diagnostics,
    errorLine,
    // Version control
    versionControl,
    handleUndo,
    handleRedo,
    // Dependencies
    dependencies,
    addDependency,
    removeDependency,
    startNewProject,
  };
}
