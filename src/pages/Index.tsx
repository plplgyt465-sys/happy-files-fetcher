import { useState, useCallback } from 'react';
import { Code2, PanelLeftClose, PanelLeftOpen, FolderTree, Wrench } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';
import FileTabs from '@/components/FileTabs';
import CodeEditor from '@/components/CodeEditor';
import LivePreview from '@/components/LivePreview';
import FileExplorer from '@/components/FileExplorer';
import DependencyManager from '@/components/DependencyManager';
import VersionBar from '@/components/VersionBar';
import ConsolePanel from '@/components/ConsolePanel';
import ToolsPanel from '@/components/ToolsPanel';
import { useCodeStore } from '@/hooks/useCodeStore';
import { useToolSystem } from '@/hooks/useToolSystem';
import { useSkillSystem } from '@/hooks/useSkillSystem';
import type { ErrorDetails } from '@/components/LivePreview';

const Index = () => {
  const {
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
    versionControl,
    handleUndo,
    handleRedo,
    dependencies,
    addDependency,
    removeDependency,
    startNewProject,
  } = useCodeStore();

  const [chatOpen, setChatOpen] = useState(true);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<ErrorDetails[]>([]);

  // Tool system
  const toolSystem = useToolSystem(
    files,
    updateFileContent,
    addFile,
    deleteFile,
    diagnostics,
  );

  // Skill system
  const skillSystem = useSkillSystem(toolSystem.executeTool);

  // Compute error line for current file
  const currentErrorLine = errorLine && activeFile && errorLine.file === activeFile.name ? errorLine.line : null;

  // Track runtime errors from preview
  const handlePreviewError = useCallback((error: string) => {
    // Runtime errors are tracked via message events in LivePreview
  }, []);

  // Navigate to error location
  const handleGoToError = useCallback((fileName: string, line: number) => {
    const file = files.find(f => f.name === fileName);
    if (file) {
      setActiveFileId(file.id);
    }
  }, [files, setActiveFileId]);

  // Execute a skill from the UI
  const handleExecuteSkill = useCallback((skillId: string) => {
    const result = skillSystem.executeSkill(skillId);
    // Could show a toast or log result
    console.log('Skill result:', result);
  }, [skillSystem]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Chat Sidebar */}
      {chatOpen && (
        <div className="w-80 min-w-[280px] shrink-0">
          <ChatPanel
            messages={chatMessages}
            onSendMessage={sendMessage}
            isLoading={isAiLoading}
            multiAgentMode={multiAgentMode}
            onToggleMultiAgent={setMultiAgentMode}
            agentProgress={agentProgress}
            agentCurrentState={agentCurrentState}
            agentSteps={agentSteps}
            aiProvider={aiProvider}
            onChangeProvider={setAiProvider}
          />
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={chatOpen ? 'Hide chat' : 'Show chat'}
          >
            {chatOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setExplorerOpen(!explorerOpen)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={explorerOpen ? 'Hide explorer' : 'Show explorer'}
          >
            <FolderTree className="w-4 h-4" />
          </button>
          <button
            onClick={() => setToolsPanelOpen(!toolsPanelOpen)}
            className={`p-1.5 rounded-md transition-colors ${
              toolsPanelOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title={toolsPanelOpen ? 'Hide tools' : 'Show tools & skills'}
          >
            <Wrench className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={startNewProject}
              className="rounded-md border border-border bg-secondary px-3 py-1 text-xs text-foreground hover:bg-secondary/80 transition-colors"
              title="Start a new empty project"
            >
              مشروع جديد
            </button>
            <Code2 className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-foreground tracking-tight">VibeCode</span>
            <span className="text-xs text-muted-foreground">Platform</span>

            {/* Stats badges */}
            <div className="flex items-center gap-1 text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
              {toolSystem.toolCount} Tools
            </span>
            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
              {skillSystem.skillCount} Skills
            </span>
            {diagnostics.filter(d => d.severity === 'error').length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
                {diagnostics.filter(d => d.severity === 'error').length} errors
              </span>
            )}
            {diagnostics.filter(d => d.severity === 'warning').length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">
                {diagnostics.filter(d => d.severity === 'warning').length} warnings
              </span>
            )}
          </div>
          </div>
        </div>

        {/* Editor + Preview */}
        <div className="flex-1 flex min-h-0">
          {/* File Explorer */}
          {explorerOpen && (
            <div className="w-48 min-w-[180px] shrink-0 border-r border-border flex flex-col">
              <FileExplorer
                files={files}
                activeFileId={activeFileId}
                onSelectFile={setActiveFileId}
                onAddFile={addFile}
                onDeleteFile={deleteFile}
                onRenameFile={renameFile}
              />
              <DependencyManager
                dependencies={dependencies}
                onAddDependency={addDependency}
                onRemoveDependency={removeDependency}
              />
              {/* Tools Panel below explorer */}
              {toolsPanelOpen && (
                <ToolsPanel
                  tools={toolSystem.tools}
                  skills={skillSystem.skills}
                  toolCount={toolSystem.toolCount}
                  skillCount={skillSystem.skillCount}
                  onExecuteSkill={handleExecuteSkill}
                />
              )}
            </div>
          )}

          {/* Editor */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border">
            <FileTabs
              files={files}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              onAddFile={addFile}
              onDeleteFile={deleteFile}
            />
            <div className="flex-1 min-h-0">
              {activeFile ? (
                <CodeEditor
                  content={activeFile.content}
                  language={activeFile.language}
                  onChange={(c) => updateFileContent(activeFile.id, c)}
                  errorLine={currentErrorLine}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 select-none">
                  <Code2 className="w-12 h-12 opacity-20" />
                  <p className="text-sm opacity-50">المشروع فارغ — اطلب من الذكاء الاصطناعي بناء مشروع</p>
                </div>
              )}
            </div>
            <VersionBar
              canUndo={versionControl.canUndo}
              canRedo={versionControl.canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              history={versionControl.history}
              currentIndex={versionControl.currentIndex}
            />
            {/* Console / Problems Panel */}
            <ConsolePanel
              diagnostics={diagnostics}
              runtimeErrors={runtimeErrors}
              onGoToError={handleGoToError}
            />
          </div>

          {/* Preview */}
          <div className="flex-1 min-w-0">
            <LivePreview
              files={files}
              onAutoFix={autoFixError}
              isFixing={isAiLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;