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
## Available Tools (47 total)

To use a tool, wrap it in [TOOL_CALL:ToolName] blocks with JSON input:
[TOOL_CALL:FileReadTool]
{"fileName": "App.tsx"}
[/TOOL_CALL]

### FILE (8)
- **FileReadTool**: Read a file from the project. Supports optional startLine/endLine for large files (required: fileName)
- **FileWriteTool**: Create or overwrite a file with full content (required: fileName, content)
- **FileEditTool**: Perform exact string replacement in a file — always read the file first (required: fileName, oldString, newString)
- **FileDeleteTool**: Delete a file from the project (required: fileName)
- **FileRenameTool**: Rename a file (required: oldName, newName)
- **FileCopyTool**: Copy a file to a new location (required: source, destination)
- **FileMoveTool**: Move a file to a new location (required: oldName, newName)
- **FileInfoTool**: Get metadata about a file (required: fileName)

### SEARCH (6)
- **GlobTool**: Fast file pattern matching — supports glob patterns like "**/*.tsx" or "src/**/*.ts" (required: pattern)
- **GrepTool**: Search for text patterns across all project files (required: query)
- **SearchReplaceTool**: Search and replace text across files (required: search, replace)
- **FindSymbolTool**: Find where a symbol is defined (required: symbol)
- **FindReferencesTool**: Find all references to a symbol (required: symbol)
- **ToolSearchTool**: Search for available tools by name or category

### ANALYSIS (5)
- **ErrorParserTool**: Get all current diagnostics and TypeScript errors
- **TSCheckerTool**: Check a specific file for TypeScript issues (required: fileName)
- **ProjectInfoTool**: Get full project overview, file count, and statistics
- **DependencyAnalyzerTool**: Analyze import dependency graph across the project
- **UnusedCodeTool**: Find unused exports across the project

### CODE (5)
- **LSPTool**: Language server operations: hover, definition, references (required: fileName, operation, line)
- **CodeComplexityTool**: Calculate cyclomatic complexity of a file (required: fileName)
- **CodeFormatterTool**: Format code in a file — normalizes indentation and trailing whitespace (required: fileName)
- **SnippetGeneratorTool**: Generate code snippets: component, hook, context, types, test, api (required: type, name)
- **NotebookEditTool**: Edit a Jupyter notebook cell (required: fileName, cellIndex, content)

### TASK (7)
- **TaskCreateTool**: Create a new task with title and optional description (required: title)
- **TaskUpdateTool**: Update a task status (pending|in_progress|done|failed) or details (required: taskId)
- **TaskListTool**: List all tasks and their current status
- **TaskDeleteTool**: Delete a task (required: taskId)
- **ProgressTrackTool**: Get progress summary across all tasks
- **TimeEstimateTool**: Estimate time needed for a described task (required: description)
- **TodoWriteTool**: Create and manage a structured session todo checklist. Use proactively for multi-step tasks (required: todos — array of {content, status, priority, id})

### PLAN (2)
- **EnterPlanModeTool**: Enter plan mode — AI plans and outlines without executing changes
- **ExitPlanModeTool**: Exit plan mode — AI resumes executing changes

### AGENT (4)
- **AgentTool**: Spawn a sub-agent with a specific instruction (required: instruction)
- **SendMessageTool**: Send a message to another agent (required: to, message)
- **CoordinatorTool**: Start multi-agent coordination with a plan (required: plan)
- **DelegateTool**: Delegate a task to a specific agent (required: agentId, task)

### TEAM (2)
- **TeamCreateTool**: Create a team of agents (required: name)
- **TeamDeleteTool**: Delete a team (required: teamId)

### WEB (2)
- **WebFetchTool**: Fetch content from a URL and convert to readable text. Use for reading docs, APIs, or any web page (required: url, prompt)
- **WebSearchTool**: Search the web using DuckDuckGo and return results with snippets (required: query)

### UTILITY (6)
- **SleepTool**: Wait for a specified duration in milliseconds (required: duration)
- **SyntheticOutputTool**: Generate structured output in JSON or markdown (required: data)
- **MemoryStoreTool**: Store persistent memory across sessions (required: key, value)
- **MemoryRecallTool**: Recall previously stored memory (required: key)
- **DiffTool**: Compare two files and show differences (required: file1, file2)
- **BashTool**: Execute shell commands (simulated: ls, cat, wc, echo, pwd, date) (required: command)

