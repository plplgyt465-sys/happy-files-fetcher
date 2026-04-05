import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const TOOL_DESCRIPTIONS = `
## Available Tools (44 total)

To use a tool, wrap it in [TOOL_CALL:ToolName] blocks with JSON input:
[TOOL_CALL:FileReadTool]
{"fileName": "App.tsx"}
[/TOOL_CALL]

### FILE (8)
- **FileReadTool**: Read content of a file, optionally specifying line range (required: fileName)
- **FileWriteTool**: Create or overwrite a file with content (required: fileName, content)
- **FileEditTool**: Edit file by replacing a string with another (required: fileName, oldString, newString)
- **FileDeleteTool**: Delete a file from the project (required: fileName)
- **FileRenameTool**: Rename a file (required: oldName, newName)
- **FileCopyTool**: Copy a file to a new location (required: source, destination)
- **FileMoveTool**: Move a file to a new location (required: oldName, newName)
- **FileInfoTool**: Get metadata about a file (required: fileName)

### SEARCH (6)
- **GlobTool**: Find files matching a glob pattern (required: pattern)
- **GrepTool**: Search for text across all files (required: query)
- **SearchReplaceTool**: Search and replace text across files (required: search, replace)
- **FindSymbolTool**: Find where a symbol is defined (required: symbol)
- **FindReferencesTool**: Find all references to a symbol (required: symbol)
- **ToolSearchTool**: Search for available tools by name or category

### ANALYSIS (5)
- **ErrorParserTool**: Get all current diagnostics and errors
- **TSCheckerTool**: Check a specific file for TypeScript issues (required: fileName)
- **ProjectInfoTool**: Get full project overview and statistics
- **DependencyAnalyzerTool**: Analyze import dependency graph
- **UnusedCodeTool**: Find unused exports across the project

### CODE (4)
- **LSPTool**: Language server operations: hover, definition, references (required: fileName, operation, line)
- **CodeComplexityTool**: Calculate cyclomatic complexity of a file (required: fileName)
- **CodeFormatterTool**: Format code in a file (required: fileName)
- **SnippetGeneratorTool**: Generate code snippets (required: type, name)
- **NotebookEditTool**: Edit a Jupyter notebook cell (required: fileName, cellIndex, content)

### TASK (5)
- **TaskCreateTool**: Create a new task (required: title)
- **TaskUpdateTool**: Update a task status or details (required: taskId)
- **TaskListTool**: List all tasks
- **TaskDeleteTool**: Delete a task (required: taskId)
- **ProgressTrackTool**: Get progress across all tasks
- **TimeEstimateTool**: Estimate time for a task (required: description)

### PLAN (2)
- **EnterPlanModeTool**: Enter plan mode (AI plans without executing)
- **ExitPlanModeTool**: Exit plan mode (AI can execute changes)

### AGENT (4)
- **AgentTool**: Spawn a sub-agent with a specific instruction (required: instruction)
- **SendMessageTool**: Send a message to another agent (required: to, message)
- **CoordinatorTool**: Start multi-agent coordination (required: plan)
- **DelegateTool**: Delegate a task to a specific agent (required: agentId, task)

### TEAM (2)
- **TeamCreateTool**: Create a team of agents (required: name)
- **TeamDeleteTool**: Delete a team (required: teamId)

### UTILITY (6)
- **SleepTool**: Wait for a specified duration
- **SyntheticOutputTool**: Generate structured output in JSON or markdown (required: data)
- **MemoryStoreTool**: Store persistent memory (required: key, value)
- **MemoryRecallTool**: Recall stored memory (required: key)
- **DiffTool**: Compare two files (required: file1, file2)
- **BashTool**: Execute shell commands (simulated: ls, cat, wc, echo, pwd, date) (required: command)

## Available Skills (16 total)

To use a skill, wrap it in [SKILL:skill-id] blocks:
- **scaffold-react**: Create a complete React project scaffold
- **generate-component**: Generate a React component [Input: name]
- **generate-hook**: Generate a custom React hook [Input: name]
- **code-review**: Full code review with errors, complexity, unused code
- **complexity-audit**: Measure complexity for all files
- **fix-errors**: Detect and prepare to fix errors
- **search-replace**: Global search and replace [Input: search, replace]
- **rename-symbol**: Rename a symbol across all files [Input: oldName, newName]
- **generate-test**: Generate a test file [Input: name]
- **generate-api**: Generate API service functions [Input: name]
- **generate-context**: Generate React Context provider [Input: name]
- **generate-types**: Generate TypeScript types [Input: name]
- **generate-docs**: Generate project documentation
- **perf-analysis**: Analyze performance patterns
- **security-scan**: Scan for security issues
- **memory-manage**: Store and recall project memories
`;

