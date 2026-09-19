import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { recommendChart } from '../../lib/chartRecommendation';

interface Props {
  data: Record<string, unknown>[];
  columns: string[];
  chartType: 'bar' | 'line' | 'scatter' | 'pie' | 'area' | 'bubble' | 'donut' | 'heatmap' | 'treemap' | 'histogram' | 'combo';
  onDrillDown?: (col: string, val: any) => void;
}

function formatVal(v: any): string {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function detectAxes(data: Record<string, unknown>[], columns: string[]) {
  const rec = recommendChart(data, columns);
  return {
    xCol: rec.xCol || columns[0],
    yCol: rec.yCol || columns[1] || columns[0],
    zCol: rec.zCol || rec.yCol || columns[0]
  };
}

export default function D3Chart({ data, columns, chartType, onDrillDown }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data.length || !svgRef.current || !containerRef.current) return;

    const { xCol, yCol, zCol } = detectAxes(data, columns);
    const W = containerRef.current.clientWidth || 600;
    const H = containerRef.current.clientHeight || 350;
    const margin = { top: 24, right: 24, bottom: 60, left: 60 };
    const width  = W - margin.left - margin.right;
    const height = H - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', W).attr('height', H);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const addGrid = (scale: d3.ScaleLinear<number, number>) => {
      g.append('g').attr('class', 'grid')
        .call(d3.axisLeft(scale).tickSize(-width).tickFormat(() => ''))
        .selectAll('line').attr('stroke', '#1c2540').attr('stroke-dasharray', '3,3');
      g.select('.grid .domain').remove();
    };

    const tooltip = d3.select(tooltipRef.current);
    const showTip = (event: MouseEvent, d: Record<string, unknown>) => {
      tooltip.style('display', 'block')
        .style('left', `${event.offsetX + 12}px`)
        .style('top',  `${event.offsetY - 24}px`)
        .html(`<strong>${xCol}:</strong> ${d[xCol] ?? '-'}<br/><strong>${yCol}:</strong> ${formatVal(d[yCol])}${chartType === 'bubble' || chartType === 'combo' ? `<br/><strong>${zCol}:</strong> ${formatVal(d[zCol])}` : ''}`);
    };
    const hideTip = () => tooltip.style('display', 'none');

    // ---- 1. BAR CHART ----
    if (chartType === 'bar') {
      const xScale = d3.scaleBand().domain(data.map(d => String(d[xCol]))).range([0, width]).padding(0.3);
      const yMax = d3.max(data, d => +d[yCol]!) ?? 0;
      const yScale = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([height, 0]);
      addGrid(yScale);

      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale))
        .selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10).attr('transform', 'rotate(-30)').style('text-anchor', 'end');
      g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10);
      
      g.selectAll('rect').data(data).join('rect')
        .attr('x', d => xScale(String(d[xCol]))!)
        .attr('y', d => yScale(+d[yCol]!))
        .attr('width', xScale.bandwidth())
        .attr('height', d => Math.max(0, height - yScale(+d[yCol]!)))
        .attr('rx', 4).attr('fill', '#f97316').attr('opacity', 0.85).style('cursor', 'pointer')
        .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 1).attr('fill', '#fb923c'); showTip(event, d as any); })
        .on('mousemove', (event, d) => showTip(event, d as any))
        .on('mouseleave', function() { d3.select(this).attr('opacity', 0.85).attr('fill', '#f97316'); hideTip(); })
        .on('click', (_event, d) => onDrillDown?.(xCol, d[xCol]));

      g.selectAll('.bar-label').data(data).join('text')
        .attr('class', 'bar-label')
        .attr('x', d => xScale(String(d[xCol]))! + xScale.bandwidth() / 2)
        .attr('y', d => yScale(+d[yCol]!) - 6)
        .attr('text-anchor', 'middle').attr('fill', '#e2e8f0').attr('font-size', '9px').attr('font-weight', '500')
        .text(d => formatVal(d[yCol]));
    }

    // ---- 2. LINE & AREA CHARTS ----
    if (chartType === 'line' || chartType === 'area') {
      const xScale = d3.scalePoint().domain(data.map(d => String(d[xCol]))).range([0, width]).padding(0.1);
      const yMax = d3.max(data, d => +d[yCol]!) ?? 0;
      const yScale = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([height, 0]);
      addGrid(yScale);

      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale))
        .selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10).attr('transform', 'rotate(-30)').style('text-anchor', 'end');
      g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10);
      
      if (chartType === 'area') {
        const area = d3.area<any>().x(d => xScale(String(d[xCol]))!).y0(height).y1(d => yScale(+d[yCol]!)).curve(d3.curveMonotoneX);
        const grad = svg.append('defs').append('linearGradient').attr('id', 'area-grad').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#38bdf8').attr('stop-opacity', 0.4);
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#38bdf8').attr('stop-opacity', 0.05);
        g.append('path').datum(data).attr('fill', 'url(#area-grad)').attr('d', area);
      }

      const line = d3.line<any>().x(d => xScale(String(d[xCol]))!).y(d => yScale(+d[yCol]!)).curve(d3.curveMonotoneX);
      g.append('path').datum(data).attr('fill', 'none').attr('stroke', '#38bdf8').attr('stroke-width', 2.5).attr('d', line);
      
      g.selectAll('circle').data(data).join('circle')
        .attr('cx', d => xScale(String(d[xCol]))!).attr('cy', d => yScale(+d[yCol]!))
        .attr('r', 4).attr('fill', '#38bdf8').attr('stroke', '#060913').attr('stroke-width', 2).style('cursor', 'pointer')
        .on('mouseover', function(event, d) { d3.select(this).attr('r', 6).attr('fill', '#7dd3fc'); showTip(event, d); })
        .on('mouseleave', function() { d3.select(this).attr('r', 4).attr('fill', '#38bdf8'); hideTip(); })
        .on('click', (_event, d) => onDrillDown?.(xCol, d[xCol]));
    }

    // ---- 3. SCATTER & BUBBLE CHARTS ----
    if (chartType === 'scatter' || chartType === 'bubble') {
      const xScale = d3.scaleLinear().domain(d3.extent(data, d => +d[xCol]!) as [number, number]).nice().range([0, width]);
      const yScale = d3.scaleLinear().domain(d3.extent(data, d => +d[yCol]!) as [number, number]).nice().range([height, 0]);
      const zScale = d3.scaleLinear().domain(d3.extent(data, d => +d[zCol]!) as [number, number]).range([6, 24]);

      addGrid(yScale);
      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10);
      g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10);

      g.selectAll('circle').data(data).join('circle')
        .attr('cx', d => xScale(+d[xCol]!)).attr('cy', d => yScale(+d[yCol]!))
        .attr('r', d => chartType === 'bubble' ? zScale(+d[zCol]!) : 5)
        .attr('fill', '#a855f7').attr('opacity', 0.65).attr('stroke', '#c084fc').attr('stroke-width', 1.5).style('cursor', 'pointer')
        .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 1).attr('stroke', '#fff'); showTip(event, d as any); })
        .on('mouseleave', function() { d3.select(this).attr('opacity', 0.65).attr('stroke', '#c084fc'); hideTip(); });
    }

    // ---- 4. PIE & DONUT CHARTS ----
    if (chartType === 'pie' || chartType === 'donut') {
      const isDonut = chartType === 'donut';
      const pieData = data.slice(0, 10);
      const color = d3.scaleOrdinal(d3.schemeTableau10);
      const radius = Math.min(width, height) / 2 - 15;
      const pieCenterX = width / 2;
      const pieCenterY = height / 2;

      const pie = d3.pie<any>().value(d => +d[yCol]!).sort(null);
      const arc = d3.arc<any>().innerRadius(isDonut ? radius * 0.58 : 0).outerRadius(radius).cornerRadius(4);
      const pieG = g.append('g').attr('transform', `translate(${pieCenterX},${pieCenterY})`);
      const arcs = pie(pieData);

      pieG.selectAll('path').data(arcs).join('path')
        .attr('d', arc).attr('fill', (_d, i) => color(i.toString())).attr('stroke', '#060913').attr('stroke-width', 3).style('cursor', 'pointer')
        .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 0.85); showTip(event, d.data); })
        .on('mouseleave', function() { d3.select(this).attr('opacity', 1); hideTip(); });

      if (isDonut) {
        const totalSum = d3.sum(pieData, d => +d[yCol]! || 0);
        pieG.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em').attr('fill', '#94a3b8').attr('font-size', '10px').attr('font-weight', 'bold').text('TOTAL');
        pieG.append('text').attr('text-anchor', 'middle').attr('dy', '1em').attr('fill', '#f97316').attr('font-size', '14px').attr('font-weight', 'extrabold').text(formatVal(totalSum));
      }
    }

    // ---- 5. HEATMAP GRID ----
    if (chartType === 'heatmap') {
      const xDomain = Array.from(new Set(data.map(d => String(d[xCol]))));
      const yDomain = Array.from(new Set(data.map(d => String(d[zCol] || d[yCol]))));
      const xScale = d3.scaleBand().domain(xDomain).range([0, width]).padding(0.05);
      const yScale = d3.scaleBand().domain(yDomain).range([height, 0]).padding(0.05);

      const maxVal = d3.max(data, d => +d[yCol]!) || 1;
      const colorScale = d3.scaleSequential(d3.interpolateOranges).domain([0, maxVal]);

      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale))
        .selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 9).attr('transform', 'rotate(-30)').style('text-anchor', 'end');
      g.append('g').call(d3.axisLeft(yScale)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 9);

      g.selectAll('rect').data(data).join('rect')
        .attr('x', d => xScale(String(d[xCol]))!)
        .attr('y', d => yScale(String(d[zCol] || d[yCol]))!)
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('rx', 3)
        .attr('fill', d => colorScale(+d[yCol]!))
        .style('cursor', 'pointer')
        .on('mouseover', (event, d) => showTip(event, d as any))
        .on('mouseleave', () => hideTip());
    }

    // ---- 6. TREEMAP ----
    if (chartType === 'treemap') {
      const rootData: any = { children: data };
      const root = d3.hierarchy<any>(rootData)
        .sum(d => +d[yCol] || 1)
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      d3.treemap<any>().size([width, height]).padding(3)(root);
      const color = d3.scaleOrdinal(d3.schemeTableau10);

      const leaves = g.selectAll('g').data(root.leaves()).join('g')
        .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`);

      leaves.append('rect')
        .attr('width', (d: any) => Math.max(0, d.x1 - d.x0))
        .attr('height', (d: any) => Math.max(0, d.y1 - d.y0))
        .attr('rx', 4)
        .attr('fill', (_d, i) => color(i.toString()))
        .attr('opacity', 0.85)
        .style('cursor', 'pointer')
        .on('mouseover', (event, d: any) => showTip(event, d.data as any))
        .on('mouseleave', () => hideTip());

      leaves.append('text')
        .attr('x', 6).attr('y', 16)
        .attr('fill', '#ffffff').attr('font-size', '10px').attr('font-weight', 'bold')
        .text((d: any) => (d.x1 - d.x0 > 45 && d.y1 - d.y0 > 25) ? String(d.data[xCol] ?? '').slice(0, 10) : '');
    }

    // ---- 7. HISTOGRAM ----
    if (chartType === 'histogram') {
      const numericVals = data.map(d => +d[yCol]!).filter(v => !isNaN(v));
      const xScale = d3.scaleLinear().domain(d3.extent(numericVals) as [number, number]).nice().range([0, width]);

      const bins = d3.bin().domain(xScale.domain() as [number, number]).thresholds(xScale.ticks(8))(numericVals);
      const yScale = d3.scaleLinear().domain([0, d3.max(bins, d => d.length) || 1]).nice().range([height, 0]);

      addGrid(yScale);
      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale).ticks(6)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10);
      g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10);

      g.selectAll('rect').data(bins).join('rect')
        .attr('x', d => xScale(d.x0!))
        .attr('y', d => yScale(d.length))
        .attr('width', d => Math.max(0, xScale(d.x1!) - xScale(d.x0!) - 1))
        .attr('height', d => Math.max(0, height - yScale(d.length)))
        .attr('rx', 3).attr('fill', '#10b981').attr('opacity', 0.85);
    }

    // ---- 8. COMBO CHART (Bar + Line Overlay) ----
    if (chartType === 'combo') {
      const xScale = d3.scaleBand().domain(data.map(d => String(d[xCol]))).range([0, width]).padding(0.3);
      const y1Max = d3.max(data, d => +d[yCol]!) ?? 0;
      const y2Max = d3.max(data, d => +d[zCol]!) ?? 0;

      const y1Scale = d3.scaleLinear().domain([0, y1Max * 1.1]).nice().range([height, 0]);
      const y2Scale = d3.scaleLinear().domain([0, y2Max * 1.1]).nice().range([height, 0]);
      addGrid(y1Scale);

      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale))
        .selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 10).attr('transform', 'rotate(-30)').style('text-anchor', 'end');
      g.append('g').call(d3.axisLeft(y1Scale).ticks(5)).selectAll('text').attr('fill', '#f97316').attr('font-size', 10);
      g.append('g').attr('transform', `translate(${width},0)`).call(d3.axisRight(y2Scale).ticks(5)).selectAll('text').attr('fill', '#38bdf8').attr('font-size', 10);

      // Primary Metric Bars
      g.selectAll('rect').data(data).join('rect')
        .attr('x', d => xScale(String(d[xCol]))!)
        .attr('y', d => y1Scale(+d[yCol]!))
        .attr('width', xScale.bandwidth())
        .attr('height', d => Math.max(0, height - y1Scale(+d[yCol]!)))
        .attr('rx', 4).attr('fill', '#f97316').attr('opacity', 0.75)
        .on('mouseover', (event, d) => showTip(event, d as any))
        .on('mouseleave', () => hideTip());

      // Secondary Metric Overlay Line
      const line = d3.line<any>().x(d => xScale(String(d[xCol]))! + xScale.bandwidth() / 2).y(d => y2Scale(+d[zCol]!)).curve(d3.curveMonotoneX);
      g.append('path').datum(data).attr('fill', 'none').attr('stroke', '#38bdf8').attr('stroke-width', 2.5).attr('d', line);
    }

    if (!['pie', 'donut', 'treemap'].includes(chartType)) {
      g.append('text').attr('x', width / 2).attr('y', height + 52).attr('text-anchor', 'middle').attr('fill', '#8b9cc4').attr('font-size', 10).attr('font-weight', 'bold').text(xCol);
    }
  }, [data, columns, chartType, onDrillDown]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      <div ref={tooltipRef} className="d3-tooltip" style={{ display: 'none' }} />
    </div>
  );
}
