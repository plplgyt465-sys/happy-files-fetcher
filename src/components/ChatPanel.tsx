import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, FilePlus, FileEdit, Cpu, Users, Wrench, CheckCircle, XCircle, Zap, Globe } from 'lucide-react';
import type { ChatMessage, AgentLog, ToolCallResult, AIProvider } from '@/hooks/useCodeStore';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  multiAgentMode?: boolean;
  onToggleMultiAgent?: (enabled: boolean) => void;
  agentProgress?: string | null;
  aiProvider?: AIProvider;
  onChangeProvider?: (provider: AIProvider) => void;
}

const AgentLogsDisplay = ({ logs }: { logs: AgentLog[] }) => (
  <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
      <Users className="w-3 h-3" />
      Agent Activity
    </div>
    {logs.map((log, i) => (
      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/30 rounded px-2 py-1">
        <span>{log.status === 'success' ? '✅' : '❌'}</span>
        <span className="font-medium text-foreground/80">{log.agent}</span>
        <span className="text-[10px]">— {log.message}</span>
        {log.filesCreated && log.filesCreated.length > 0 && (
          <span className="ml-auto text-[10px] font-mono text-primary/70">
            {log.filesCreated.join(', ')}
          </span>
        )}
      </div>
    ))}
  </div>
);

const ChatPanel = ({ messages, onSendMessage, isLoading, multiAgentMode, onToggleMultiAgent, agentProgress, aiProvider = 'official', onChangeProvider }: ChatPanelProps) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">AI Chat</span>
        {/* Provider toggle */}
        <button
          onClick={() => onChangeProvider?.(aiProvider === 'official' ? 'unofficial' : 'official')}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
            aiProvider === 'unofficial'
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'bg-primary/20 text-primary border border-primary/30'
          }`}
          title={aiProvider === 'unofficial' ? 'Unofficial Gemini (Free, No Key)' : 'Official Gemini (API Key)'}
        >
          {aiProvider === 'unofficial' ? (
            <>
              <Globe className="w-3 h-3" />
              <span>Free</span>
            </>
          ) : (
            <>
              <Zap className="w-3 h-3" />
              <span>Official</span>
            </>
          )}
        </button>
        {/* Multi-agent toggle */}
        <button
          onClick={() => onToggleMultiAgent?.(!multiAgentMode)}
          className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
            multiAgentMode
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'bg-secondary text-muted-foreground border border-border'
          }`}
          title={multiAgentMode ? '10 Agents Mode' : 'Single Agent'}
        >
          {multiAgentMode ? (
            <>
              <Users className="w-3 h-3" />
              <span>10 Agents</span>
            </>
          ) : (
            <>
              <Cpu className="w-3 h-3" />
              <span>Single</span>
            </>
          )}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className="animate-slide-in">
            <div className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'ai' ? <Bot className="w-5 h-5 text-accent shrink-0 mt-0.5" /> : <User className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
              <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${msg.role === 'user' ? 'bg-[hsl(var(--chat-user))] text-foreground' : 'bg-[hsl(var(--chat-ai))] text-foreground'}`}>
                {msg.content && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                  </p>
                )}
                {msg.fileOps && msg.fileOps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {msg.fileOps.map((op, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1">
                        {op.type === 'create' ? (
                          <FilePlus className="w-3 h-3 text-success" />
                        ) : (
                          <FileEdit className="w-3 h-3 text-warning" />
                        )}
                        <span className="font-mono">{op.filename}</span>
                        <span className="ml-auto text-[10px]">{op.type === 'create' ? 'Created' : 'Updated'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.agentLogs && msg.agentLogs.length > 0 && (
                  <AgentLogsDisplay logs={msg.agentLogs} />
                )}
                {msg.toolResults && msg.toolResults.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                      <Wrench className="w-3 h-3" />
                      Tool Calls
                    </div>
                    {msg.toolResults.map((tr, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/30 rounded px-2 py-1">
                        {tr.success ? <CheckCircle className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-destructive" />}
                        <span className="font-mono text-[10px] text-foreground/80">{tr.tool}</span>
                        {tr.duration != null && <span className="ml-auto text-[9px]">{tr.duration}ms</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex flex-col gap-1.5 text-muted-foreground text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{agentProgress || 'Thinking...'}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={multiAgentMode ? "Ask 10 agents to build something..." : "Ask to create code, edit a file..."}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            disabled={isLoading}
          />
          <button onClick={handleSend} className="text-primary hover:text-primary/80 transition-colors disabled:opacity-50" disabled={isLoading || !input.trim()}>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