const GEMINI_CHAT_SYSTEM = `You are an expert AI coding assistant integrated into VibeCode — a professional live coding platform with 44 tools and 16 skills.

## MODES
You operate in one of three modes based on the user's request:
- CREATE: Build new features/projects from scratch
- EDIT: Modify existing files with minimal changes
- FIX: Fix specific errors — modify ONLY the file(s) with the problem

## CRITICAL RULES
1. ALL projects MUST use React with TypeScript (.tsx files). NEVER generate plain HTML files.
2. When creating or editing code, respond with file blocks:
[FILE:filename.ext]
(full file content)
[/FILE]

3. You can include multiple [FILE] blocks.
4. Include explanation text OUTSIDE [FILE] blocks.
5. If the user asks a question without needing code changes, answer normally.
6. Always write COMPLETE file contents, not partial snippets.
7. Supported file types: .tsx, .ts, .css, .json, .md
8. Respond in the same language the user writes in.
9. The project structure must always include:
   - App.tsx: Main component
   - App.css: Styles
   - index.tsx: Entry point that renders App into #root
10. Use React hooks and functional components only.
11. Import React at the top of every .tsx file.
12. CRITICAL: Do NOT escape normal code characters with markdown backslashes.

${TOOL_DESCRIPTIONS}

## SAFETY RULES
- Do NOT duplicate component declarations
- Do NOT redeclare variables that already exist
- Do NOT break existing imports
- Do NOT delete files unless explicitly asked
- In FIX mode: modify ONLY the broken file(s)
- In EDIT mode: modify ONLY the requested file(s)
- ALWAYS preserve existing functionality

## ERROR FIXING
When fixing errors:
1. Use [TOOL_CALL:ErrorParserTool] to get diagnostics
2. Use [TOOL_CALL:FileReadTool] to read the problematic file
3. Apply the minimal fix using [FILE:] blocks
4. Return ONLY the changed file(s)

## DEPENDENCY SYSTEM
When the user needs external libraries, use CDN imports:
import axios from "https://esm.sh/axios"

## STRUCTURED RESPONSE
After explanation and [FILE:] blocks, if there are issues:
[DIAGNOSTICS]
{"errors": [{"file": "App.tsx", "line": 12, "message": "description", "type": "SyntaxError"}]}
[/DIAGNOSTICS]
`;

const AGENTS: Record<string, { name: string; role: string; systemPrompt: string }> = {
  "0": {
    name: "Orchestrator",
    role: "orchestrator",
    systemPrompt: `You are Agent 0 — the Orchestrator. You receive user requests and break them down into sub-tasks for specialized agents.

You MUST respond with a valid JSON object (no markdown, no explanation, just raw JSON) with this structure:
{
  "plan": "Brief description of what will be built",
  "tasks": [
    { "agentId": "1", "instruction": "What agent 1 should do" },
    { "agentId": "2", "instruction": "What agent 2 should do" }
  ]
}

Available agents:
- Agent 1 (Setup): Creates project structure, config files, index.tsx entry point
- Agent 2 (Styles): Creates all CSS files and styling
- Agent 3 (State): Creates state management hooks, context, types/interfaces
- Agent 4 (Shared): Creates shared/reusable components (Header, Footer, Button, Card, etc.)
- Agent 5 (Home): Creates the home/landing page component
- Agent 6 (Products): Creates product listing, product detail, catalog components
- Agent 7 (Cart): Creates cart, checkout, order-related components
- Agent 8 (Contact): Creates contact page, forms, about page components
- Agent 9 (Data): Creates data files, mock data, API utilities, constants

Rules:
- Always include Agent 1 (Setup) and Agent 2 (Styles) at minimum
- Include Agent 3 (State) if state management is needed
- Include Agent 4 (Shared) for reusable components
- Only include page agents (5-8) if relevant to the request
- Include Agent 9 (Data) if mock data or API calls are needed
- Each instruction should be specific and detailed`,
  },
  "1": { name: "Setup Agent", role: "setup", systemPrompt: "You are Agent 1 — the Setup Agent. Create index.tsx and App.tsx. Respond ONLY with [FILE] blocks. ALL files must be React TypeScript (.tsx). Import React at the top. Use functional components with hooks only." },
  "2": { name: "Styles Agent", role: "styles", systemPrompt: "You are Agent 2 — the Styles Agent. Create all CSS styling. Respond ONLY with [FILE] blocks. Use modern CSS (flexbox, grid, variables, transitions). Mobile-first responsive design. Dark theme preferred." },
  "3": { name: "State Agent", role: "state", systemPrompt: "You are Agent 3 — the State Agent. Create TypeScript interfaces, custom hooks, and context providers. Respond ONLY with [FILE] blocks. Use TypeScript strictly." },
  "4": { name: "Shared Components Agent", role: "shared", systemPrompt: "You are Agent 4 — the Shared Components Agent. Create reusable UI components. Respond ONLY with [FILE] blocks. ALL files must be .tsx. Use TypeScript interfaces for all props." },
  "5": { name: "Home Page Agent", role: "home", systemPrompt: "You are Agent 5 — the Home Page Agent. Create the main Home page component. Respond ONLY with [FILE] blocks. ALL files must be .tsx." },
  "6": { name: "Products Agent", role: "products", systemPrompt: "You are Agent 6 — the Products Agent. Create product-related components. Respond ONLY with [FILE] blocks. ALL files must be .tsx." },
  "7": { name: "Cart Agent", role: "cart", systemPrompt: "You are Agent 7 — the Cart Agent. Create cart and checkout components. Respond ONLY with [FILE] blocks. ALL files must be .tsx." },
  "8": { name: "Contact Agent", role: "contact", systemPrompt: "You are Agent 8 — the Contact Agent. Create contact and informational pages. Respond ONLY with [FILE] blocks. ALL files must be .tsx." },
  "9": { name: "Data Agent", role: "data", systemPrompt: "You are Agent 9 — the Data Agent. Create data files, mock data, and API utilities. Respond ONLY with [FILE] blocks. Files should be .ts." },
};

