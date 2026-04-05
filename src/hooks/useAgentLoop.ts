import { useCallback, useRef } from 'react';
import type { CodeFile, FileOperation } from './useCodeStore';
import type { Diagnostic } from './useStaticAnalysis';
import type { AIProvider } from './useCodeStore';

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentState =
  | 'idle'
  | 'analyzing'
  | 'reading'
  | 'planning'
  | 'editing'
  | 'verifying'
  | 'done'
  | 'error';

export interface AgentStep {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
  thought: string;
  state: AgentState;
  durationMs: number;
}

export interface AgentLoopResult {
  text: string;
  fileOps: FileOperation[];
  steps: AgentStep[];
}

interface AgentDecision {
  type: 'tool' | 'final';
  tool?: string;
  input?: Record<string, unknown>;
  thought?: string;
  state?: string;
  response?: string;
  files?: { name: string; content: string }[];
}

const MAX_ITERATIONS = 12;

// ── Language helper ───────────────────────────────────────────────────────

function getLangFromExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    tsx: 'typescript', ts: 'typescript', jsx: 'javascript', js: 'javascript',
    css: 'css', json: 'json', html: 'html', md: 'markdown', txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

// ── Tool executor (client-side, reads from live files) ────────────────────

function executeTool(
  tool: string,
  input: Record<string, unknown>,
  workingFiles: CodeFile[],
  diagnostics: Diagnostic[],
): unknown {
  const t = tool.toLowerCase();

  if (t === 'filelist') {
    return {
      files: workingFiles.map(f => ({
        name: f.name,
        language: f.language,
        lines: f.content.split('\n').length,
      })),
      totalFiles: workingFiles.length,
    };
  }

  if (t === 'fileread') {
    const fileName = String(input.fileName || input.file || input.path || '');
    const file = workingFiles.find(f => f.name === fileName);
    if (!file) return { error: `File '${fileName}' not found in project` };
    return { fileName, content: file.content, lines: file.content.split('\n').length };
  }

  if (t === 'filewrite' || t === 'filecreate') {
    const fileName = String(input.fileName || input.name || input.file || '');
    const content = String(input.content || '');
    if (!fileName) return { error: 'fileName is required' };
    if (!content) return { error: 'content is required' };
    const exists = workingFiles.some(f => f.name === fileName);
    return { success: true, fileName, action: exists ? 'updated' : 'created', lines: content.split('\n').length };
  }

  if (t === 'errorparser') {
    return {
      total: diagnostics.length,
      errors: diagnostics.filter(d => d.severity === 'error').map(d => ({
        file: d.file, line: d.line, column: d.column, message: d.message, type: d.type,
      })),
      warnings: diagnostics.filter(d => d.severity === 'warning').map(d => ({
        file: d.file, line: d.line, message: d.message,
      })),
      hasErrors: diagnostics.some(d => d.severity === 'error'),
    };
  }

  if (t === 'searchcode') {
    const query = String(input.query || input.search || '').toLowerCase();
    if (!query) return { error: 'query is required' };
    const results: { file: string; line: number; content: string }[] = [];
    for (const f of workingFiles) {
      const lines = f.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query)) {
          results.push({ file: f.name, line: i + 1, content: lines[i].trim() });
          if (results.length >= 20) break;
        }
      }
      if (results.length >= 20) break;
    }
    return { query, results, count: results.length };
  }

  if (t === 'projectinfo') {
    const byType: Record<string, number> = {};
    let totalLines = 0;
    for (const f of workingFiles) {
      const ext = f.name.split('.').pop() || 'unknown';
      byType[ext] = (byType[ext] || 0) + 1;
      totalLines += f.content.split('\n').length;
    }
    return {
      files: workingFiles.map(f => ({ name: f.name, language: f.language })),
      totalFiles: workingFiles.length,
      totalLines,
      byType,
      errors: diagnostics.filter(d => d.severity === 'error').length,
      warnings: diagnostics.filter(d => d.severity === 'warning').length,
    };
  }

  return { error: `Unknown tool: ${tool}` };
}

// ── State label mapping ────────────────────────────────────────────────────

function mapState(s: string | undefined): AgentState {
  const map: Record<string, AgentState> = {
    analyzing: 'analyzing', reading: 'reading', planning: 'planning',
    editing: 'editing', verifying: 'verifying', done: 'done',
  };
  return map[s?.toLowerCase() || ''] || 'analyzing';
}