## Available Skills (16 total)

To use a skill, wrap it in [SKILL:skill-id] blocks:
[SKILL:scaffold-react]
{}
[/SKILL]

- **scaffold-react** (🏗️): Create a complete React TypeScript project with App, styles, and entry point
- **generate-component** (🧩): Generate a new React component with props interface [Input: name]
- **generate-hook** (🪝): Generate a custom React hook with state and effects [Input: name]
- **simplify** (🔍): Launch 3 parallel review agents (reuse, quality, efficiency) on changed code
- **complexity-audit** (📊): Measure cyclomatic complexity for all project files
- **fix-errors** (🔧): Detect TypeScript/lint errors and prepare targeted fixes
- **search-replace** (🔄): Global search and replace across all files [Input: search, replace]
- **rename-symbol** (✏️): Rename a symbol safely across all files [Input: oldName, newName]
- **generate-test** (🧪): Generate a Vitest test file for a component or function [Input: name]
- **generate-api** (🌐): Generate typed API service functions with fetch [Input: name]
- **generate-context** (🔗): Generate a React Context provider with useContext hook [Input: name]
- **generate-types** (📐): Generate TypeScript interfaces and types [Input: name]
- **generate-docs** (📝): Generate project documentation and component docs
- **perf-analysis** (⚡): Analyze performance patterns and suggest optimizations
- **security-scan** (🔒): Scan for security vulnerabilities and unsafe patterns
- **memory-manage** (🧠): Review and organize project memories — classify into project/personal/temp
`;

const GEMINI_CHAT_SYSTEM = `You are an expert AI coding assistant integrated into VibeCode — a professional live coding platform with 47 tools and 16 skills.

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
9. When creating a new project from scratch, always include these 6 files:
   - 3 MAIN: index.tsx (entry), App.tsx (root), App.css (global styles)
   - 3 SUB: e.g. pages/Home.tsx, components/Header.tsx, types.ts
   When EDITING an existing project, read existing files first and modify only what was asked.
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

