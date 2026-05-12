import { useCallback, useEffect } from 'react';
import { X, Layout } from 'lucide-react';
import Sidebar from './components/sidebar/Sidebar';
import Notebook from './components/notebook/Notebook';
import ResizeHandle from './components/shared/ResizeHandle';
import SchemaDiagram from './components/viz/SchemaDiagram';
import NewConnModal from './components/sidebar/NewConnModal';
import ToastContainer from './components/shared/Toast';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const sidebarWidth = useAppStore(s => s.sidebarWidth);
  const setSidebarWidth = useAppStore(s => s.setSidebarWidth);
  const showSchemaDiagram = useAppStore(s => s.showSchemaDiagram);
  const setShowSchemaDiagram = useAppStore(s => s.setShowSchemaDiagram);
  const showConnModal = useAppStore(s => s.showConnModal);
  const setShowConnModal = useAppStore(s => s.setShowConnModal);

  const resizeSidebar = useCallback((delta: number) => {
    setSidebarWidth(w => Math.max(220, Math.min(450, w + delta)));
  }, [setSidebarWidth]);

  // Global keyboard shortcut: Cmd+K = New Cell (capture phase bypasses Monaco)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        useAppStore.getState().addCell();
        // Scroll to the bottom to reveal the new cell
        requestAnimationFrame(() => {
          const notebook = document.getElementById('notebook-scroll');
          if (notebook) notebook.scrollTop = notebook.scrollHeight;
        });
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-surface-base">
      {/* Sidebar */}
      <Sidebar width={sidebarWidth} />

      {/* Horizontal resize handle */}
      <ResizeHandle direction="horizontal" onResize={resizeSidebar} />

      {/* Main content area (Notebook) */}
      <main className="flex-1 min-w-0 h-full overflow-hidden relative">
        {/* Background glow effects for premium look */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-success/5 rounded-full blur-[120px] pointer-events-none" />
        
        <Notebook />

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
      </main>
      <ToastContainer />
    </div>
  );
}
