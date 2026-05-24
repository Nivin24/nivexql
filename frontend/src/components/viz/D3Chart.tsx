import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Props {
  data: Record<string, unknown>[];
  columns: string[];
  chartType: 'bar' | 'line' | 'scatter' | 'pie' | 'area' | 'bubble';
  onDrillDown?: (col: string, val: any) => void;
}

function formatVal(v: any): string {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function detectAxes(data: Record<string, unknown>[], columns: string[]) {
  const numericCols = columns.filter(c => {
    const sample = data.slice(0, 10).map(r => r[c]);
    return sample.every(v => v !== null && !isNaN(Number(v)));
  });
  const categoricalCols = columns.filter(c => !numericCols.includes(c));
  const xCol = categoricalCols[0] ?? columns[0];
  const yCol = numericCols[0] ?? columns[1] ?? columns[0];
  const zCol = numericCols[1] ?? numericCols[0]; // For bubble size
  return { xCol, yCol, zCol };
}

export default function D3Chart({ data, columns, chartType, onDrillDown }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data.length || !svgRef.current || !containerRef.current) return;

    const { xCol, yCol, zCol } = detectAxes(data, columns);
    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;
    const margin = { top: 20, right: 24, bottom: 60, left: 60 };
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
        .html(`<strong>${xCol}:</strong> ${d[xCol]}<br/><strong>${yCol}:</strong> ${d[yCol]}${chartType === 'bubble' ? `<br/><strong>${zCol}:</strong> ${d[zCol]}` : ''}`);
    };
    const hideTip = () => tooltip.style('display', 'none');

    // ---- BAR ----
    if (chartType === 'bar') {
      const xScale = d3.scaleBand().domain(data.map(d => String(d[xCol]))).range([0, width]).padding(0.3);
      const yMax = d3.max(data, d => +d[yCol]!) ?? 0;
      const yScale = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([height, 0]);
      addGrid(yScale);
      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale))
        .selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11).attr('transform', 'rotate(-30)').style('text-anchor', 'end');
      g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11);
      
      g.selectAll('rect').data(data).join('rect')
        .attr('x', d => xScale(String(d[xCol]))!).attr('y', d => yScale(+d[yCol]!))
        .attr('width', xScale.bandwidth()).attr('height', d => height - yScale(+d[yCol]!))
        .attr('rx', 4).attr('fill', '#6c8dfa').attr('opacity', 0.85).style('cursor', 'pointer')
        .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 1).attr('fill', '#8aa5fc'); showTip(event, d as any); })
        .on('mousemove', (event, d) => showTip(event, d as any))
        .on('mouseleave', function() { d3.select(this).attr('opacity', 0.85).attr('fill', '#6c8dfa'); hideTip(); })
        .on('click', (_event, d) => onDrillDown?.(xCol, d[xCol]));

      g.selectAll('.bar-label')
        .data(data)
        .join('text')
        .attr('class', 'bar-label')
        .attr('x', d => xScale(String(d[xCol]))! + xScale.bandwidth() / 2)
        .attr('y', d => yScale(+d[yCol]!) - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e8edf8')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .text(d => formatVal(d[yCol]));
    }

    // ---- LINE & AREA ----
    if (chartType === 'line' || chartType === 'area') {
      const xScale = d3.scalePoint().domain(data.map(d => String(d[xCol]))).range([0, width]).padding(0.1);
      const yMax = d3.max(data, d => +d[yCol]!) ?? 0;
      const yScale = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([height, 0]);
      addGrid(yScale);
      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale))
        .selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11).attr('transform', 'rotate(-30)').style('text-anchor', 'end');
      g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11);
      
      if (chartType === 'area') {
        const area = d3.area<any>().x(d => xScale(String(d[xCol]))!).y0(height).y1(d => yScale(+d[yCol]!)).curve(d3.curveMonotoneX);
        const grad = svg.append('defs').append('linearGradient').attr('id', 'area-grad').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#6c8dfa').attr('stop-opacity', 0.4);
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#6c8dfa').attr('stop-opacity', 0.05);
        g.append('path').datum(data).attr('fill', 'url(#area-grad)').attr('d', area);
      }

      const line = d3.line<any>().x(d => xScale(String(d[xCol]))!).y(d => yScale(+d[yCol]!)).curve(d3.curveMonotoneX);
      g.append('path').datum(data).attr('fill', 'none').attr('stroke', '#6c8dfa').attr('stroke-width', 2.5).attr('d', line);
      
      g.selectAll('circle').data(data).join('circle')
        .attr('cx', d => xScale(String(d[xCol]))!).attr('cy', d => yScale(+d[yCol]!))
        .attr('r', 4).attr('fill', '#6c8dfa').attr('stroke', '#0a0e1a').attr('stroke-width', 2).style('cursor', 'pointer')
        .on('mouseover', function(event, d) { d3.select(this).attr('r', 6).attr('fill', '#8aa5fc'); showTip(event, d); })
        .on('mouseleave', function() { d3.select(this).attr('r', 4).attr('fill', '#6c8dfa'); hideTip(); })
        .on('click', (_event, d) => onDrillDown?.(xCol, d[xCol]));

      g.selectAll('.line-label')
        .data(data)
        .join('text')
        .attr('class', 'line-label')
        .attr('x', d => xScale(String(d[xCol]))!)
        .attr('y', d => yScale(+d[yCol]!) - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e8edf8')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .text(d => formatVal(d[yCol]));
    }

    // ---- SCATTER & BUBBLE ----
    if (chartType === 'scatter' || chartType === 'bubble') {
      const xNum = columns.filter(c => !isNaN(Number(data[0]?.[c])))[0] ?? columns[0];
      const yNum = columns.filter(c => !isNaN(Number(data[0]?.[c])))[1] ?? columns[1] ?? columns[0];
      const xScale = d3.scaleLinear().domain(d3.extent(data, d => +d[xNum]!) as [number, number]).nice().range([0, width]);
      const yScale = d3.scaleLinear().domain(d3.extent(data, d => +d[yNum]!) as [number, number]).nice().range([height, 0]);
      
      const zScale = d3.scaleLinear()
        .domain(d3.extent(data, d => +d[zCol]!) as [number, number])
        .range([5, 25]);

      addGrid(yScale);
      g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11);
      g.append('g').call(d3.axisLeft(yScale).ticks(5)).selectAll('text').attr('fill', '#8b9cc4').attr('font-size', 11);

      g.selectAll('circle').data(data).join('circle')
        .attr('cx', d => xScale(+d[xNum]!)).attr('cy', d => yScale(+d[yNum]!))
        .attr('r', d => chartType === 'bubble' ? zScale(+d[zCol]!) : 5)
        .attr('fill', '#6c8dfa').attr('opacity', 0.6).attr('stroke', '#6c8dfa').attr('stroke-width', 1.5).style('cursor', 'pointer')
        .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 1).attr('stroke', '#fff'); showTip(event, d as any); })
        .on('mouseleave', function() { d3.select(this).attr('opacity', 0.6).attr('stroke', '#6c8dfa'); hideTip(); })
        .on('click', (_event, d) => onDrillDown?.(xCol, d[xCol]));

      g.selectAll('.scatter-label')
        .data(data)
        .join('text')
        .attr('class', 'scatter-label')
        .attr('x', d => xScale(+d[xNum]!))
        .attr('y', d => yScale(+d[yNum]!) - (chartType === 'bubble' ? zScale(+d[zCol]!) + 4 : 8))
        .attr('text-anchor', 'middle')
        .attr('fill', '#e8edf8')
        .attr('font-size', '9px')
        .attr('font-weight', '500')
        .text(d => formatVal(d[yNum]));
    }

    // ---- PIE ----
    if (chartType === 'pie') {
      let radius: number;
      let pieCenterX: number;
      let pieCenterY: number;
      let legendX: number;
      let legendY: number;
      const isVertical = width < 420; // Stack vertically if width is narrow

      const sliceCount = isVertical ? 8 : 10;
      const pieData = data.slice(0, sliceCount);
      const color = d3.scaleOrdinal(d3.schemeTableau10);

      if (isVertical) {
        // Stack layout: Pie on top, legend at the bottom
        const pieHeight = height - 50; // Reserve bottom area for legend flow
        radius = Math.min(width, pieHeight) / 2 - 15;
        pieCenterX = width / 2;
        pieCenterY = radius + 10;

        legendX = 0; // Align with left margin of the chart
        legendY = pieCenterY + radius + 20;
      } else {
        // Horizontal layout: Pie on left, legend on right
        const pieWidth = width - 140; // Reserve 140px on the right for legend
        radius = Math.min(pieWidth, height) / 2 - 20;
        pieCenterX = pieWidth / 2 + 10;
        pieCenterY = height / 2;

        legendX = width - 120;
        legendY = Math.max(10, (height - (pieData.length * 18)) / 2);
      }

      const pie = d3.pie<any>().value(d => +d[yCol]!).sort(null);
      const arc = d3.arc<any>().innerRadius(radius * 0.55).outerRadius(radius).cornerRadius(4);
      const pieG = g.append('g').attr('transform', `translate(${pieCenterX},${pieCenterY})`);

      const arcs = pie(pieData);

      pieG.selectAll('path').data(arcs).join('path')
        .attr('d', arc).attr('fill', (_d, i) => color(i.toString())).attr('stroke', '#0a0e1a').attr('stroke-width', 3).style('cursor', 'pointer')
        .on('mouseover', function(event, d) { d3.select(this).attr('opacity', 0.8).attr('transform', 'scale(1.05)'); showTip(event, d.data); })
        .on('mousemove', (event, d) => showTip(event, d.data))
        .on('mouseleave', function() { d3.select(this).attr('opacity', 1).attr('transform', 'scale(1)'); hideTip(); })
        .on('click', (_event, d) => onDrillDown?.(xCol, d.data[xCol]));

      pieG.selectAll('.pie-label').data(arcs).join('text')
        .attr('class', 'pie-label')
        .attr('transform', d => `translate(${arc.centroid(d)})`)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .text(d => {
          const percent = ((d.endAngle - d.startAngle) / (2 * Math.PI)) * 100;
          if (percent > 12) {
            return `${String(d.data[xCol]).slice(0, 8)} (${formatVal(d.data[yCol])})`;
          } else if (percent > 5) {
            return formatVal(d.data[yCol]);
          }
          return '';
        });

      // Legend
      const legend = g.append('g').attr('transform', `translate(${legendX}, ${legendY})`);
      if (isVertical) {
        // Horizontal flow layout for legend items
        let currentX = 0;
        let currentY = 0;
        const colWidth = 90;
        pieData.forEach((d, i) => {
          const row = legend.append('g').attr('transform', `translate(${currentX}, ${currentY})`);
          row.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2.5).attr('fill', color(i.toString()));
          row.append('text').attr('x', 16).attr('y', 9).attr('fill', '#8b9cc4').attr('font-size', '9px').text(String(d[xCol]).slice(0, 10));
          
          currentX += colWidth;
          if (currentX + colWidth > width) {
            currentX = 0;
            currentY += 15;
          }
        });
      } else {
        // Vertical stacked layout for legend items
        pieData.forEach((d, i) => {
          const row = legend.append('g').attr('transform', `translate(0, ${i * 18})`);
          row.append('rect').attr('width', 12).attr('height', 12).attr('rx', 3).attr('fill', color(i.toString()));
          row.append('text').attr('x', 20).attr('y', 10).attr('fill', '#8b9cc4').attr('font-size', '10px').text(String(d[xCol]).slice(0, 15));
        });
      }
    }

    if (chartType !== 'pie') {
      g.append('text').attr('x', width / 2).attr('y', height + 52).attr('text-anchor', 'middle').attr('fill', '#8b9cc4').attr('font-size', 11).attr('font-weight', 'bold').text(xCol);
      g.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -48).attr('text-anchor', 'middle').attr('fill', '#8b9cc4').attr('font-size', 11).attr('font-weight', 'bold').text(yCol);
    }
  }, [data, columns, chartType, onDrillDown]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      <div ref={tooltipRef} className="d3-tooltip" style={{ display: 'none' }} />
    </div>
  );
}
