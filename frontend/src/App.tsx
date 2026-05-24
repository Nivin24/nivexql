import { useCallback, useEffect, useState } from 'react';
import { X, Layout, Search } from 'lucide-react';
import Sidebar from './components/sidebar/Sidebar';
import Notebook from './components/notebook/Notebook';
import ResizeHandle from './components/shared/ResizeHandle';
import SchemaDiagram from './components/viz/SchemaDiagram';
import NewConnModal from './components/sidebar/NewConnModal';
import ToastContainer from './components/shared/Toast';
import SettingsModal from './components/shared/SettingsModal';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const sidebarWidth = useAppStore(s => s.sidebarWidth);
  const setSidebarWidth = useAppStore(s => s.setSidebarWidth);
  const showSchemaDiagram = useAppStore(s => s.showSchemaDiagram);
  const setShowSchemaDiagram = useAppStore(s => s.setShowSchemaDiagram);
  const showConnModal = useAppStore(s => s.showConnModal);
  const setShowConnModal = useAppStore(s => s.setShowConnModal);
  const showSettingsModal = useAppStore(s => s.showSettingsModal);
  const setShowSettingsModal = useAppStore(s => s.setShowSettingsModal);
  const appTheme = useAppStore(s => s.appTheme);
  const uiStyle = useAppStore(s => s.uiStyle);
  const notebooks = useAppStore(s => s.notebooks);
  const activeNotebookId = useAppStore(s => s.activeNotebookId);
  const cells = notebooks.find(n => n.id === activeNotebookId)?.cells || [];
  const dashboardMode = useAppStore(s => s.dashboardMode);

  // Apply theme to <html> element whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appTheme);
  }, [appTheme]);

  // Apply UI style to <html> element whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-ui-style', uiStyle);
  }, [uiStyle]);

  const resizeSidebar = useCallback((delta: number) => {
    setSidebarWidth(w => Math.max(220, Math.min(450, w + delta)));
  }, [setSidebarWidth]);

  // Global Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = searchQuery.trim()
    ? cells.filter(c =>
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.sql?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+K → New Cell
      if (mod && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        useAppStore.getState().addCell();
        requestAnimationFrame(() => {
          const notebook = document.getElementById('notebook-scroll');
          if (notebook) notebook.scrollTop = notebook.scrollHeight;
        });
        return;
      }

      // Cmd+F → Global Search
      if (mod && e.key === 'f') {
        e.preventDefault();
        setShowSearch(v => !v);
        return;
      }

      // Cmd+D → Duplicate active cell
      if (mod && e.key === 'd') {
        e.preventDefault();
        const state = useAppStore.getState();
        const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
        if (!activeNb) return;
        const active = activeNb.cells.find(c => c.id === activeNb.activeCellId);
        if (active) {
          state.addCell();
          // Get the just-added cell and update it with cloned content
          setTimeout(() => {
            const updated = useAppStore.getState();
            const upNb = updated.notebooks.find(n => n.id === updated.activeNotebookId);
            if (!upNb) return;
            const last = upNb.cells[upNb.cells.length - 1];
            if (last) updated.updateCell(last.id, { name: active.name ? `${active.name} (copy)` : '', prompt: active.prompt, sql: active.sql });
          }, 0);
        }
        return;
      }

      // Cmd+/ → Focus active cell's prompt input
      if (mod && e.key === '/') {
        e.preventDefault();
        const state = useAppStore.getState();
        const activeNb = state.notebooks.find(n => n.id === state.activeNotebookId);
        if (!activeNb) return;
        const activeId = activeNb.activeCellId;
        const promptInput = document.querySelector(`[data-cell-id="${activeId}"] input`) as HTMLInputElement;
        promptInput?.focus();
        return;
      }

      // Escape → Close search / modals
      if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);

  const jumpToCell = (id: string) => {
    useAppStore.getState().setActiveCell(id);
    setShowSearch(false);
    setSearchQuery('');
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-cell-id="${id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-surface-base">
      {/* Sidebar */}
      {!dashboardMode && <Sidebar width={sidebarWidth} />}

      {/* Horizontal resize handle */}
      {!dashboardMode && <ResizeHandle direction="horizontal" onResize={resizeSidebar} />}

      {/* Main content area (Notebook) */}
      <main className="flex-1 min-w-0 h-full overflow-hidden relative">
        {/* Background glow effects */}
        {appTheme === 'cosmic' ? (
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#111847]/20 rounded-full blur-[140px] pointer-events-none" />
        ) : (
          <>
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-success/5 rounded-full blur-[120px] pointer-events-none" />
          </>
        )}

        <Notebook onOpenSearch={() => setShowSearch(true)} />

        {/* Global Search Modal (Cmd+P) */}
        {showSearch && (
          <div
            className="absolute inset-0 z-50 flex items-start justify-center pt-24 bg-surface-base/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setShowSearch(false)}
          >
            <div
              className="w-full max-w-xl glass rounded-2xl border border-surface-border shadow-card overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
                <Search className="w-4 h-4 text-text-muted shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search cells by name, prompt, or SQL…"
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                />
                <kbd className="text-[10px] font-mono bg-surface-muted text-text-muted px-1.5 py-0.5 rounded border border-surface-border">ESC</kbd>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {searchQuery.trim() === '' && (
                  <p className="px-4 py-8 text-center text-[11px] text-text-muted">Start typing to search across all cells…</p>
                )}
                {searchQuery.trim() !== '' && searchResults.length === 0 && (
                  <p className="px-4 py-8 text-center text-[11px] text-text-muted">No cells match "{searchQuery}"</p>
                )}
                {searchResults.map((cell, i) => (
                  <button
                    key={cell.id}
                    onClick={() => jumpToCell(cell.id)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-surface-muted transition-colors border-b border-surface-border/50 last:border-0"
                  >
                    <span className="text-[10px] font-bold text-accent bg-accent/10 rounded px-1.5 py-0.5 mt-0.5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-text-primary truncate">{cell.name || `Analysis Cell ${i + 1}`}</p>
                      {cell.prompt && <p className="text-[10px] text-text-muted truncate mt-0.5">{cell.prompt}</p>}
                      {cell.sql && <p className="text-[10px] font-mono text-text-secondary truncate mt-0.5 opacity-70">{cell.sql.replace(/\s+/g, ' ').trim()}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Connection Modal */}
        {showConnModal && (
          <NewConnModal onClose={() => setShowConnModal(false)} />
        )}

        {/* Schema Diagram Modal */}
        {showSchemaDiagram && (
          <div className="absolute inset-0 z-50 bg-surface-base/80 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border glass">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/20 rounded-lg">
                    <Layout className="w-5 h-5 text-accent" />
                  </div>
                  <h2 className="text-sm font-bold text-text-primary uppercase tracking-widest">Database Visual Map</h2>
                </div>
                <button
                  onClick={() => setShowSchemaDiagram(false)}
                  className="btn-ghost p-2 rounded-full hover:bg-danger/10 hover:text-danger transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 bg-surface-base">
                <SchemaDiagram />
              </div>
            </div>
          </div>
        )}
        {/* Settings Modal */}
        {showSettingsModal && (
          <SettingsModal onClose={() => setShowSettingsModal(false)} />
        )}
      </main>
      <ToastContainer />

      {/* Global SVG Filters for Liquid Glass Theme */}
      <svg className="hidden">
        <defs>
          <filter
            id="container-glass"
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            colorInterpolationFilters="sRGB"
          >
            {/* Generate turbulent noise for distortion */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.04 0.04"
              numOctaves="1"
              seed="1"
              result="turbulence"
            />
            {/* Blur the turbulence pattern slightly */}
            <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
            {/* Displace the source graphic with the noise */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="blurredNoise"
              scale="15"
              xChannelSelector="R"
              yChannelSelector="B"
              result="displaced"
            />
            {/* Apply overall blur on the final result */}
            <feGaussianBlur in="displaced" stdDeviation="3" result="finalBlur" />
            {/* Output the result */}
            <feComposite in="finalBlur" in2="finalBlur" operator="over" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
