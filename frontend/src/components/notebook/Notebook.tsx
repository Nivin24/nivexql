import React, { useState } from 'react';
import { Plus, Search, BookOpen, Download, ChevronDown, X, Edit2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import NotebookCellComponent from './NotebookCell';
import LlmSettingsPanel from '../shared/LlmSettingsPanel';

export default function Notebook({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const notebooks = useAppStore(s => s.notebooks);
  const activeNotebookId = useAppStore(s => s.activeNotebookId);
  const activeNotebook = notebooks.find(n => n.id === activeNotebookId) || notebooks[0];
  const cells = activeNotebook.cells;

  const addNotebook = useAppStore(s => s.addNotebook);
  const removeNotebook = useAppStore(s => s.removeNotebook);
  const setActiveNotebook = useAppStore(s => s.setActiveNotebook);
  const renameNotebook = useAppStore(s => s.renameNotebook);

  const addCell = useAppStore(s => s.addCell);
  const moveCell = useAppStore(s => s.moveCell);
  const exportNotebook = useAppStore(s => s.exportNotebook);

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

  const handleDragLeave = (e: React.DragEvent, id: string) => {
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
            onClick={addCell}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            New Insight
          </button>
        </div>
      </div>

      {/* Cells List — centered in remaining viewport space */}
      <div className="flex flex-col flex-1 items-center justify-center py-8 px-4">
        <div className="flex flex-col gap-6 max-w-[95%] w-full">
          {cells.map((cell, idx) => (
            <div
              key={cell.id}
              data-cell-id={cell.id}
              className="relative"
              draggable={activeDragId === cell.id}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (e.altKey || target.closest('[data-drag-handle]')) {
                  setActiveDragId(cell.id);
                } else {
                  setActiveDragId(null);
                }
              }}
              onMouseUp={() => setActiveDragId(null)}
              onDragStart={(e) => handleDragStart(e, cell.id)}
              onDragOver={(e) => handleDragOver(e, cell.id)}
              onDragLeave={(e) => handleDragLeave(e, cell.id)}
              onDrop={(e) => handleDrop(e, cell.id)}
              onDragEnd={handleDragEnd}
            >
              {/* Drop Indicator - Before */}
              {dragOverId === cell.id && dragPosition === 'before' && (
                <div className="absolute -top-3 left-0 right-0 h-1 bg-accent rounded-full shadow-[0_0_8px_rgba(var(--color-accent),0.5)] z-50 pointer-events-none" />
              )}
              
              <div className={`${draggedId === cell.id ? 'opacity-30 scale-[0.98]' : 'opacity-100 scale-100'} transition-all duration-200`}>
                <NotebookCellComponent 
                  cell={cell} 
                  index={idx}
                  isLast={idx === cells.length - 1}
                />
              </div>

              {/* Drop Indicator - After */}
              {dragOverId === cell.id && dragPosition === 'after' && (
                <div className="absolute -bottom-3 left-0 right-0 h-1 bg-accent rounded-full shadow-[0_0_8px_rgba(var(--color-accent),0.5)] z-50 pointer-events-none" />
              )}
            </div>
          ))}
          
          {/* Add button at the bottom */}
          <button
            onClick={addCell}
            className="group flex items-center justify-center gap-2 py-4 border border-dashed border-surface-border/60 rounded-2xl hover:border-accent/40 hover:bg-accent-dim/5 transition-all duration-300"
          >
            <div className="p-1.5 bg-surface-muted rounded-full group-hover:scale-110 group-hover:bg-accent/20 transition-all">
              <Plus className="w-4 h-4 text-text-muted group-hover:text-accent" />
            </div>
            <span className="text-xs font-medium text-text-muted group-hover:text-text-secondary">Add another analysis cell</span>
          </button>
        </div>
      </div>
    </div>
  );
}
