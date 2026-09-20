import React, { useState } from 'react';
import { Plus, Search, BookOpen, Download, ChevronDown, X, Presentation, Sparkles, FileDown, ShoppingBag } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import NotebookCellComponent from './NotebookCell';
import LlmSettingsPanel from '../shared/LlmSettingsPanel';

export default function Notebook({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const notebooks = useAppStore(s => s.notebooks);
  const activeNotebookId = useAppStore(s => s.activeNotebookId);
  const activeNotebook = notebooks.find(n => n.id === activeNotebookId) || notebooks[0];
  const cells = activeNotebook.cells;

  // Executive Metrics computation for Storytelling Dashboard
  const totalInsightsCount = cells.filter(c => !!c.insights).length;
  const totalVisualizationsCount = cells.filter(c => c.showViz || c.viewMode === 'chart').length;
  const totalSuccessCount = cells.filter(c => c.queryResult && !c.lastActiveError).length;
  const activeConnection = useAppStore(s => {
    const conn = s.connections.find(c => c.id === s.activeConnectionId);
    return conn ? conn.dialect.toUpperCase() : 'None';
  });

  const addNotebook = useAppStore(s => s.addNotebook);
  const removeNotebook = useAppStore(s => s.removeNotebook);
  const setActiveNotebook = useAppStore(s => s.setActiveNotebook);
  const renameNotebook = useAppStore(s => s.renameNotebook);

  const addCell = useAppStore(s => s.addCell);
  const moveCell = useAppStore(s => s.moveCell);
  const exportNotebook = useAppStore(s => s.exportNotebook);
  const exportDashboard = useAppStore(s => s.exportDashboard);
  const dashboardMode = useAppStore(s => s.dashboardMode);
  const setDashboardMode = useAppStore(s => s.setDashboardMode);
  const setShowNichePlanner = useAppStore(s => s.setShowNichePlanner);
  const setShowMarketplaceModal = useAppStore(s => s.setShowMarketplaceModal);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'before' | 'after' | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId === id) {
      setDragOverId(null);
      return;
    }
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDragPosition(y < rect.height / 2 ? 'before' : 'after');
    setDragOverId(id);
  };

  const handleDragLeave = (_e: React.DragEvent, id: string) => {
    if (dragOverId === id) {
      setTimeout(() => {
        setDragOverId(null);
        setDragPosition(null);
      }, 50);
    }
  };

  const handleDrop = (e: React.DragEvent, dropId: string) => {
    e.preventDefault();
    if (draggedId !== null && draggedId !== dropId && dragPosition) {
      moveCell(draggedId, dropId, dragPosition);
    }
    setDraggedId(null);
    setDragOverId(null);
    setDragPosition(null);
  };
  
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    setDragPosition(null);
  };

  /** Project / Session Dropdown Switcher Component */
  const ProjectSessionDropdown = () => (
    <div className="relative">
      <button
        onClick={() => setShowSessionDropdown(!showSessionDropdown)}
        className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border hover:border-accent/50 text-text-primary transition-all cursor-pointer shadow-sm group"
        title="Switch project session"
      >
        <div className="p-1 rounded-lg bg-accent/15 text-accent border border-accent/30 group-hover:scale-105 transition-transform">
          <BookOpen className="w-3.5 h-3.5 text-accent" />
        </div>
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-text-primary tracking-tight max-w-[150px] sm:max-w-[220px] truncate">
              {activeNotebook.name}
            </span>
            <span className="text-[9px] font-bold text-accent bg-accent/15 px-1.5 py-0.2 rounded border border-accent/30">
              {activeNotebook.cells.length} cells
            </span>
          </div>
          <span className="text-[8px] text-text-muted font-mono uppercase tracking-wider">Project Session</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ml-1 ${showSessionDropdown ? 'rotate-180 text-accent' : ''}`} />
      </button>

      {/* Dropdown Menu Modal */}
      {showSessionDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowSessionDropdown(false)} />
          <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-surface-border bg-surface-card shadow-2xl py-2 z-50 animate-in slide-in-from-top-2 duration-150">
            <div className="px-3.5 py-2 border-b border-surface-border flex items-center justify-between">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Select Project Session</span>
              <button
                onClick={() => {
                  addNotebook();
                  setShowSessionDropdown(false);
                }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 border border-accent/25 rounded-lg transition-all cursor-pointer"
                title="Create new project session"
              >
                <Plus className="w-3 h-3" />
                <span>New Session</span>
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto scrollbar-thin py-1 px-1 flex flex-col gap-1">
              {notebooks.map(nb => {
                const isActive = nb.id === activeNotebookId;
                return (
                  <div
                    key={nb.id}
                    onClick={() => {
                      setActiveNotebook(nb.id);
                      setShowSessionDropdown(false);
                    }}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl transition-all cursor-pointer border
                      ${isActive 
                        ? 'bg-accent/15 border-accent/40 text-text-primary shadow-sm font-bold' 
                        : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <BookOpen className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-accent' : 'text-text-muted'}`} />
                      {editingTabId === nb.id ? (
                        <input
                          autoFocus
                          className="bg-surface-muted border border-accent/50 rounded px-1.5 py-0.5 text-xs text-text-primary outline-none w-full"
                          value={editingTabName}
                          onChange={e => setEditingTabName(e.target.value)}
                          onBlur={() => { renameNotebook(nb.id, editingTabName); setEditingTabId(null); }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { renameNotebook(nb.id, editingTabName); setEditingTabId(null); }
                            if (e.key === 'Escape') setEditingTabId(null);
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <div className="flex flex-col min-w-0 flex-1">
                          <span 
                            className="text-xs truncate font-medium"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingTabId(nb.id);
                              setEditingTabName(nb.name);
                            }}
                            title="Double-click to rename session"
                          >
                            {nb.name}
                          </span>
                          <span className="text-[8px] text-text-muted font-mono">{nb.cells.length} cells • dbl-click to rename</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      )}
                      {notebooks.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotebook(nb.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-danger/20 text-text-muted hover:text-danger rounded-md transition-all cursor-pointer"
                          title="Delete Session"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-1.5 mt-1 border-t border-[#1f263a] px-3 py-1 flex items-center justify-between">
              <span className="text-[9px] font-mono text-text-muted">{notebooks.length} active sessions</span>
              <button
                onClick={() => {
                  addNotebook();
                  setShowSessionDropdown(false);
                }}
                className="text-[9px] font-bold text-accent hover:underline cursor-pointer"
              >
                + Add Session
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div id="notebook-scroll" className="flex flex-col h-full overflow-y-auto scrollbar-thin bg-canvas-dot-grid">
      {/* ── PRESENT MODE NAV — minimal: Project Session Dropdown + present toggle + export dashboard ── */}
      {dashboardMode ? (
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-border/60 glass sticky top-0 z-20 bg-surface-base/80 backdrop-blur-xl">
          <ProjectSessionDropdown />
          <div className="flex items-center gap-2 shrink-0">
            {/* Export Dashboard HTML */}
            <button
              onClick={exportDashboard}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-text-muted hover:text-text-primary bg-surface-muted/40 hover:bg-surface-muted border border-surface-border/50 hover:border-surface-border rounded-xl transition-all cursor-pointer"
              title="Export dashboard as standalone HTML (no nav bar)"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Dashboard</span>
            </button>

            {/* Present toggle */}
            <button
              onClick={() => setDashboardMode(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 rounded-xl transition-all cursor-pointer"
              title="Exit Presentation Mode"
            >
              <Presentation className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit Present</span>
            </button>
          </div>
        </div>
      ) : (
        /* ── NORMAL MODE NAV — 3-part balanced hierarchy (Left, Center, Right) ── */
        <div className="flex items-center justify-between px-6 py-3 border-b border-surface-border glass sticky top-0 z-30 bg-surface-base/85 backdrop-blur-xl gap-4">
          
          {/* Left Group: Session Selector & LLM Model Engine */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ProjectSessionDropdown />
            <div className="h-5 w-[1px] bg-surface-border/60 mx-0.5 hidden sm:block" />
            <LlmSettingsPanel />
          </div>

          {/* Center Group: Primary Workflow Actions & Triggers */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => addCell()}
              className="btn-primary flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Add new SQL analysis cell (Cmd+K)"
            >
              <Plus className="w-4 h-4" />
              <span>New Insight</span>
            </button>

            <button
              onClick={() => setShowNichePlanner(true)}
              className="btn-ghost flex items-center gap-1.5 text-xs text-accent hover:bg-accent/10 border border-accent/25 hover:border-accent/40 transition-all rounded-xl px-3 py-1.5 cursor-pointer"
              title="AI Storytelling Planner"
            >
              <Sparkles className="w-4 h-4 text-accent animate-pulse" />
              <span className="hidden md:inline text-[11px] font-bold text-accent">Niche Planner</span>
            </button>

            <button
              onClick={onOpenSearch}
              className="btn-ghost flex items-center gap-1.5 text-xs cursor-pointer"
              title="Search cells (Cmd+F)"
            >
              <Search className="w-4 h-4" />
              <span className="hidden lg:inline text-[11px] font-medium text-text-muted">Search</span>
              <kbd className="hidden lg:inline text-[9px] font-mono bg-surface-muted text-text-muted px-1 py-0.5 rounded border border-surface-border ml-0.5">⌘F</kbd>
            </button>
          </div>

          {/* Right Group: Presentation, Marketplace & Export Deliverables */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowMarketplaceModal(true)}
              className="btn-ghost flex items-center gap-1.5 text-xs text-accent hover:bg-accent/10 border border-accent/25 hover:border-accent/40 rounded-xl px-2.5 py-1.5 transition-all cursor-pointer"
              title="Theme & Dashboard Marketplace"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline text-[11px] font-bold text-accent">Marketplace</span>
            </button>

            <button
              onClick={() => setDashboardMode(true)}
              className="btn-ghost flex items-center gap-1.5 text-xs transition-all cursor-pointer"
              title="Enter Presentation Mode"
            >
              <Presentation className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px] font-medium text-text-muted">Present</span>
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="btn-ghost flex items-center gap-1.5 text-xs cursor-pointer"
                title="Export Notebook"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px] font-medium text-text-muted">Export</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-surface-border bg-surface-card shadow-card py-2 z-50 animate-in slide-in-from-top-2">
                    <button
                      onClick={() => { exportNotebook('json'); setShowExportMenu(false); }}
                      className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-surface-muted transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <span>As JSON Document</span>
                      <span className="text-[9px] font-mono text-text-muted">.json</span>
                    </button>
                    <button
                      onClick={() => { exportNotebook('sql'); setShowExportMenu(false); }}
                      className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-surface-muted transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <span>As SQL Script</span>
                      <span className="text-[9px] font-mono text-text-muted">.sql</span>
                    </button>
                    <button
                      onClick={() => { exportNotebook('html'); setShowExportMenu(false); }}
                      className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-surface-muted transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <span>Interactive HTML Report</span>
                      <span className="text-[9px] font-mono text-text-muted">.html</span>
                    </button>
                    <button
                      onClick={() => { exportNotebook('ipynb'); setShowExportMenu(false); }}
                      className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-surface-muted transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <span>Jupyter Notebook</span>
                      <span className="text-[9px] font-mono text-text-muted">.ipynb</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI Header & Cells List */}
      {dashboardMode && (
        <div className="w-full max-w-[95%] mx-auto mt-6 mb-2 px-4 animate-in fade-in duration-300">
          <div className="glass rounded-3xl p-8 border border-surface-border/60 shadow-xl flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative overflow-hidden bg-gradient-to-br from-surface-card/60 via-surface-card/25 to-transparent">
            {/* Ambient Background Glow */}
            <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-accent/10 rounded-full blur-[80px] pointer-events-none" />
            
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-accent uppercase tracking-widest bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
                  Executive Briefing
                </span>
                {activeConnection !== 'NONE' && (
                  <span className="text-[9px] font-bold text-success uppercase tracking-widest bg-success/10 px-3 py-1 rounded-full border border-success/20">
                    Live DB: {activeConnection}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-extrabold text-text-primary tracking-tight mt-2">
                {activeNotebook.name}
              </h1>
              <p className="text-xs text-text-secondary max-w-2xl font-medium leading-relaxed mt-1">
                A high-fidelity reporting dashboard synthesized from your analysis notebook cells, matching storytelling narratives alongside key interactive data visualizations.
              </p>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4 w-full xl:w-auto xl:min-w-[45%] shrink-0">
              <div className="p-4 rounded-2xl bg-surface-card/60 border border-surface-border/50 flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Total Insights</span>
                <span className="text-2xl font-black text-text-primary tracking-tight">{totalInsightsCount}</span>
              </div>
              <div className="p-4 rounded-2xl bg-surface-card/60 border border-surface-border/50 flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Visualizations</span>
                <span className="text-2xl font-black text-accent tracking-tight">{totalVisualizationsCount}</span>
              </div>
              <div className="p-4 rounded-2xl bg-surface-card/60 border border-surface-border/50 flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Queries Verified</span>
                <span className="text-2xl font-black text-success tracking-tight">{totalSuccessCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cells List */}
      <div className="flex-1 p-6 max-w-[95%] w-full mx-auto flex flex-col gap-6">
        {cells.map((cell, index) => (
          <div
            key={cell.id}
            draggable={!dashboardMode}
            onDragStart={(e) => handleDragStart(e, cell.id)}
            onDragOver={(e) => handleDragOver(e, cell.id)}
            onDragLeave={(e) => handleDragLeave(e, cell.id)}
            onDrop={(e) => handleDrop(e, cell.id)}
            onDragEnd={handleDragEnd}
            className={`transition-all duration-200 relative ${
              dragOverId === cell.id
                ? dragPosition === 'before'
                  ? 'border-t-2 border-accent pt-2'
                  : 'border-b-2 border-accent pb-2'
                : ''
            } ${draggedId === cell.id ? 'opacity-40' : ''}`}
          >
            <NotebookCellComponent
              cell={cell}
              index={index}
              isLast={index === cells.length - 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
