import { useState, useMemo } from 'react';
import { Settings2, ArrowDownRight } from 'lucide-react';

interface PivotTableProps {
  data: Record<string, unknown>[];
  columns: string[];
}

export default function PivotTable({ data, columns }: PivotTableProps) {
  const [rowDim, setRowDim] = useState<string>(columns[0] || '');
  const [colDim, setColDim] = useState<string>('');
  const [valDim, setValDim] = useState<string>(columns.find(c => typeof data[0]?.[c] === 'number') || columns[1] || '');
  const [aggFn, setAggFn] = useState<'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX'>('SUM');

  // Pivot computation engine
  const { pivotData, rowKeys, colKeys } = useMemo(() => {
    if (!data.length || !rowDim || !valDim) return { pivotData: {}, rowKeys: [], colKeys: [] };

    const grouped: Record<string, Record<string, number[]>> = {};
    const colSet = new Set<string>();

    data.forEach(row => {
      const rVal = String(row[rowDim] ?? '(blank)');
      const cVal = colDim ? String(row[colDim] ?? '(blank)') : 'Total';
      const vVal = Number(row[valDim]) || 0;

      if (!grouped[rVal]) grouped[rVal] = {};
      if (!grouped[rVal][cVal]) grouped[rVal][cVal] = [];
      grouped[rVal][cVal].push(vVal);
      colSet.add(cVal);
    });

    const cKeys = Array.from(colSet).sort();
    const rKeys = Object.keys(grouped).sort();
    const result: Record<string, Record<string, number>> = {};

    rKeys.forEach(r => {
      result[r] = {};
      cKeys.forEach(c => {
        const vals = grouped[r][c] || [];
        if (vals.length === 0) {
          result[r][c] = 0;
          return;
        }
        let agg = 0;
        switch (aggFn) {
          case 'SUM': agg = vals.reduce((a, b) => a + b, 0); break;
          case 'COUNT': agg = vals.length; break;
          case 'AVG': agg = vals.reduce((a, b) => a + b, 0) / vals.length; break;
          case 'MIN': agg = Math.min(...vals); break;
          case 'MAX': agg = Math.max(...vals); break;
        }
        result[r][c] = agg;
      });
    });

    return { pivotData: result, rowKeys: rKeys, colKeys: cKeys };
  }, [data, rowDim, colDim, valDim, aggFn]);

  // If missing config
  if (!rowDim || !valDim) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-text-muted bg-surface-card border border-surface-border rounded-xl shadow-sm">
        <Settings2 className="w-8 h-8 mb-3 opacity-50" />
        <p className="text-sm font-medium">Configure Pivot Table</p>
        <p className="text-xs opacity-70 mt-1">Select Row and Value dimensions to see data.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-card border border-surface-border rounded-xl shadow-sm overflow-hidden flex-1">
      {/* Pivot Controls Panel */}
      <div className="flex flex-wrap items-center gap-4 p-3 bg-surface-muted border-b border-surface-border text-xs">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Rows</label>
          <select value={rowDim} onChange={e => setRowDim(e.target.value)} className="bg-surface-base border border-surface-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent">
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Cols</label>
          <select value={colDim} onChange={e => setColDim(e.target.value)} className="bg-surface-base border border-surface-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent">
            <option value="">(None)</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="h-4 w-[1px] bg-surface-border" />
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Values</label>
          <div className="flex items-center gap-1 bg-surface-base border border-surface-border rounded pr-1 overflow-hidden focus-within:border-accent transition-colors">
            <select value={aggFn} onChange={e => setAggFn(e.target.value as any)} className="bg-surface-muted/50 border-none px-2 py-1 text-text-primary focus:outline-none text-[10px] font-bold">
              {['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="text-text-muted text-[10px] italic">of</span>
            <select value={valDim} onChange={e => setValDim(e.target.value)} className="bg-transparent border-none px-1 py-1 text-text-primary focus:outline-none min-w-[80px]">
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Pivot Table Grid */}
      <div className="overflow-auto flex-1 custom-scrollbar relative">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-surface-card shadow-[0_1px_0_0_var(--surface-border)]">
            <tr>
              <th className="px-4 py-2 font-semibold text-text-muted bg-surface-muted/30 border-r border-surface-border min-w-[150px]">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="w-3 h-3" />
                  {rowDim}
                </div>
              </th>
              {colKeys.map(c => (
                <th key={c} className="px-4 py-2 font-semibold text-text-primary text-right border-b border-surface-border">
                  <div className="flex items-center justify-end gap-1.5">
                    {colDim && <span className="text-[9px] text-text-muted font-normal">{colDim}:</span>}
                    {c}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rowKeys.map(r => (
              <tr key={r} className="hover:bg-surface-muted/30 transition-colors">
                <td className="px-4 py-2 font-medium text-text-secondary border-r border-surface-border sticky left-0 bg-surface-card">
                  {r}
                </td>
                {colKeys.map(c => {
                  const val = pivotData[r][c];
                  const formatted = aggFn === 'COUNT' ? val.toString() : Number.isInteger(val) ? val.toLocaleString() : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  return (
                    <td key={c} className="px-4 py-2 text-right font-mono text-text-primary">
                      {val === 0 ? <span className="text-text-muted/30">-</span> : formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rowKeys.length === 0 && (
          <div className="p-8 text-center text-text-muted text-sm">
            No data matches the current pivot configuration.
          </div>
        )}
      </div>
    </div>
  );
}