// ─── Unofficial Gemini (Bard) helpers ─────────────────────────────────────────

const BARD_URL =
  'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate';

const BARD_HEADERS: Record<string, string> = {
  accept: '*/*',
  'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'x-same-domain': '1',
  cookie: '',
};

function buildBardPayload(prompt: string): string {
  const inner = [
    [prompt, 0, null, null, null, null, 0],
    ['en-US'],
    ['', '', '', null, null, null, null, null, null, ''],
    '', '', null, [0], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 0,
  ];
  const outer = [null, JSON.stringify(inner)];
  return new URLSearchParams({ 'f.req': JSON.stringify(outer) }).toString() + '&';
}

function parseBardResponse(text: string): string {
  text = text.replace(")]}'", '');
  let best = '';
  for (const line of text.split('\n')) {
    if (!line.includes('wrb.fr')) continue;
    let data: unknown;
    try { data = JSON.parse(line); } catch { continue; }
    let entries: unknown[][] = [];
    if (Array.isArray(data)) {
      if ((data as unknown[])[0] === 'wrb.fr') {
        entries = [data as unknown[]];
      } else {
        entries = (data as unknown[][]).filter((i) => Array.isArray(i) && i[0] === 'wrb.fr');
      }
    }
    for (const entry of entries) {
      try {
        const inner = JSON.parse(entry[2] as string);
        if (Array.isArray(inner) && Array.isArray((inner as unknown[])[4])) {
          for (const c of (inner as unknown[])[4] as unknown[][]) {
            if (Array.isArray(c) && Array.isArray(c[1])) {
              const txt = (c[1] as unknown[]).filter((t) => typeof t === 'string').join('');
              if (txt.length > best.length) best = txt;
            }
          }
        }
      } catch { continue; }
    }
  }
  return best.trim();
}