export const STATE_LABELS: Record<AgentState, string> = {
  idle: 'Idle',
  analyzing: '🧠 يحلل الطلب...',
  reading: '📖 يقرأ الملفات...',
  planning: '📋 يخطط...',
  editing: '✏️ يعدّل الكود...',
  verifying: '🔍 يتحقق من الأخطاء...',
  done: '✅ اكتمل',
  error: '❌ خطأ',
};

// ── Main hook ──────────────────────────────────────────────────────────────

export function useAgentLoop() {
  const abortRef = useRef(false);

  const run = useCallback(async (
    userPrompt: string,
    files: CodeFile[],
    diagnostics: Diagnostic[],
    provider: AIProvider,
    onStateChange: (state: AgentState, thought?: string) => void,
    onStep: (step: AgentStep) => void,
  ): Promise<AgentLoopResult> => {
    abortRef.current = false;

    const messages: { role: string; content: string }[] = [
      { role: 'user', content: userPrompt },
    ];

    const steps: AgentStep[] = [];
    // Working copy of files — updated as FileWrite calls come in
    let workingFiles: CodeFile[] = files.map(f => ({ ...f }));
    const fileOps: FileOperation[] = [];

    onStateChange('analyzing', 'يحلل الطلب...');
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      if (abortRef.current) break;
      iterations++;

      let decision: AgentDecision;
      try {
        const res = await fetch('/api/agent/think', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            files: workingFiles.map(f => ({ name: f.name, content: f.content })),
            diagnostics,
            provider,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error ${res.status}`);
        }
        decision = await res.json();
      } catch (err) {
        onStateChange('error', String(err));
        return { text: `Agent error: ${String(err)}`, fileOps, steps };
      }

      // ── FINAL ────────────────────────────────────────────────────────────
      if (decision.type === 'final') {
        onStateChange('done', decision.thought);

        if (Array.isArray(decision.files)) {
          for (const f of decision.files) {
            if (!f.name || !f.content) continue;
            fileOps.push({ filename: f.name, content: f.content, type: 'create' });
            // Sync to working files
            const idx = workingFiles.findIndex(w => w.name === f.name);
            if (idx >= 0) {
              workingFiles[idx] = { ...workingFiles[idx], content: f.content };
            } else {
              workingFiles.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: f.name,
                language: getLangFromExt(f.name),
                content: f.content,
              });
            }
          }
        }

        return { text: decision.response || '✅ تم التنفيذ بنجاح', fileOps, steps };
      }

      // ── TOOL CALL ─────────────────────────────────────────────────────────
      if (decision.type === 'tool' && decision.tool) {
        const agentState = mapState(decision.state);
        onStateChange(agentState, decision.thought);

        const t0 = Date.now();
        const toolInput = decision.input || {};
        const toolResult = executeTool(decision.tool, toolInput, workingFiles, diagnostics);
        const durationMs = Date.now() - t0;

        const step: AgentStep = {
          tool: decision.tool,
          input: toolInput,
          result: toolResult,
          thought: decision.thought || '',
          state: agentState,
          durationMs,
        };
        steps.push(step);
        onStep(step);

        // If it's a FileWrite, update working files immediately
        if (decision.tool.toLowerCase() === 'filewrite' || decision.tool.toLowerCase() === 'filecreate') {
          const fileName = String(toolInput.fileName || toolInput.name || toolInput.file || '');
          const content = String(toolInput.content || '');
          if (fileName && content) {
            const idx = workingFiles.findIndex(w => w.name === fileName);
            if (idx >= 0) {
              workingFiles[idx] = { ...workingFiles[idx], content };
            } else {
              workingFiles.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: fileName,
                language: getLangFromExt(fileName),
                content,
              });
            }
          }
        }

        // Add to conversation
        messages.push({
          role: 'assistant',
          content: JSON.stringify({
            type: 'tool',
            tool: decision.tool,
            input: toolInput,
            thought: decision.thought,
          }),
        });
        messages.push({
          role: 'user',
          content: JSON.stringify({
            type: 'tool_result',
            tool: decision.tool,
            result: toolResult,
            success: true,
          }),
        });
      }
    }

    // Max iterations reached — return whatever file ops we have
    onStateChange('done', 'اكتمل (حد الدورات)');
    return { text: '✅ اكتمل التنفيذ', fileOps, steps };
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { run, abort };
}
