import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getPaginationRowModel, flexRender,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, BarChart2, Table, Download, Network } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import D3Chart from '../viz/D3Chart.tsx';
import SchemaDiagram from '../viz/SchemaDiagram.tsx';

export default function ResultsPane() {
  const queryResult = useAppStore(s => s.queryResult);
  const showViz = useAppStore(s => s.showViz);
  const setShowViz = useAppStore(s => s.setShowViz);
  const vizType = useAppStore(s => s.vizType);
  const setVizType = useAppStore(s => s.setVizType);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [view, setView] = useState<'table' | 'chart' | 'schema'>('table');
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'csv' | 'json') => {
    if (!queryResult) return;
    setExporting(true);
    try {
      const res = await fetch('http://localhost:8000/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          columns: queryResult.columns,
          rows: queryResult.rows,
        }),
      });
      const data = await res.json();
      const blob = new Blob([data.data], { type: data.mime });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnDef<Record<string, unknown>>[] = useMemo(() => {
    if (!queryResult) return [];
    return queryResult.columns.map(col => ({
      accessorKey: col,
      header: col,
      cell: ({ getValue }) => {
        const v = getValue();
        return <span className="font-mono">{v === null ? <span className="text-text-muted italic">null</span> : String(v)}</span>;
      },
    }));
  }, [queryResult]);

  const table = useReactTable({
    data: queryResult?.rows ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  if (!queryResult && view !== 'schema') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
        <Table className="w-10 h-10" />
        <p className="text-sm text-text-muted">Run a query to see results</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Results toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-border bg-surface-card flex-shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-text-muted">Results</span>
        {queryResult && (
          <>
            <span className="tag-accent">{queryResult.rowCount.toLocaleString()} rows</span>
            <span className="tag-success">{queryResult.executionMs}ms</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* Export button */}
          {queryResult && (
            <div className="relative group mr-2">
              <button className="btn-ghost flex items-center gap-1.5" disabled={exporting}>
                <Download className="w-3.5 h-3.5" />
                {exporting ? '...' : 'Export'}
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 glass rounded-lg shadow-card border border-surface-border overflow-hidden">
                 <button onClick={() => handleExport('csv')} className="w-full px-4 py-2 text-xs text-left hover:bg-surface-hover text-text-primary whitespace-nowrap transition-colors">
                   Export as CSV
                 </button>
                 <button onClick={() => handleExport('json')} className="w-full px-4 py-2 text-xs text-left hover:bg-surface-hover text-text-primary whitespace-nowrap transition-colors">
                   Export as JSON
                 </button>
              </div>
            </div>
          )}

          {/* Viz type selector */}
          {showViz && view === 'chart' && (
            <div className="flex items-center bg-surface-muted rounded-md border border-surface-border p-0.5 mr-2">
              {(['bar', 'line', 'scatter'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setVizType(t)}
                  className={`px-2.5 py-1 rounded text-[11px] capitalize transition-colors
                    ${vizType === t ? 'bg-accent text-white font-semibold' : 'text-text-muted hover:text-text-primary'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => { setView('table'); }}
            className={`btn-ghost ${view === 'table' ? 'text-accent' : ''}`}
          >
            <Table className="w-3.5 h-3.5" /> Table
          </button>
          <button
            onClick={() => { setView('chart'); setShowViz(true); }}
            className={`btn-ghost ${view === 'chart' ? 'text-accent' : ''}`}
          >
            <BarChart2 className="w-3.5 h-3.5" /> Chart
          </button>
          <button
            onClick={() => { setView('schema'); }}
            className={`btn-ghost ${view === 'schema' ? 'text-accent' : ''}`}
          >
            <Network className="w-3.5 h-3.5" /> Diagram
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'chart' && showViz && queryResult ? (
          <D3Chart data={queryResult.rows} columns={queryResult.columns} chartType={vizType} />
        ) : view === 'schema' ? (
          <SchemaDiagram />
        ) : queryResult ? (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-auto scrollbar-thin">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="bg-surface-card border-b border-surface-border">
                      {hg.headers.map(header => (
                        <th
                          key={header.id}
                          className="px-3 py-2 text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-text-primary transition-colors"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === 'asc'  && <ChevronUp className="w-3 h-3" />}
                            {header.column.getIsSorted() === 'desc' && <ChevronDown className="w-3 h-3" />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-surface-border/50 hover:bg-surface-hover transition-colors
                        ${i % 2 === 0 ? '' : 'bg-surface-card/40'}`}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-3 py-1.5 text-text-secondary whitespace-nowrap">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-surface-border bg-surface-card flex-shrink-0 text-[11px] text-text-muted">
              <span>
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="btn-ghost p-1 disabled:opacity-30">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="btn-ghost p-1 disabled:opacity-30">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
            <Table className="w-10 h-10" />
            <p className="text-sm text-text-muted">Run a query to see results</p>
          </div>
        )}
      </div>
    </div>
  );
}
