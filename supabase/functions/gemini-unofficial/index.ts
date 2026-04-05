import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BARD_URL =
  "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";

const BARD_HEADERS: Record<string, string> = {
  accept: "*/*",
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
  "x-same-domain": "1",
  cookie: "",
};

// ---------- payload / parse helpers ----------

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

  return (
    new URLSearchParams({ "f.req": JSON.stringify(outer) }).toString() + "&"
  );
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
        entries = (data as unknown[][]).filter(
          (i) => Array.isArray(i) && i[0] === "wrb.fr"
        );
      }
    }

    for (const entry of entries) {
      try {
        const inner = JSON.parse(entry[2] as string);
        if (
          Array.isArray(inner) &&
          Array.isArray((inner as unknown[])[4])
        ) {
          for (const c of (inner as unknown[])[4] as unknown[][]) {
            if (Array.isArray(c) && Array.isArray(c[1])) {
              const txt = (c[1] as unknown[])
                .filter((t) => typeof t === "string")
                .join("");
              if (txt.length > best.length) best = txt;
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

// ---------- tool / skill descriptions ----------

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

// ---------- main handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, files, mode, history } = await req.json();
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build file context
    let filesContext = "";
    if (Array.isArray(files)) {
      for (const f of files) {
        filesContext += `\n--- ${f.name} ---\n${f.content}\n`;
      }
    }

    // Build conversation context from history
    let conversationContext = "";
    if (Array.isArray(history) && history.length > 0) {
      const recent = history.slice(-10);
      conversationContext = "\n## Recent Conversation:\n";
      for (const msg of recent) {
        const role = msg.role === "ai" ? "Assistant" : "User";
        conversationContext += `${role}: ${msg.content}\n\n`;
      }
    }

    // Build the full prompt for the unofficial API
    const modePrefix = mode ? `[MODE: ${mode}]\n` : "";
    let fullPrompt = SYSTEM_PROMPT + "\n";

    if (conversationContext) {
      fullPrompt += conversationContext + "\n";
    }

    if (filesContext) {
      fullPrompt += `--- CURRENT PROJECT FILES ---\n${filesContext}\n--- END FILES ---\n\n`;
    }

    fullPrompt += `${modePrefix}User request: ${prompt}`;

    // Call unofficial Gemini endpoint (no cookie needed)
    const payload = buildPayload(fullPrompt);

    const res = await fetch(BARD_URL, {
      method: "POST",
      headers: BARD_HEADERS,
      body: payload,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Unofficial Gemini error:", res.status, errText);
      return new Response(
        JSON.stringify({ error: `Unofficial Gemini returned status ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawText = await res.text();
    const reply = parseResponse(rawText) || "[No response from Gemini]";

    // Extract diagnostics if present
    let diagnostics = null;
    const diagMatch = reply.match(
      /\[DIAGNOSTICS\]\n([\s\S]*?)\n\[\/DIAGNOSTICS\]/
    );
    if (diagMatch) {
      try {
        diagnostics = JSON.parse(diagMatch[1]);
      } catch {
        /* ignore */
      }
    }

    return new Response(JSON.stringify({ reply, diagnostics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
