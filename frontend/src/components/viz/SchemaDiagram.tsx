import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Search } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { SchemaTable } from '../../store/useAppStore';

// ── Relationship types ────────────────────────────────────────────────────────
type LinkKind = 'real' | 'inferred';

interface Link {
  fromTable: string;
  fromCol: string;
  toTable: string;
  toCol: string;
  kind: LinkKind;
}

/**
 * Build REAL relationships from explicit DB foreign key constraints.
 */
function getRealLinks(schema: SchemaTable[]): Link[] {
  const links: Link[] = [];
  schema.forEach(tbl => {
    (tbl.foreignKeys ?? []).forEach(fk => {
      links.push({
        fromTable: tbl.name,
        fromCol: fk.column,
        toTable: fk.referencedTable,
        toCol: fk.referencedColumn,
        kind: 'real',
      });
    });
  });
  return links;
}

/**
 * Infer LIKELY relationships from column naming conventions.
 * Rules:
 *   1. Column must end with `_id` and NOT be named exactly `id`.
 *   2. Strip `_id` → guess the referenced table name.
 *   3. Try exact, plural (+s), singular (-s/-es), camelCase variations.
 *   4. Referenced table must have a column named `id`.
 *   5. Skip if an identical real FK already covers this pair.
 */
function getInferredLinks(schema: SchemaTable[], realLinks: Link[]): Link[] {
  const tableNames = schema.map(t => t.name.toLowerCase());
  const tableMap = new Map(schema.map(t => [t.name.toLowerCase(), t]));
  const links: Link[] = [];

  const realSet = new Set(
    realLinks.map(l => `${l.fromTable}|${l.fromCol}|${l.toTable}|${l.toCol}`)
  );

  schema.forEach(tbl => {
    tbl.columns.forEach(col => {
      const cn = col.name.toLowerCase();
      // Only process _id columns that are not the PK itself
      if (!cn.endsWith('_id') || col.isPrimaryKey) return;

      const guess = cn.slice(0, -3); // strip `_id`

      // Generate name candidates (singular → plural → known table names)
      const candidates = [
        guess,
        guess + 's',
        guess + 'es',
        guess.endsWith('s') ? guess.slice(0, -1) : null,   // try singular
        guess.endsWith('ies') ? guess.slice(0, -3) + 'y' : null,
      ].filter(Boolean) as string[];

      for (const candidate of candidates) {
        if (!tableNames.includes(candidate)) continue;
        const refTable = tableMap.get(candidate)!;
        if (refTable.name === tbl.name) continue; // self-reference skip

        // Referenced table must have a column named `id`
        const hasId = refTable.columns.some(c => c.name.toLowerCase() === 'id');
        if (!hasId) continue;

        const key = `${tbl.name}|${col.name}|${refTable.name}|id`;
        // Only add if no real FK already captures this
        if (realSet.has(key)) continue;

        links.push({
          fromTable: tbl.name,
          fromCol: col.name,
          toTable: refTable.name,
          toCol: 'id',
          kind: 'inferred',
        });
        break; // stop after first match for this column
      }
    });
  });
  return links;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SchemaDiagram() {
  const schema = useAppStore(s => s.schema);
  const appTheme = useAppStore(s => s.appTheme);
  const addCell = useAppStore(s => s.addCell);
  const setShowSchemaDiagram = useAppStore(s => s.setShowSchemaDiagram);

  const [diagramSearch, setDiagramSearch] = useState('');

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isLight = appTheme === 'light';
  const isCosmic = appTheme === 'cosmic';
  const c = {
    bg:          isLight ? '#f0f4ff' : (isCosmic ? '#000000' : '#0a0e1a'),
    card:        isLight ? '#ffffff' : (isCosmic ? '#030514' : '#161b2c'),
    header:      isLight ? '#e4eaf8' : (isCosmic ? '#0c1033' : '#1e2a45'),
    border:      isLight ? '#c8d3ef' : (isCosmic ? '#172054' : '#2a3454'),
    textPrimary: isLight ? '#0f172a' : '#e8edf8',
    textMuted:   isLight ? '#5c6e98' : '#8b9cc4',
    textType:    isLight ? '#9ba8c8' : '#4e5e87',
    accent:      isLight ? '#4a6ef5' : (isCosmic ? '#6c8dfa' : '#6c8dfa'),
    pkColor:     '#fbbf24',
    realLine:    isLight ? '#4a6ef5' : (isCosmic ? '#6c8dfa' : '#6c8dfa'),   // solid, accent
    inferLine:   isLight ? '#94a3c4' : (isCosmic ? '#182261' : '#3a4a72'),   // dashed, muted
  };

  useEffect(() => {
    if (!schema.length || !svgRef.current || !containerRef.current) return;

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', W).attr('height', H);

    // Arrowhead markers
    const defs = svg.append('defs');
    const makeMarker = (id: string, color: string) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 9).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    };
    makeMarker('arrow-real',     c.realLine);
    makeMarker('arrow-inferred', c.inferLine);

    const g = svg.append('g');
    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', e => g.attr('transform', e.transform)));

    const cardWidth   = 200;
    const rowHeight   = 20;
    const headerH     = 34;
    const COLS        = Math.min(4, schema.length);

    const nodes = schema.map((t, i) => {
      const isMatched = !diagramSearch || 
        t.name.toLowerCase().includes(diagramSearch.toLowerCase()) ||
        t.columns.some(col => col.name.toLowerCase().includes(diagramSearch.toLowerCase()));
      return {
        id: t.name,
        x: (i % COLS) * 280 + 60,
        y: Math.floor(i / COLS) * 340 + 60,
        table: t,
        isMatched,
      };
    });
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Compute all links
    const realLinks     = getRealLinks(schema);
    const inferredLinks = getInferredLinks(schema, realLinks);
    const allLinks      = [...realLinks, ...inferredLinks];

    // Layer: FK lines (drawn BELOW cards)
    const linkLayer = g.append('g').attr('class', 'link-layer');

    const drawLinks = () => {
      linkLayer.selectAll('path').remove();
      allLinks.forEach(link => {
        const fromNode = nodeMap.get(link.fromTable);
        const toNode   = nodeMap.get(link.toTable);
        if (!fromNode || !toNode) return;

        const fromColIdx = fromNode.table.columns.findIndex(col => col.name === link.fromCol);
        const toColIdx   = toNode.table.columns.findIndex(col => col.name === link.toCol);
        if (fromColIdx === -1 || toColIdx === -1) return;

        const x1 = fromNode.x + cardWidth;
        const y1 = fromNode.y + headerH + fromColIdx * rowHeight + rowHeight / 2;
        const x2 = toNode.x;
        const y2 = toNode.y + headerH + toColIdx * rowHeight + rowHeight / 2;
        const mx = (x1 + x2) / 2;

        const bothMatched = fromNode.isMatched && toNode.isMatched;

        linkLayer.append('path')
          .datum(link)
          .attr('class', 'schema-link')
          .attr('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`)
          .attr('fill', 'none')
          .attr('stroke', link.kind === 'real' ? c.realLine : c.inferLine)
          .attr('stroke-width', link.kind === 'real' ? 2 : 1.2)
          .attr('stroke-dasharray', link.kind === 'real' ? 'none' : '6,4')
          .attr('opacity',  link.kind === 'real' ? (bothMatched ? 0.85 : 0.15) : (bothMatched ? 0.5 : 0.08))
          .attr('marker-end', `url(#arrow-${link.kind})`);
      });
    };

    drawLinks();

    // Draw table cards
    const nodeGroups = g.selectAll<SVGGElement, typeof nodes[0]>('.table-node')
      .data(nodes)
      .join('g')
      .attr('class', 'table-node cursor-move')
      .attr('opacity', d => d.isMatched ? 1.0 : 0.2)
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .on('mouseover', function(_event, d) {
        if (!d.isMatched) return;
        d3.selectAll('.schema-link')
          .transition().duration(150)
          .attr('stroke', l => {
            const link = l as any;
            if (link.fromTable === d.id || link.toTable === d.id) {
              return '#38bdf8';
            }
            return link.kind === 'real' ? c.realLine : c.inferLine;
          })
          .attr('stroke-width', l => {
            const link = l as any;
            if (link.fromTable === d.id || link.toTable === d.id) {
              return 3.5;
            }
            return link.kind === 'real' ? 2 : 1.2;
          })
          .attr('opacity', l => {
            const link = l as any;
            if (link.fromTable === d.id || link.toTable === d.id) {
              return 1.0;
            }
            return 0.1;
          });

        d3.select(this).select('.card-rect')
          .transition().duration(150)
          .attr('stroke', '#38bdf8')
          .attr('stroke-width', 2.5);
      })
      .on('mouseout', function() {
        d3.selectAll('.schema-link')
          .transition().duration(150)
          .attr('stroke', l => {
            const link = l as any;
            return link.kind === 'real' ? c.realLine : c.inferLine;
          })
          .attr('stroke-width', l => {
            const link = l as any;
            return link.kind === 'real' ? 2 : 1.2;
          })
          .attr('opacity', l => {
            const link = l as any;
            const fromNode = nodeMap.get(link.fromTable);
            const toNode = nodeMap.get(link.toTable);
            const bothMatched = (fromNode?.isMatched && toNode?.isMatched);
            return link.kind === 'real' ? (bothMatched ? 0.85 : 0.15) : (bothMatched ? 0.5 : 0.08);
          });

        d3.select(this).select('.card-rect')
          .transition().duration(150)
          .attr('stroke', c.border)
          .attr('stroke-width', 1.5);
      })
      .on('dblclick', function(event, d) {
        event.stopPropagation();
        setShowSchemaDiagram(false);
        addCell(`SELECT * FROM ${d.id} LIMIT 10;`, `Query ${d.id}`);
      })
      .call(d3.drag<SVGGElement, typeof nodes[0]>()
        .on('drag', function(event, d) {
          d.x = event.x;
          d.y = event.y;
          d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
          drawLinks();
        }) as any);

    // Card background
    nodeGroups.append('rect')
      .attr('class', 'card-rect')
      .attr('width', cardWidth)
      .attr('height', d => headerH + d.table.columns.length * rowHeight + 10)
      .attr('rx', 8)
      .attr('fill', c.card)
      .attr('stroke', c.border)
      .attr('stroke-width', 1.5);

    // Header background
    nodeGroups.append('rect')
      .attr('width', cardWidth).attr('height', headerH)
      .attr('rx', 8).attr('fill', c.header)
      .attr('clip-path', 'inset(0 0 8 0)');

    // Table name
    nodeGroups.append('text')
      .attr('x', 12).attr('y', 22)
      .attr('fill', c.textPrimary)
      .attr('font-size', '12px').attr('font-weight', '700')
      .text(d => d.id);

    // FK count badge on header
    nodeGroups.each(function(d) {
      const realCount = realLinks.filter(l => l.fromTable === d.id || l.toTable === d.id).length;
      const inferCount = inferredLinks.filter(l => l.fromTable === d.id || l.toTable === d.id).length;
      if (realCount + inferCount > 0) {
        d3.select(this).append('text')
          .attr('x', cardWidth - 10).attr('y', 22)
          .attr('text-anchor', 'end')
          .attr('fill', c.accent)
          .attr('font-size', '10px').attr('font-weight', '700')
          .text(`${realCount}FK${inferCount > 0 ? ` +${inferCount}~` : ''}`);
      }
    });

    // Columns
    nodeGroups.each(function(d) {
      const colG = d3.select(this).append('g').attr('transform', `translate(0, ${headerH + 4})`);
      d.table.columns.forEach((col, i) => {
        const row = colG.append('g').attr('transform', `translate(0, ${i * rowHeight})`);

        // Highlight FK columns that have an inferred/real link
        const isFK = allLinks.some(l =>
          (l.fromTable === d.id && l.fromCol === col.name) ||
          (l.toTable === d.id && l.toCol === col.name)
        );

        if (col.isPrimaryKey) {
          row.append('text').attr('x', 9).attr('y', 13)
            .attr('fill', c.pkColor).attr('font-size', '8px').attr('font-weight', '900')
            .text('PK');
        } else if (isFK) {
          row.append('text').attr('x', 9).attr('y', 13)
            .attr('fill', c.accent).attr('font-size', '8px').attr('font-weight', '700')
            .text('FK');
        }

        row.append('text')
          .attr('x', (col.isPrimaryKey || isFK) ? 26 : 12)
          .attr('y', 13)
          .attr('fill', (col.isPrimaryKey || isFK) ? c.textPrimary : c.textMuted)
          .attr('font-size', '11px')
          .text(col.name);

        row.append('text')
          .attr('x', cardWidth - 10).attr('y', 13)
          .attr('text-anchor', 'end')
          .attr('fill', c.textType)
          .attr('font-size', '10px').attr('font-family', 'monospace')
          .text(col.type.toLowerCase().split('(')[0].slice(0, 12));
      });
    });

    // ── No legend in SVG — rendered as fixed HTML overlay below ──────────────

  }, [schema, appTheme, diagramSearch]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative" style={{ background: c.bg }}>
      <svg ref={svgRef} className="w-full h-full" />

      {/* Floating Search Input Overlay */}
      <div 
        className="absolute top-4 right-4 flex items-center bg-surface-card/85 backdrop-blur border border-surface-border rounded-xl px-2.5 py-1.5 focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30 transition-all shadow-lg max-w-xs"
        style={{ borderColor: c.border }}
      >
        <Search className="w-3.5 h-3.5 text-text-muted mr-2 shrink-0" />
        <input
          type="text"
          placeholder="Search tables or columns..."
          value={diagramSearch}
          onChange={e => setDiagramSearch(e.target.value)}
          className="bg-transparent text-xs text-text-primary focus:outline-none w-48 placeholder:text-text-muted/60 font-medium"
        />
        {diagramSearch && (
          <button
            onClick={() => setDiagramSearch('')}
            className="text-text-muted hover:text-text-primary text-[10px] uppercase font-bold shrink-0 ml-1.5 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Fixed legend — outside the SVG zoom group so it never moves */}
      <div
        className="absolute bottom-4 left-4 rounded-lg border px-3 py-2.5 text-[10px] flex flex-col gap-2 pointer-events-none"
        style={{ background: c.card, borderColor: c.border, color: c.textMuted }}
      >
        {/* Real FK */}
        <div className="flex items-center gap-2">
          <svg width="28" height="10">
            <line x1="0" y1="5" x2="28" y2="5" stroke={c.realLine} strokeWidth="2" />
            <polygon points="22,2 28,5 22,8" fill={c.realLine} />
          </svg>
          <span>Foreign Key (defined in DB)</span>
        </div>
        {/* Inferred */}
        <div className="flex items-center gap-2">
          <svg width="28" height="10">
            <line x1="0" y1="5" x2="28" y2="5" stroke={c.inferLine} strokeWidth="1.2" strokeDasharray="5,3" />
            <polygon points="22,2 28,5 22,8" fill={c.inferLine} />
          </svg>
          <span>Inferred by column name (_id)</span>
        </div>
        {/* Badges */}
        <div className="flex items-center gap-3 pt-0.5 border-t" style={{ borderColor: c.border }}>
          <span style={{ color: c.pkColor }} className="font-bold">PK</span>
          <span>Primary Key</span>
          <span style={{ color: c.accent }} className="font-bold ml-2">FK</span>
          <span>FK column</span>
        </div>
      </div>
    </div>
  );
}
