import React, { useState } from 'react';
import { Plus, Search, BookOpen, Download, ChevronDown, X, Presentation } from 'lucide-react';
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
  const dashboardMode = useAppStore(s => s.dashboardMode);
  const setDashboardMode = useAppStore(s => s.setDashboardMode);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'before' | 'after' | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

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
    // Only clear if we actually left the element entirely
    if (dragOverId === id) {
      // Small timeout to prevent flicker when moving between children
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
    setActiveDragId(null);
  };
  
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    setDragPosition(null);
    setActiveDragId(null);
  };

  return (
    <div id="notebook-scroll" className="flex flex-col h-full overflow-y-auto scrollbar-thin bg-surface-base">
      {/* Notebook Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border glass sticky top-0 z-20">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 mr-4">
          {notebooks.map(nb => (
            <div
              key={nb.id}
              onClick={() => setActiveNotebook(nb.id)}
              className={`group flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-colors cursor-pointer min-w-[120px]
                ${nb.id === activeNotebookId ? 'bg-surface-card border-accent text-accent font-medium shadow-sm' : 'border-transparent text-text-muted hover:bg-surface-muted/50'}`}
            >
              <BookOpen className={`w-3.5 h-3.5 ${nb.id === activeNotebookId ? 'text-accent' : 'text-text-muted'}`} />
              
              {editingTabId === nb.id ? (
                <input
                  autoFocus
                  className="bg-transparent border-none outline-none text-sm w-24 text-text-primary"
                  value={editingTabName}
                  onChange={e => setEditingTabName(e.target.value)}
                  onBlur={() => { renameNotebook(nb.id, editingTabName); setEditingTabId(null); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { renameNotebook(nb.id, editingTabName); setEditingTabId(null); }
                    if (e.key === 'Escape') setEditingTabId(null);
                  }}
                />
              ) : (
                <span 
                  className="text-sm truncate flex-1"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTabId(nb.id);
                    setEditingTabName(nb.name);
                  }}
                >
                  {nb.name}
                </span>
              )}

              <div className={`flex items-center opacity-0 group-hover:opacity-100 transition-opacity ${nb.id === activeNotebookId ? 'opacity-100' : ''}`}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNotebook(nb.id);
                  }}
                  className="p-1 hover:bg-surface-border rounded text-text-muted hover:text-danger transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          <button 
            onClick={addNotebook}
            className="p-2 ml-1 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-lg transition-colors"
            title="New Session"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <LlmSettingsPanel />
          <button
            onClick={() => setDashboardMode(!dashboardMode)}
            className={`btn-ghost flex items-center gap-1.5 text-xs transition-all ${dashboardMode ? 'bg-accent/20 text-accent border border-accent/20' : ''}`}
            title={dashboardMode ? "Exit Presentation Mode" : "Enter Presentation Mode"}
          >
            <Presentation className="w-4 h-4" />
            <span className="hidden sm:inline text-[11px] font-medium text-text-muted">Present</span>
          </button>
          <button
            onClick={onOpenSearch}
            className="btn-ghost flex items-center gap-1.5 text-xs"
            title="Search cells (Cmd+F)"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline text-[11px] font-medium text-text-muted">Search</span>
            <kbd className="hidden sm:inline text-[9px] font-mono bg-surface-muted text-text-muted px-1 py-0.5 rounded border border-surface-border ml-0.5">⌘F</kbd>
          </button>
          
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="btn-ghost flex items-center gap-1.5 text-xs"
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
                    className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-surface-muted transition-colors flex items-center justify-between"
                  >
                    <span>As JSON Document</span>
                    <span className="text-[9px] font-mono text-text-muted">.json</span>
                  </button>
                  <button
                    onClick={() => { exportNotebook('sql'); setShowExportMenu(false); }}
                    className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-surface-muted transition-colors flex items-center justify-between"
                  >
                    <span>As SQL Script</span>
                    <span className="text-[9px] font-mono text-text-muted">.sql</span>
                  </button>
                  <button
                    onClick={() => { exportNotebook('html'); setShowExportMenu(false); }}
                    className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-surface-muted transition-colors flex items-center justify-between"
                  >
                    <span>Interactive HTML Report</span>
                    <span className="text-[9px] font-mono text-text-muted">.html</span>
                  </button>
                  <button
                    onClick={() => { exportNotebook('ipynb'); setShowExportMenu(false); }}
                    className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-surface-muted transition-colors flex items-center justify-between"
                  >
                    <span>Jupyter Notebook</span>
                    <span className="text-[9px] font-mono text-text-muted">.ipynb</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => addCell()}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            New Insight
          </button>
        </div>
      </div>

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
              <div className="glass border border-surface-border/50 rounded-2xl p-4 flex flex-col gap-1 hover:border-accent/20 transition-all">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Key Insights</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black text-text-primary">{totalInsightsCount}</span>
                  <span className="text-[10px] font-semibold text-text-muted ml-1">narratives</span>
                </div>
              </div>
              
              <div className="glass border border-surface-border/50 rounded-2xl p-4 flex flex-col gap-1 hover:border-accent/20 transition-all">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Visualizations</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black text-text-primary">{totalVisualizationsCount}</span>
                  <span className="text-[10px] font-semibold text-text-muted ml-1">charts</span>
                </div>
              </div>

              <div className="glass border border-surface-border/50 rounded-2xl p-4 flex flex-col gap-1 hover:border-accent/20 transition-all col-span-2 md:col-span-1">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Success Rate</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black text-success">
                    {cells.length > 0 ? Math.round((totalSuccessCount / cells.length) * 100) : 0}%
                  </span>
                  <span className="text-[10px] font-semibold text-text-muted ml-1">queries</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 items-center justify-center py-6 px-4">
        <div className={dashboardMode 
          ? "grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-[95%] w-full" 
          : "flex flex-col gap-6 max-w-[95%] w-full"
        }>
          {cells.map((cell, idx) => {
            let colSpanClass = "";
            if (dashboardMode) {
              const isTableOrPivot = cell.viewMode === 'table' || cell.viewMode === 'pivot';
              const hasManyCols = cell.queryResult?.columns && cell.queryResult.columns.length > 4;
              
              if (isTableOrPivot && hasManyCols) {
                colSpanClass = "lg:col-span-12";
              } else {
                colSpanClass = "lg:col-span-6";
              }
            }

            return (
              <div
                key={cell.id}
                data-cell-id={cell.id}
                className={`relative ${colSpanClass}`}
                draggable={!dashboardMode && activeDragId === cell.id}
                onMouseDown={(e) => {
                  if (dashboardMode) return;
                  const target = e.target as HTMLElement;
                  if (e.altKey || target.closest('[data-drag-handle]')) {
                    setActiveDragId(cell.id);
                  } else {
                    setActiveDragId(null);
                  }
                }}
                onMouseUp={() => { if (!dashboardMode) setActiveDragId(null); }}
                onDragStart={(e) => { if (!dashboardMode) handleDragStart(e, cell.id); }}
                onDragOver={(e) => { if (!dashboardMode) handleDragOver(e, cell.id); }}
                onDragLeave={(e) => { if (!dashboardMode) handleDragLeave(e, cell.id); }}
                onDrop={(e) => { if (!dashboardMode) handleDrop(e, cell.id); }}
                onDragEnd={handleDragEnd}
              >
                {/* Drop Indicator - Before */}
                {!dashboardMode && dragOverId === cell.id && dragPosition === 'before' && (
                  <div className="absolute -top-3 left-0 right-0 h-1 bg-accent rounded-full shadow-[0_0_8px_rgba(var(--color-accent),0.5)] z-50 pointer-events-none" />
                )}
                
                <div className={`${!dashboardMode && draggedId === cell.id ? 'opacity-30 scale-[0.98]' : 'opacity-100 scale-100'} transition-all duration-200`}>
                  <NotebookCellComponent 
                    cell={cell} 
                    index={idx}
                    isLast={idx === cells.length - 1}
                  />
                </div>

                {/* Drop Indicator - After */}
                {!dashboardMode && dragOverId === cell.id && dragPosition === 'after' && (
                  <div className="absolute -bottom-3 left-0 right-0 h-1 bg-accent rounded-full shadow-[0_0_8px_rgba(var(--color-accent),0.5)] z-50 pointer-events-none" />
                )}
              </div>
            );
          })}
          
          {/* Add button at the bottom */}
          {!dashboardMode && (
            <button
              onClick={() => addCell()}
              className="group flex items-center justify-center gap-2 py-4 border border-dashed border-surface-border/60 rounded-2xl hover:border-accent/40 hover:bg-accent-dim/5 transition-all duration-300"
            >
              <div className="p-1.5 bg-surface-muted rounded-full group-hover:scale-110 group-hover:bg-accent/20 transition-all">
                <Plus className="w-4 h-4 text-text-muted group-hover:text-accent" />
              </div>
              <span className="text-xs font-medium text-text-muted group-hover:text-text-secondary">Add another analysis cell</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
