import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useAppStore } from '../../store/useAppStore';

export default function SchemaDiagram() {
  const schema = useAppStore(s => s.schema);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!schema.length || !svgRef.current || !containerRef.current) return;

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', W).attr('height', H);

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    const nodes = schema.map((t, i) => ({
      id: t.name,
      x: (i % 4) * 250 + 100,
      y: Math.floor(i / 4) * 300 + 100,
      tables: t,
    }));

    // Draw cards
    const cardWidth = 180;
    const rowHeight = 20;
    const headerHeight = 30;

    const nodeGroups = g.selectAll('.table-node')
      .data(nodes)
      .join('g')
      .attr('class', 'table-node cursor-move')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .call(d3.drag<SVGGElement, any>()
        .on('drag', function(event, d) {
          d.x = event.x;
          d.y = event.y;
          d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
        }) as any);

    nodeGroups.append('rect')
      .attr('width', cardWidth)
      .attr('height', d => headerHeight + d.tables.columns.length * rowHeight + 10)
      .attr('rx', 8)
      .attr('fill', '#161b2c')
      .attr('stroke', '#2a3454')
      .attr('stroke-width', 1.5);

    // Header
    nodeGroups.append('rect')
      .attr('width', cardWidth)
      .attr('height', headerHeight)
      .attr('rx', 8)
      .attr('fill', '#2a3454')
      .attr('clip-path', 'inset(0 0 10 0)');

    nodeGroups.append('text')
      .attr('x', 12)
      .attr('y', 20)
      .attr('fill', '#fff')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text(d => d.id);

    // Columns
    const colG = nodeGroups.append('g').attr('transform', `translate(0, ${headerHeight + 8})`);

    colG.each(function(d) {
      const g = d3.select(this);
      d.tables.columns.forEach((col, i) => {
        const row = g.append('g').attr('transform', `translate(0, ${i * rowHeight})`);
        
        row.append('text')
          .attr('x', 12)
          .attr('y', 12)
          .attr('fill', '#8b9cc4')
          .attr('font-size', '11px')
          .text(col.name);

        row.append('text')
          .attr('x', cardWidth - 12)
          .attr('y', 12)
          .attr('text-anchor', 'end')
          .attr('fill', '#4e5e87')
          .attr('font-size', '10px')
          .attr('font-family', 'monospace')
          .text(col.type.toLowerCase());
      });
    });

  }, [schema]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0a0e1a] overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