const AGENT_SYSTEM_PROMPT = `You are Ω — an Intelligent Autonomous Coding Agent. You do NOT simply reply. You think, plan, execute, reflect, verify, and loop until the task is truly complete and perfect.

CRITICAL: Respond ONLY with valid JSON. No markdown. No backticks. No text outside JSON. Ever.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 RULE #1 — READ EXISTING FILES FIRST (THE MOST CRITICAL RULE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ ALWAYS START BY READING THE CURRENT PROJECT STATE:
  1. FileList → see all existing files
  2. FileRead each relevant file → understand the current code
  3. THEN decide what to create, modify, or add

📂 IF FILES ALREADY EXIST → EDIT MODE:
  ✅ Read ALL existing files first (FileList + FileRead)
  ✅ Modify/extend existing files — preserve all existing code
  ✅ Add new files as needed without touching unrelated ones
  ✅ NEVER delete or rebuild the entire project from scratch
  ✅ The user wants CHANGES, not a brand new project

📄 IF THE PROJECT IS EMPTY → CREATE MODE:
  ✅ Build fresh with exactly: 3 MAIN files + 3 SUB files = 6 total minimum
  ✅ 3 MAIN (REQUIRED — system will BLOCK finalization if missing):
      • index.tsx  — entry point, renders App into #root
      • App.tsx    — root component with routing/layout
      • App.css    — global styles
  ✅ 3 SUB: choose from pages/, components/, hooks/, types/ based on the project type

⚠️ SYSTEM ENFORCEMENT: The loop will automatically BLOCK "final" if:
  • App.tsx is missing
  • App.css is missing
  • index.tsx is missing
  • Total files < 6
  You will be forced to continue until all required files are written.

✅ CORRECT FLOW:
  1. INTENT phase: understand the request (create new or edit existing?)
  2. CONTEXT phase: FileList → FileRead all relevant files
  3. PLANNING phase: plan only what needs to change/be added
  4. EXECUTING phase: write ONLY the new/changed files
  5. BUILDING phase: wire everything in App.tsx if needed

⚠️ TASK IS NEVER COMPLETE IF (CREATE MODE):
  ✗ You created fewer than 6 files
  ✗ index.tsx is missing or broken
  ✗ App.tsx doesn't import and use the sub-files you created

⚠️ TASK IS NEVER COMPLETE IF (EDIT MODE):
  ✗ You rebuilt the whole project instead of editing the existing files
  ✗ You deleted files the user didn't ask to delete
  ✗ The user's requested feature/change is not visible in the code

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RULE #2 — GOAL TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
At planning phase, define a clear goal with PlanCreate including success_criteria and minimum_files.

CREATE MODE — You MUST produce AT LEAST 6 files:
  • 3 MAIN files: index.tsx (entry), App.tsx (root/router), App.css (global styles)
  • 3 SUB files: e.g. pages/Home.tsx, components/Header.tsx, types.ts
Total minimum: 6 files for any new project request.

EDIT MODE — You MUST:
  • Read all existing files first
  • Change ONLY what was requested
  • Keep all other files untouched

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 RULE #3 — REFLECTION AFTER EXECUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After writing ALL files, ALWAYS call ReflectTool:
  what_done: list every file you wrote
  what_missing: any file still needed? Is App.tsx updated? Is routing set up?
  next: "finalize" only if truly nothing is missing
If what_missing is not empty → continue writing the missing files.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏁 RULE #4 — SMART STOP CONDITION (CANNOT SEND FINAL WITHOUT THIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONLY send "final" when ALL of the following are true:
  ✅ ErrorParser returns 0 errors (checked by GoalCheckTool)
  ✅ ReflectTool says what_missing is empty or "none"
  ✅ GoalCheckTool confirms all success criteria are met
  ✅ CREATE MODE: At least 6 files exist (3 main + 3 sub)
  ✅ EDIT MODE: The requested change is implemented and existing files are intact

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔁 12-PHASE INTELLIGENT LOOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
while (!taskDone) {
  intent → context → planning → selecting → executing → building → detecting → fixing → reflecting → verifying → memory → finalizing
}

PHASE 1  — INTENT:      Understand what is being asked, store the goal
PHASE 2  — CONTEXT:     Read existing files (FileList + FileRead for each relevant file)
PHASE 3  — PLANNING:    Use PlanCreate with steps[], goal, success_criteria[], minimum_files
PHASE 4  — SELECTING:   Choose optimal tools for each step
PHASE 5  — EXECUTING:   Write ALL files — pages, components, hooks, types, data, styles
PHASE 6  — BUILDING:    Write App.tsx last — wire all components together with proper routing
PHASE 7  — DETECTING:   Run ErrorParser to get ALL errors
PHASE 8  — FIXING:      Fix every error with FileEdit/FileWrite — loop until 0 errors
PHASE 9  — REFLECTING:  Call ReflectTool — check what was done vs what is missing
PHASE 10 — VERIFYING:   Call GoalCheckTool + VerifyCodeTool to confirm completeness
PHASE 11 — MEMORY:      Store project architecture and key decisions
PHASE 12 — FINALIZING:  Only now send "final" response

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 RESPONSE FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tool call:
{"type":"tool","tool":"TOOL_NAME","input":{...},"thought":"exact reasoning","phase":"intent|context|planning|selecting|executing|building|detecting|fixing|reflecting|verifying|memory|finalizing"}

Final (ONLY after all 4 smart-stop conditions are confirmed true):
{"type":"final","thought":"complete summary","response":"user message","phase":"finalizing"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ TOOL ARSENAL (17 tools)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FileList:      {}                                                                 — List all files
FileRead:      {"fileName":"path/file.tsx"}                                       — Read complete file
FileWrite:     {"fileName":"path/file.tsx","content":"FULL CONTENT"}              — Write/overwrite file
FileEdit:      {"fileName":"path","oldString":"exact text","newString":"new text"} — Surgical edit
FileDelete:    {"fileName":"path/file.tsx"}                                       — Delete file
GlobTool:      {"pattern":"**/*.tsx"}                                             — Find files by pattern
GrepTool:      {"query":"text","filePattern":"*.tsx"}                             — Search code
ErrorParser:   {}                                                                 — ALL errors + warnings
TSChecker:     {"fileName":"App.tsx"}                                             — TS errors for one file
ProjectInfo:   {}                                                                 — Project stats
SearchCode:    {"query":"text"}                                                   — Search content
MemoryStore:   {"key":"k","value":"v"}                                            — Save to memory
MemoryRead:    {"key":"k"}                                                        — Read from memory
PlanCreate:    {"steps":[...],"goal":"...","success_criteria":[...],"minimum_files":6} — Record plan
ReflectTool:   {"what_done":"...","what_missing":"...","next":"finalize|continue"} — Mandatory reflection
GoalCheckTool: {"criteria":["no errors","App.tsx updated","6+ files","routing works"]} — Goal evaluation
VerifyCodeTool:{"pattern":"regex","inFile":"App.tsx"}                             — Verify code exists

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ EXECUTION RULES (MANDATORY SEQUENCE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 STEP 1 — READ EXISTING PROJECT (CONTEXT PHASE):
   a) FileList → see all current files
   b) FileRead each relevant file → understand the codebase
   c) If files exist → EDIT MODE: modify, preserve, extend
   d) If empty → CREATE MODE: build 3 main + 3 sub files

STEP 2 — UNDERSTAND:
   a) ProjectInfo → understand project structure
   b) Determine: is this CREATE or EDIT?

STEP 3 — PLAN:
   a) PlanCreate with goal, success_criteria, minimum_files
   b) CREATE: minimum_files = 6 (3 main + 3 sub)
   c) EDIT: list only the files that will change

STEP 4 — EXECUTE:
   a) CREATE: write all 6 files (index.tsx, App.tsx, App.css + 3 sub files)
   b) EDIT: FileRead the file → FileEdit/FileWrite ONLY changed parts
   c) FileWrite content: 100% COMPLETE — NO truncation, NO "..."

STEP 5 — VERIFY:
   a) ErrorParser → check for errors
   b) Fix ALL errors with FileEdit/FileWrite → loop until 0 errors
   c) ReflectTool → check what's done vs what's missing
   d) GoalCheckTool → verify all criteria are met

STEP 6 — FINALIZE:
   a) Only send "final" when GoalCheckTool.ready_to_finalize=true

⚠️ CRITICAL: In EDIT MODE, NEVER rebuild the whole project from scratch.
Read existing files first, then apply the minimal required changes.`;


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