async function callAI(systemPrompt: string, userMessage: string, history?: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY;

  if (apiKey) {
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];
    if (history) {
      for (const msg of history) {
        messages.push({ role: msg.role === 'ai' ? 'assistant' : msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: userMessage });

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-2.5-flash', messages }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      if (response.status === 429) throw new Error('RATE_LIMIT');
      if (response.status === 402) throw new Error('CREDITS_EXHAUSTED');
      throw new Error(`AI returned status ${response.status}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || 'Could not get a response.';
  }

  // Fall back to unofficial Gemini when no API key is configured
  let conversationText = '';
  if (history) {
    for (const msg of history) {
      conversationText += `${msg.role === 'ai' ? 'Assistant' : 'User'}: ${msg.content}\n\n`;
    }
  }
  const fullPrompt = `${systemPrompt}\n\n${conversationText}User: ${userMessage}\n\nAssistant:`;
  const payload = buildBardPayload(fullPrompt);
  const response = await fetch(BARD_URL, { method: 'POST', headers: BARD_HEADERS, body: payload });
  if (!response.ok) throw new Error(`Unofficial Gemini error: ${response.status}`);
  const rawText = await response.text();
  return parseBardResponse(rawText) || 'Could not get a response.';
}

function extractFileNames(response: string): string[] {
  const names: string[] = [];
  const regex = /\[FILE:([\w.\-/]+)\]/g;
  let m;
  while ((m = regex.exec(response)) !== null) names.push(m[1]);
  return names;
}

// ─── Agent Think Endpoint (ReAct Loop) ───────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `You are an autonomous React/TypeScript coding agent running inside a ReAct (Reason + Act) loop.

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no backticks, no explanations outside the JSON.

You follow these states in order:
1. "analyzing"  — Understand the user's request
2. "reading"    — Read files to understand the codebase  
3. "planning"   — Plan what changes are needed
4. "editing"    — Write/modify files
5. "verifying"  — Check for errors after changes

RESPONSE FORMAT — choose one each turn:

To call a tool:
{"type":"tool","tool":"TOOL_NAME","input":{...},"thought":"Your reasoning here","state":"analyzing|reading|planning|editing|verifying"}

To finish (ONLY when all changes are complete and verified):
{"type":"final","thought":"Summary of everything done","response":"Message to show the user","files":[{"name":"App.tsx","content":"COMPLETE file content here"}]}

AVAILABLE TOOLS:
- FileList:   {}                                        — List all project files
- FileRead:   {"fileName":"App.tsx"}                    — Read a file's full content
- FileWrite:  {"fileName":"New.tsx","content":"..."}    — Create or overwrite a file (COMPLETE content only)
- SearchCode: {"query":"useState"}                      — Search code across all files
- ErrorParser: {}                                       — Get all current errors and warnings
- ProjectInfo: {}                                       — Get project structure and stats

MANDATORY RULES:
1. Start EVERY session with FileList to understand the project structure
2. ALWAYS use FileRead before modifying a file — never guess content
3. When writing files, include the COMPLETE file content — no partial snippets
4. After making file changes, call ErrorParser to check for errors
5. Fix all errors before sending a "final" response
6. The "files" array in "final" should contain ALL files you modified/created
7. Respond in the SAME LANGUAGE as the user (Arabic → Arabic, English → English)
8. Do NOT escape code characters with backslashes in file content
9. Max 12 tool calls before you MUST send a "final" response`;

app.post('/api/agent/think', async (req, res) => {
  try {
    const { messages, files, diagnostics, provider } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const filesContext = Array.isArray(files)
      ? files.map((f: { name: string; content: string }) =>
          `--- ${f.name} ---\n${f.content}`
        ).join('\n\n')
      : '';

    const errorsContext = Array.isArray(diagnostics) && diagnostics.length > 0
      ? `\nCURRENT ERRORS:\n${JSON.stringify(diagnostics.slice(0, 10), null, 2)}`
      : '';

    const projectContext = filesContext
      ? `\nPROJECT FILES:\n${filesContext}${errorsContext}`
      : errorsContext;

    const systemWithContext = AGENT_SYSTEM_PROMPT + projectContext;

    // Build the full prompt for unofficial API
    const conversationText = (messages as {role:string;content:string}[])
      .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
      .join('\n\n');

    const fullPrompt = `${systemWithContext}\n\n${conversationText}\n\nAgent:`;

    let rawReply = '';

    const useOfficial = provider === 'official';

    if (useOfficial) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'No API key configured for official mode' });
      }
      const apiMessages = [
        { role: 'system', content: systemWithContext },
        ...(messages as {role:string;content:string}[]).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      ];
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-2.5-flash', messages: apiMessages }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(502).json({ error: `AI error: ${response.status} — ${errText.slice(0, 200)}` });
      }
      const data = await response.json();
      rawReply = data?.choices?.[0]?.message?.content || '';
    } else {
      // Unofficial Bard
      const payload = buildBardPayload(fullPrompt);
      const response = await fetch(BARD_URL, { method: 'POST', headers: BARD_HEADERS, body: payload });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(502).json({ error: `Unofficial Gemini error: ${response.status}` });
      }
      const rawText = await response.text();
      rawReply = parseBardResponse(rawText);
    }

    // Parse JSON decision from reply
    let decision: Record<string, unknown>;
    try {
      // Strip markdown code fences if present
      let cleaned = rawReply.trim()
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      // Find first { to last }
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
      decision = JSON.parse(cleaned);
    } catch {
      // Fallback: if AI returned file blocks instead of JSON, wrap as final
      const fileRegex = /\[FILE:([\w.\-/]+)\]\n([\s\S]*?)\n?\[\/FILE\]/g;
      const files: { name: string; content: string }[] = [];
      let match;
      while ((match = fileRegex.exec(rawReply)) !== null) {
        files.push({ name: match[1].trim(), content: match[2] });
      }
      const text = rawReply.replace(/\[FILE:[\w.\-/]+\][\s\S]*?\[\/FILE\]/g, '').trim();
      decision = {
        type: 'final',
        thought: 'Completed',
        response: text || rawReply.slice(0, 500),
        files,
      };
    }

    return res.json(decision);
  } catch (err) {
    console.error('agent/think error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/gemini-unofficial', async (req, res) => {
  try {
    const { prompt, files, mode, history } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    let filesContext = '';
    if (Array.isArray(files)) {
      for (const f of files) filesContext += `\n--- ${f.name} ---\n${f.content}\n`;
    }

    let conversationContext = '';
    if (Array.isArray(history) && history.length > 0) {
      const recent = history.slice(-10);
      conversationContext = '\n## Recent Conversation:\n';
      for (const msg of recent) {
        const role = msg.role === 'ai' ? 'Assistant' : 'User';
        conversationContext += `${role}: ${msg.content}\n\n`;
      }
    }

    const modePrefix = mode ? `[MODE: ${mode}]\n` : '';
    let fullPrompt = GEMINI_CHAT_SYSTEM + '\n';
    if (conversationContext) fullPrompt += conversationContext + '\n';
    if (filesContext) fullPrompt += `--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\n`;
    fullPrompt += `${modePrefix}User request: ${prompt}`;

    const payload = buildBardPayload(fullPrompt);

    const res2 = await fetch(BARD_URL, {
      method: 'POST',
      headers: BARD_HEADERS,
      body: payload,
    });

    if (!res2.ok) {
      const errText = await res2.text();
      console.error('Unofficial Gemini error:', res2.status, errText);
      return res.status(502).json({ error: `Unofficial Gemini returned status ${res2.status}` });
    }

    const rawText = await res2.text();
    const reply = parseBardResponse(rawText) || '[No response from Gemini]';

    let diagnostics = null;
    const diagMatch = reply.match(/\[DIAGNOSTICS\]\n([\s\S]*?)\n\[\/DIAGNOSTICS\]/);
    if (diagMatch) {
      try { diagnostics = JSON.parse(diagMatch[1]); } catch { /* ignore */ }
    }

    return res.json({ reply, diagnostics });
  } catch (err) {
    console.error('gemini-unofficial error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.post('/api/gemini-chat', async (req, res) => {
  try {
    const { prompt, files, mode, history } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    let filesContext = '';
    if (Array.isArray(files)) {
      for (const f of files) filesContext += `\n--- ${f.name} ---\n${f.content}\n`;
    }

    const recentHistory = Array.isArray(history) ? history.slice(-20) : [];
    const modePrefix = mode ? `[MODE: ${mode}]\n` : '';
    const userMessage = filesContext
      ? `${modePrefix}--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\nUser request: ${prompt}`
      : `${modePrefix}${prompt}`;

    const reply = await callAI(GEMINI_CHAT_SYSTEM, userMessage, recentHistory);

    let diagnostics = null;
    const diagMatch = reply.match(/\[DIAGNOSTICS\]\n([\s\S]*?)\n\[\/DIAGNOSTICS\]/);
    if (diagMatch) {
      try { diagnostics = JSON.parse(diagMatch[1]); } catch { /* ignore */ }
    }

    return res.json({ reply, diagnostics });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'RATE_LIMIT') return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
    if (msg === 'CREDITS_EXHAUSTED') return res.status(402).json({ error: 'Credits exhausted. Please add funds.' });
    if (msg.includes('No API key')) return res.status(500).json({ error: msg });
    console.error('gemini-chat error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.post('/api/multi-agent', async (req, res) => {
  try {
    const { prompt, files, mode } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    if (mode === 'single') {
      const filesContext = Array.isArray(files)
        ? files.map((f: { name: string; content: string }) => `\n--- ${f.name} ---\n${f.content}\n`).join('')
        : '';
      const userMessage = filesContext
        ? `--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\nUser request: ${prompt}`
        : prompt;
      const reply = await callAI(GEMINI_CHAT_SYSTEM, userMessage);
      return res.json({ reply });
    }

    console.log('Multi-agent orchestration started');
    const orchestratorResponse = await callAI(AGENTS['0'].systemPrompt, `User request: ${prompt}`);

    let plan: { plan: string; tasks: { agentId: string; instruction: string }[] };
    try {
      let cleaned = orchestratorResponse.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      plan = JSON.parse(cleaned);
    } catch {
      console.error('Orchestrator returned invalid JSON:', orchestratorResponse);
      return res.json({
        reply: orchestratorResponse,
        agentLogs: [{ agent: 'Orchestrator', status: 'fallback', message: 'Could not parse plan, using single-agent mode' }],
      });
    }

    const foundationAgents = ['1', '2', '3', '9'];
    const sharedAgents = ['4'];
    const pageAgents = ['5', '6', '7', '8'];

    const layer1Tasks = plan.tasks.filter((t) => foundationAgents.includes(t.agentId));
    const layer2Tasks = plan.tasks.filter((t) => sharedAgents.includes(t.agentId));
    const layer3Tasks = plan.tasks.filter((t) => pageAgents.includes(t.agentId));

    const agentLogs: { agent: string; status: string; message: string; filesCreated?: string[] }[] = [];
    let allFileBlocks = '';

    const runAgent = async (task: { agentId: string; instruction: string }, contextNote = '') => {
      const agent = AGENTS[task.agentId];
      if (!agent) throw new Error(`Unknown agent: ${task.agentId}`);
      const filesContext = Array.isArray(files)
        ? files.map((f: { name: string; content: string }) => `\n--- ${f.name} ---\n${f.content}\n`).join('')
        : '';
      let userMessage = `Project description: ${plan.plan}\n\nYour specific task: ${task.instruction}${contextNote}`;
      if (filesContext) userMessage = `--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\n${userMessage}`;
      return callAI(agent.systemPrompt, userMessage);
    };

    const processLayerResults = (results: PromiseSettledResult<{ agentId: string; result: string }>[]) => {
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { agentId, result } = r.value;
          const fileNames = extractFileNames(result);
          allFileBlocks += '\n' + result;
          agentLogs.push({ agent: AGENTS[agentId]?.name || agentId, status: 'success', message: `Created ${fileNames.length} file(s)`, filesCreated: fileNames });
        } else {
          const reason = r.reason?.message || 'Unknown error';
          agentLogs.push({ agent: 'Unknown', status: 'error', message: reason });
          console.error('Agent failed:', reason);
        }
      }
    };

    if (layer1Tasks.length > 0) {
      const results = await Promise.allSettled(layer1Tasks.map(async (task) => ({ agentId: task.agentId, result: await runAgent(task) })));
      processLayerResults(results);
      await new Promise((r) => setTimeout(r, 500));
    }

    if (layer2Tasks.length > 0) {
      const results = await Promise.allSettled(layer2Tasks.map(async (task) => ({ agentId: task.agentId, result: await runAgent(task, '\n\nNote: Foundation files have already been created by other agents.') })));
      processLayerResults(results);
      await new Promise((r) => setTimeout(r, 500));
    }

    if (layer3Tasks.length > 0) {
      const results = await Promise.allSettled(layer3Tasks.map(async (task) => ({ agentId: task.agentId, result: await runAgent(task, '\n\nNote: Foundation files and shared components have been created.') })));
      processLayerResults(results);
    }

    const successCount = agentLogs.filter((l) => l.status === 'success').length;
    const totalFiles = agentLogs.reduce((sum, l) => sum + (l.filesCreated?.length || 0), 0);
    const summaryText = `Multi-Agent Build Complete!\n\nPlan: ${plan.plan}\n${successCount}/${plan.tasks.length} agents completed successfully\n${totalFiles} files created\n\n${agentLogs.map((l) => `${l.status === 'success' ? '✅' : '❌'} ${l.agent}: ${l.message}${l.filesCreated ? ' → ' + l.filesCreated.join(', ') : ''}`).join('\n')}`;
    const reply = summaryText + '\n\n' + allFileBlocks;

    return res.json({ reply, agentLogs, plan: plan.plan });
  } catch (err) {
    console.error('multi-agent error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = parseInt(process.env.PORT || '3000', 10);
createServer(app).listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
