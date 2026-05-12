import React, { useState } from 'react';
import { Plus, Trash2, Layout, BookOpen } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import NotebookCellComponent from './NotebookCell';
import LlmSettingsPanel from '../shared/LlmSettingsPanel';

export default function Notebook() {
  const cells = useAppStore(s => s.cells);
  const addCell = useAppStore(s => s.addCell);
  const moveCell = useAppStore(s => s.moveCell);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<'before' | 'after' | null>(null);

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
  };
  
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    setDragPosition(null);
  };

  return (
    <div id="notebook-scroll" className="flex flex-col h-full overflow-y-auto scrollbar-thin bg-surface-base">
      {/* Notebook Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border glass sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-dim rounded-lg shadow-glow">
            <BookOpen className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary tracking-tight">Analytics Notebook</h1>
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium">Session Workspace</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <LlmSettingsPanel />
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
              className="relative"
              draggable
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
