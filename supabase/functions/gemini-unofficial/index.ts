import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BARD_URL = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";

const BARD_HEADERS: Record<string, string> = {
  accept: "*/*",
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
  "x-same-domain": "1",
  cookie: "",
};

type ChatHistoryMessage = { role: string; content: string };
type ProjectFile = { name: string; content: string };
type Diagnostic = {
  file?: string;
  line?: number;
  column?: number;
  message?: string;
  type?: string;
  severity?: string;
};

type RequestBody = {
  action?: "chat" | "agent-think" | "web-search" | "web-fetch";
  prompt?: string;
  files?: ProjectFile[];
  mode?: string;
  history?: ChatHistoryMessage[];
  messages?: ChatHistoryMessage[];
  diagnostics?: Diagnostic[];
  provider?: string;
  url?: string;
  query?: string;
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPayload(prompt: string): string {
  const inner = [
    [prompt, 0, null, null, null, null, 0],
    ["en-US"],
    ["", "", "", null, null, null, null, null, null, ""],
    "",
    "",
    null,
    [0],
    1,
    null,
    null,
    1,
    0,
    null,
    null,
    null,
    null,
    null,
    [[0]],
    0,
  ];

  const outer = [null, JSON.stringify(inner)];
  return new URLSearchParams({ "f.req": JSON.stringify(outer) }).toString() + "&";
}

function parseResponse(text: string): string {
  text = text.replace(")]}'", "");
  let best = "";

  for (const line of text.split("\n")) {
    if (!line.includes("wrb.fr")) continue;

    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }

    let entries: unknown[][] = [];
    if (Array.isArray(data)) {
      if ((data as unknown[])[0] === "wrb.fr") {
        entries = [data as unknown[]];
      } else {
        entries = (data as unknown[][]).filter((item) => Array.isArray(item) && item[0] === "wrb.fr");
      }
    }

    for (const entry of entries) {
      try {
        const inner = JSON.parse(entry[2] as string);
        if (Array.isArray(inner) && Array.isArray((inner as unknown[])[4])) {
          for (const candidate of (inner as unknown[])[4] as unknown[][]) {
            if (Array.isArray(candidate) && Array.isArray(candidate[1])) {
              const textValue = (candidate[1] as unknown[])
                .filter((part) => typeof part === "string")
                .join("");

              if (textValue.length > best.length) best = textValue;
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  return best.trim();
}

async function callUnofficialGemini(prompt: string): Promise<string> {
  const response = await fetch(BARD_URL, {
    method: "POST",
    headers: BARD_HEADERS,
    body: buildPayload(prompt),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Unofficial Gemini error:", response.status, errorText);
    throw new Error(`Unofficial Gemini returned status ${response.status}`);
  }

  const rawText = await response.text();
  return parseResponse(rawText) || "[No response from Gemini]";
}

function buildFilesContext(files?: ProjectFile[]): string {
  if (!Array.isArray(files) || files.length === 0) return "";
  return files.map((file) => `\n--- ${file.name} ---\n${file.content}\n`).join("");
}

function buildConversationContext(history?: ChatHistoryMessage[]): string {
  if (!Array.isArray(history) || history.length === 0) return "";

  const recent = history.slice(-10);
  let conversationContext = "\n## Recent Conversation:\n";

  for (const msg of recent) {
    const role = msg.role === "ai" ? "Assistant" : "User";
    conversationContext += `${role}: ${msg.content}\n\n`;
  }

  return conversationContext;
}

function extractDiagnostics(reply: string): unknown {
  const diagMatch = reply.match(/\[DIAGNOSTICS\]\n([\s\S]*?)\n\[\/DIAGNOSTICS\]/);
  if (!diagMatch) return null;

  try {
    return JSON.parse(diagMatch[1]);
  } catch {
    return null;
  }
}

function parseAgentDecision(rawReply: string) {
  try {
    let cleaned = rawReply.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);

    return JSON.parse(cleaned);
  } catch {
    const fileRegex = /\[FILE:([\w.\-/]+)\]\n([\s\S]*?)\n?\[\/FILE\]/g;
    const files: { name: string; content: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = fileRegex.exec(rawReply)) !== null) {
      files.push({ name: match[1].trim(), content: match[2] });
    }

    const text = rawReply.replace(/\[FILE:[\w.\-/]+\][\s\S]*?\[\/FILE\]/g, "").trim();

    return {
      type: "final",
      thought: "Completed",
      response: text || rawReply.slice(0, 500),
      files,
    };
  }
}

const TOOL_DESCRIPTIONS = `
## Available Tools (44 total)

To use a tool, wrap it in [TOOL_CALL:ToolName] blocks with JSON input:
[TOOL_CALL:FileReadTool]
{"fileName": "App.tsx"}
[/TOOL_CALL]

### FILE (8)
- **FileReadTool**: Read content of a file (required: fileName)
- **FileWriteTool**: Create or overwrite a file (required: fileName, content)
- **FileEditTool**: Edit file by replacing a string (required: fileName, oldString, newString)
- **FileDeleteTool**: Delete a file (required: fileName)
- **FileRenameTool**: Rename a file (required: oldName, newName)
- **FileCopyTool**: Copy a file (required: source, destination)
- **FileMoveTool**: Move a file (required: oldName, newName)
- **FileInfoTool**: Get metadata about a file (required: fileName)

### SEARCH (6)
- **GlobTool**: Find files matching a glob pattern (required: pattern)
- **GrepTool**: Search for text across files (required: query)
- **SearchReplaceTool**: Search and replace across files (required: search, replace)
- **FindSymbolTool**: Find where a symbol is defined (required: symbol)
- **FindReferencesTool**: Find all references to a symbol (required: symbol)
- **ToolSearchTool**: Search for available tools

### ANALYSIS (5)
- **ErrorParserTool**: Get all current diagnostics
- **TSCheckerTool**: Check a file for TypeScript issues (required: fileName)
- **ProjectInfoTool**: Get project overview
- **DependencyAnalyzerTool**: Analyze import graph
- **UnusedCodeTool**: Find unused exports

### CODE (5)
- **LSPTool**: Language server operations (required: fileName, operation, line)
- **CodeComplexityTool**: Calculate complexity (required: fileName)
- **CodeFormatterTool**: Format code (required: fileName)
- **SnippetGeneratorTool**: Generate code snippets (required: type, name)
- **NotebookEditTool**: Edit a notebook cell (required: fileName, cellIndex, content)

### TASK (6)
- **TaskCreateTool**: Create a new task (required: title)
- **TaskUpdateTool**: Update a task (required: taskId)
- **TaskListTool**: List all tasks
- **TaskDeleteTool**: Delete a task (required: taskId)
- **ProgressTrackTool**: Get progress across tasks
- **TimeEstimateTool**: Estimate time (required: description)

### PLAN (2)
- **EnterPlanModeTool**: Enter plan mode
- **ExitPlanModeTool**: Exit plan mode

### AGENT (4)
- **AgentTool**: Spawn a sub-agent (required: instruction)
- **SendMessageTool**: Send a message to another agent (required: to, message)
- **CoordinatorTool**: Start multi-agent coordination (required: plan)
- **DelegateTool**: Delegate a task (required: agentId, task)

### TEAM (2)
- **TeamCreateTool**: Create a team (required: name)
- **TeamDeleteTool**: Delete a team (required: teamId)

### UTILITY (6)
- **SleepTool**: Wait for a duration
- **SyntheticOutputTool**: Generate structured output (required: data)
- **MemoryStoreTool**: Store persistent memory (required: key, value)
- **MemoryRecallTool**: Recall stored memory (required: key)
- **DiffTool**: Compare two files (required: file1, file2)
- **BashTool**: Execute shell commands (required: command)

## Available Skills (16 total)

Use [SKILL:skill-id] blocks:
- **scaffold-react**: Create React project scaffold
- **generate-component**: Generate a React component [Input: name]
- **generate-hook**: Generate a custom hook [Input: name]
- **code-review**: Full code review
- **complexity-audit**: Measure complexity
- **fix-errors**: Detect & fix errors
- **search-replace**: Global search & replace [Input: search, replace]
- **rename-symbol**: Rename a symbol [Input: oldName, newName]
- **generate-test**: Generate a test file [Input: name]
- **generate-api**: Generate API functions [Input: name]
- **generate-context**: Generate Context provider [Input: name]
- **generate-types**: Generate TypeScript types [Input: name]
- **generate-docs**: Generate docs
- **perf-analysis**: Analyze performance
- **security-scan**: Scan for security issues
- **memory-manage**: Store & recall memories
`;

const SYSTEM_PROMPT = `You are an expert AI vibe coding agent integrated into VibeCode — a professional live coding platform with 44 tools and 16 skills.

## YOUR ROLE
You are an autonomous coding agent. You can:
1. Create, edit, and manage files in the project
2. Use tools to analyze code, find errors, search patterns
3. Execute skills for complex multi-step workflows
4. Coordinate with sub-agents for large tasks
5. Remember context across the conversation

## MODES
- CREATE: Build new features/projects from scratch
- EDIT: Modify existing files with minimal changes
- FIX: Fix specific errors

## CRITICAL RULES
1. ALL projects MUST use React with TypeScript (.tsx files).
2. When creating or editing code, respond with file blocks:
[FILE:filename.ext]
(full file content)
[/FILE]
3. You can include multiple [FILE] blocks.
4. Always write COMPLETE file contents, not partial snippets.
5. Respond in the same language the user writes in.
6. Use React hooks and functional components only.
7. Import React at the top of every .tsx file.
8. Do NOT escape normal code characters with markdown backslashes.

${TOOL_DESCRIPTIONS}

## TOOL USAGE
Call tools with [TOOL_CALL:ToolName] blocks. Use multiple tool calls per response.

## SKILL USAGE
Skills are pre-built workflows. Use [SKILL:skill-id] blocks.

## AGENTIC BEHAVIOR
- When given a complex task, break it down into steps
- Use tools proactively to understand the codebase before making changes
- After making changes, use ErrorParserTool to verify no errors
- Use MemoryStoreTool to remember important context

## SAFETY RULES
- Do NOT duplicate component declarations
- Do NOT redeclare variables that already exist
- Do NOT break existing imports
- Do NOT delete files unless asked
- In FIX mode: modify ONLY the broken file(s)
- In EDIT mode: modify ONLY the requested file(s)
- ALWAYS preserve existing functionality

## DEPENDENCY SYSTEM
Use CDN imports: import axios from "https://esm.sh/axios"

## STRUCTURED RESPONSE
After explanation and [FILE:] blocks, if there are issues:
[DIAGNOSTICS]
{"errors": [{"file": "App.tsx", "line": 12, "message": "description", "type": "SyntaxError"}]}
[/DIAGNOSTICS]
`;

const AGENT_SYSTEM_PROMPT = `You are Ω — an Intelligent Autonomous Coding Agent. You do NOT simply reply. You think, plan, execute, reflect, verify, and loop until the task is truly complete and perfect.

CRITICAL: Respond ONLY with valid JSON. No markdown. No backticks. No text outside JSON. Ever.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 RULE #0 — PHASE LOCK (HIGHEST PRIORITY — NEVER VIOLATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The task has 3 STRICT phases. You must advance through them IN ORDER:

  PHASE 1 — PLANNING (context + plan + todo):
    Allowed: FileList, FileRead, ProjectInfo, PlanCreate, TodoWriteTool, MemoryRead
    ❌ NOT allowed: FileWrite, FileEdit, FileCreate

  PHASE 2 — EXECUTION (write files):
    Allowed: FileWrite, FileEdit, FileCreate, FileRead, GrepTool, GlobTool, TSChecker, ErrorParser
    ❌ PERMANENTLY BLOCKED: PlanCreate, TodoWriteTool
    → You may NOT call PlanCreate or TodoWriteTool in this phase. EVER.

  PHASE 3 — VERIFY (check + finalize):
    Allowed: TSChecker, ErrorParser, ReflectTool, GoalCheckTool, VerifyCodeTool
    → Send "final" only after GoalCheckTool confirms ready_to_finalize=true

HARD RULES (the loop enforces these — violations are auto-blocked):
  ❌ PlanCreate may be called AT MOST ONCE. After that it is blocked forever.
  ❌ TodoWriteTool may be called AT MOST ONCE. After that it is blocked forever.
  ✅ After calling PlanCreate AND TodoWriteTool → you MUST immediately call FileWrite.
  ✅ If you try to call PlanCreate or TodoWriteTool a second time → call FileWrite instead.
  ✅ "Planning is done" means you must START WRITING FILES — no exceptions.

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
🗂️ TOOL CATEGORIES (route by category first, then pick specific tool)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before picking a tool, identify which CATEGORY the task belongs to:

  📂 FILE      → FileList, FileRead, FileWrite, FileEdit, FileDelete
  🔍 SEARCH    → GlobTool, GrepTool, SearchCode
  📊 ANALYSIS  → ErrorParser, TSChecker, ProjectInfo
  🌐 WEB       → WebFetchTool, WebSearchTool
  📋 PLANNING  → PlanCreate, TodoWriteTool
  🧠 MEMORY    → MemoryStore, MemoryRead
  🔁 WORKFLOW  → ReflectTool, GoalCheckTool, VerifyCodeTool

ROUTING RULES:
  1. Need to understand existing code?    → FILE category (FileList → FileRead)
  2. Need to find something in code?      → SEARCH category (GrepTool / GlobTool)
  3. Need to check errors or quality?     → ANALYSIS category (ErrorParser / TSChecker)
  4. Need info from the internet?         → WEB category (WebSearchTool first, WebFetchTool for specific URL)
  5. Starting a multi-step task?          → PLANNING category (PlanCreate + TodoWriteTool MANDATORY)
  6. Need to recall context?              → MEMORY category (MemoryRead before MemoryStore)
  7. Done writing files?                  → WORKFLOW category (ReflectTool → GoalCheckTool → VerifyCodeTool)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ TOOL ARSENAL (20 tools)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 FILE TOOLS:
FileList:      {}                                                                 — List all files
FileRead:      {"fileName":"path/file.tsx"}                                       — Read complete file
FileWrite:     {"fileName":"path/file.tsx","content":"FULL CONTENT"}              — Write/overwrite file
FileEdit:      {"fileName":"path","oldString":"exact text","newString":"new text"} — Surgical edit
FileDelete:    {"fileName":"path/file.tsx"}                                       — Delete file

🔍 SEARCH TOOLS:
GlobTool:      {"pattern":"**/*.tsx"}                                             — Find files by pattern
GrepTool:      {"query":"text","filePattern":"*.tsx"}                             — Search code
SearchCode:    {"query":"text"}                                                   — Search content

📊 ANALYSIS TOOLS:
ErrorParser:   {}                                                                 — ALL errors + warnings
TSChecker:     {"fileName":"App.tsx"}                                             — TS errors for one file
ProjectInfo:   {}                                                                 — Project stats

🌐 WEB TOOLS:
WebSearchTool: {"query":"search terms"}                                           — DuckDuckGo search
WebFetchTool:  {"url":"https://...","prompt":"what to extract"}                   — Fetch + parse URL

📋 PLANNING TOOLS:
PlanCreate:    {"steps":[...],"goal":"...","success_criteria":[...],"minimum_files":6} — Record plan
TodoWriteTool: {"todos":[{"id":"1","content":"step","status":"pending","priority":"high"},...]} — Session checklist

🧠 MEMORY TOOLS:
MemoryStore:   {"key":"k","value":"v"}                                            — Save to memory
MemoryRead:    {"key":"k"}                                                        — Read from memory

🔁 WORKFLOW TOOLS:
ReflectTool:   {"what_done":"...","what_missing":"...","next":"finalize|continue"} — Mandatory reflection
GoalCheckTool: {"criteria":["no errors","App.tsx updated","6+ files","routing works"]} — Goal evaluation
VerifyCodeTool:{"pattern":"regex","inFile":"App.tsx"}                             — Verify code exists

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 MANDATORY TOOL USAGE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These rules are ENFORCED — never skip them:

  ❌ NEVER guess what a file contains — ALWAYS use FileRead first
  ❌ NEVER use FileEdit without reading the file first with FileRead
  ❌ NEVER assume a file exists — use FileList or GlobTool to verify
  ✅ ALWAYS run TSChecker on every file you write or edit
  ✅ ALWAYS run ErrorParser after a batch of file writes
  ✅ ALWAYS use TodoWriteTool for any task with 3+ steps (MANDATORY)
  ✅ ALWAYS call ReflectTool after finishing all file writes
  ✅ ALWAYS call GoalCheckTool before sending "final"
  ✅ Every new file MUST be imported and used — no orphan files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 TODOWRITETOOL — MANDATORY FOR MULTI-STEP TASKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For any task with 3 or more steps, you MUST create a todo list BEFORE execution:

{"type":"tool","tool":"TodoWriteTool","input":{"todos":[
  {"id":"1","content":"Read existing files","status":"in_progress","priority":"high"},
  {"id":"2","content":"Write component files","status":"pending","priority":"high"},
  {"id":"3","content":"Wire into App.tsx","status":"pending","priority":"high"},
  {"id":"4","content":"Run ErrorParser + fix","status":"pending","priority":"medium"},
  {"id":"5","content":"Reflect + verify","status":"pending","priority":"medium"}
]},"thought":"Creating session checklist before execution","phase":"planning"}

Update the todo list status as you progress (in_progress → done).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 WEB TOOL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When using WebSearchTool or WebFetchTool:
  1. WebSearchTool first — get relevant URLs
  2. WebFetchTool specific URL — extract only the relevant content
  3. NEVER dump raw web content into code
  4. ALWAYS: Extract → Summarize → Convert to actionable steps
  5. ALWAYS: Integrate fetched information into the project (store in MemoryStore if useful)
  6. Rule: "Fetched data is useless unless it becomes project knowledge"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 INTEGRATION RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every file you create MUST be:
  ✅ Imported somewhere (at minimum in App.tsx)
  ✅ Actually used (rendered or called — not just imported)
  ✅ Connected to the application flow

Orphan files (created but never imported) = INCOMPLETE task.
After writing sub-files, ALWAYS update App.tsx to import and render them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ SMART EXECUTION STRATEGY (MANDATORY SEQUENCE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 STEP 1 — INTENT: Understand the request category (CREATE / EDIT / FIX / FETCH)

📂 STEP 2 — CONTEXT (FILE category):
   a) FileList → see all current files
   b) FileRead each relevant file → understand the codebase
   c) If files exist → EDIT MODE; if empty → CREATE MODE

📋 STEP 3 — PLAN + TODO (PLANNING category — MANDATORY for 3+ steps):
   a) PlanCreate with goal, success_criteria, minimum_files
   b) TodoWriteTool with all steps (REQUIRED for multi-step tasks)
   c) CREATE: minimum_files = 6 (3 main + 3 sub)

⚙️ STEP 4 — EXECUTE step-by-step (FILE category):
   a) CREATE: write all 6+ files (index.tsx, App.tsx, App.css + sub files)
   b) EDIT: FileRead → FileEdit/FileWrite ONLY changed parts
   c) FileWrite content: 100% COMPLETE — NO truncation, NO "..."
   d) After EACH file written: update TodoWriteTool (mark step done)
   e) After EACH file written: run TSChecker on that file

🔗 STEP 5 — WIRE (Integration Rule):
   a) Update App.tsx to import + use all new components
   b) VerifyCodeTool — confirm imports exist in App.tsx

🔁 STEP 6 — REFLECT + VERIFY (WORKFLOW category):
   a) ErrorParser → get all errors
   b) Fix ALL errors with FileEdit → loop until 0 errors
   c) ReflectTool → what was done vs what is missing
   d) GoalCheckTool → verify all criteria met

🏁 STEP 7 — FINALIZE:
   a) Only send "final" when GoalCheckTool.ready_to_finalize=true
   b) TodoWriteTool — mark all steps as "done"

⚠️ CRITICAL: In EDIT MODE, NEVER rebuild the whole project from scratch.
Read existing files first, then apply the minimal required changes.`;

async function handleChat(body: RequestBody): Promise<Response> {
  if (!body.prompt) {
    return jsonResponse({ error: "prompt is required" }, 400);
  }

  const filesContext = buildFilesContext(body.files);
  const conversationContext = buildConversationContext(body.history);
  const modePrefix = body.mode ? `[MODE: ${body.mode}]\n` : "";

  let fullPrompt = SYSTEM_PROMPT + "\n";

  if (conversationContext) fullPrompt += conversationContext + "\n";
  if (filesContext) fullPrompt += `--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\n`;
  fullPrompt += `${modePrefix}User request: ${body.prompt}`;

  const reply = await callUnofficialGemini(fullPrompt);
  return jsonResponse({ reply, diagnostics: extractDiagnostics(reply) });
}

async function handleAgentThink(body: RequestBody): Promise<Response> {
  if (!Array.isArray(body.messages)) {
    return jsonResponse({ error: "messages array is required" }, 400);
  }

  const filesContext = Array.isArray(body.files)
    ? body.files.map((file) => `--- ${file.name} ---\n${file.content}`).join("\n\n")
    : "";

  const errorsContext = Array.isArray(body.diagnostics) && body.diagnostics.length > 0
    ? `\nCURRENT ERRORS:\n${JSON.stringify(body.diagnostics.slice(0, 10), null, 2)}`
    : "";

  const projectContext = filesContext
    ? `\nPROJECT FILES:\n${filesContext}${errorsContext}`
    : errorsContext;

  const systemWithContext = AGENT_SYSTEM_PROMPT + projectContext;
  const conversationText = body.messages
    .map((message) => `${message.role === "user" ? "User" : "Agent"}: ${message.content}`)
    .join("\n\n");

  const fullPrompt = `${systemWithContext}\n\n${conversationText}\n\nAgent:`;
  const rawReply = await callUnofficialGemini(fullPrompt);
  return jsonResponse(parseAgentDecision(rawReply));
}

async function handleWebFetch(body: RequestBody): Promise<Response> {
  if (!body.url) {
    return jsonResponse({ error: "url is required" }, 400);
  }

  let targetUrl = body.url.trim();
  if (targetUrl.startsWith("http://")) targetUrl = targetUrl.replace("http://", "https://");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VibeCode/1.0; +https://vibecode.app)" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    let markdown = rawText;
    if (contentType.includes("html")) {
      markdown = rawText
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => `\n${"#".repeat(Number(level))} ${String(text).replace(/<[^>]+>/g, "").trim()}\n`)
        .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${String(text).replace(/<[^>]+>/g, "").trim()}](${href})`)
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => `- ${String(text).replace(/<[^>]+>/g, "").trim()}`)
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => `\n${String(text).replace(/<[^>]+>/g, "").trim()}\n`)
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/ {2,}/g, " ")
        .trim()
        .slice(0, 80000);
    }

    return jsonResponse({
      markdown,
      url: response.url,
      status: response.status,
      bytes: rawText.length,
      contentType,
    });
  } catch (err) {
    return jsonResponse({ error: `WebFetch failed: ${String(err)}` }, 502);
  }
}

async function handleWebSearch(body: RequestBody): Promise<Response> {
  if (!body.query) {
    return jsonResponse({ error: "query is required" }, 400);
  }

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(body.query)}&format=json&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(ddgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VibeCode/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json() as Record<string, unknown>;

    interface DDGTopic {
      Text?: string;
      FirstURL?: string;
      Topics?: DDGTopic[];
    }

    const flatTopics: DDGTopic[] = [];
    for (const topic of ((data.RelatedTopics || []) as DDGTopic[])) {
      if (Array.isArray(topic.Topics)) flatTopics.push(...topic.Topics);
      else flatTopics.push(topic);
    }

    const results = flatTopics
      .filter((topic) => topic.FirstURL && topic.Text)
      .slice(0, 8)
      .map((topic) => ({
        title: (topic.Text || "").split(" - ")[0].trim(),
        url: topic.FirstURL || "",
        snippet: topic.Text || "",
      }));

    return jsonResponse({
      query: body.query,
      answer: (data.AbstractText as string) || (data.Answer as string) || "",
      results,
      abstractSource: (data.AbstractSource as string) || "",
      abstractURL: (data.AbstractURL as string) || "",
    });
  } catch (err) {
    return jsonResponse({ error: `WebSearch failed: ${String(err)}` }, 502);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as RequestBody;
    const action = body.action || "chat";

    if (action === "agent-think") return await handleAgentThink(body);
    if (action === "web-fetch") return await handleWebFetch(body);
    if (action === "web-search") return await handleWebSearch(body);
    return await handleChat(body);
  } catch (err) {
    console.error("Function error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