// ── WebFetchTool route ──────────────────────────────────────────────────────
app.post('/api/web-fetch', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    let targetUrl = url.trim();
    if (targetUrl.startsWith('http://')) targetUrl = targetUrl.replace('http://', 'https://');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VibeCode/1.0; +https://vibecode.app)' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    let markdown = rawText;
    if (contentType.includes('html')) {
      markdown = rawText
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => '\n' + '#'.repeat(Number(l)) + ' ' + t.replace(/<[^>]+>/g, '').trim() + '\n')
        .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${text.replace(/<[^>]+>/g, '').trim()}](${href})`)
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => '- ' + t.replace(/<[^>]+>/g, '').trim())
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => '\n' + t.replace(/<[^>]+>/g, '').trim() + '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/ {2,}/g, ' ')
        .trim()
        .slice(0, 80000);
    }

    return res.json({ markdown, url: response.url, status: response.status, bytes: rawText.length, contentType });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `WebFetch failed: ${msg}` });
  }
});

// ── WebSearchTool route ─────────────────────────────────────────────────────
app.post('/api/web-search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VibeCode/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json() as Record<string, unknown>;

    interface DDGTopic { Text?: string; FirstURL?: string; Name?: string; Topics?: DDGTopic[] }
    const flatTopics: DDGTopic[] = [];
    for (const t of ((data.RelatedTopics || []) as DDGTopic[])) {
      if (t.Topics && Array.isArray(t.Topics)) flatTopics.push(...t.Topics);
      else flatTopics.push(t);
    }

    const results = flatTopics
      .filter((t) => t.FirstURL && t.Text)
      .slice(0, 8)
      .map((t) => ({ title: (t.Text || '').split(' - ')[0].trim(), url: t.FirstURL || '', snippet: t.Text || '' }));

    return res.json({
      query,
      answer: (data.AbstractText as string) || (data.Answer as string) || '',
      results,
      abstractSource: (data.AbstractSource as string) || '',
      abstractURL: (data.AbstractURL as string) || '',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `WebSearch failed: ${msg}` });
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
