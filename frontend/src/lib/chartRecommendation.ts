export interface ChartRecommendation {
  chartType: 'bar' | 'line' | 'scatter' | 'pie' | 'area' | 'bubble' | 'donut' | 'heatmap' | 'treemap' | 'histogram' | 'combo';
  isMetricCard: boolean;
  reason: string;
  xCol: string;
  yCol: string;
  zCol?: string;
}

/** Check if sample values in a column are numeric */
export function isNumericValues(values: unknown[]): boolean {
  if (!values.length) return false;
  let numericCount = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (!isNaN(n) && isFinite(n)) {
      numericCount++;
    }
  }
  return numericCount / values.length >= 0.7;
}

/** Check if sample values represent dates or timestamps */
export function isDateValues(colName: string, values: unknown[]): boolean {
  const nameLower = colName.toLowerCase();
  const dateNameHints = ['date', 'time', 'created_at', 'updated_at', 'month', 'year', 'day', 'timestamp', 'dt'];
  const hasNameHint = dateNameHints.some(hint => nameLower.includes(hint));

  if (!values.length) return hasNameHint;

  let dateCount = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const str = String(v).trim();
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(str) || /^\d{4}[-/]\d{2}/.test(str)) {
      dateCount++;
    } else if (hasNameHint && !isNaN(Date.parse(str)) && isNaN(Number(str))) {
      dateCount++;
    }
  }

  return (dateCount / values.length >= 0.6) || (hasNameHint && dateCount > 0);
}

/** Detect optimal axes & semantic recommendations */
export function recommendChart(
  data: Record<string, unknown>[],
  columns: string[]
): ChartRecommendation {
  if (!data || !data.length || !columns || !columns.length) {
    return {
      chartType: 'bar',
      isMetricCard: false,
      reason: 'Default Layout',
      xCol: columns?.[0] || '',
      yCol: columns?.[1] || columns?.[0] || '',
    };
  }

  // 1. Check for single aggregate / metric card condition (1 row, 1-2 numeric columns, no category)
  if (data.length === 1) {
    const numericCols = columns.filter(c => !isNaN(Number(data[0][c])));
    if (numericCols.length === 1 && columns.length <= 2) {
      return {
        chartType: 'bar',
        isMetricCard: true,
        reason: 'Single Metric Aggregate',
        xCol: columns[0],
        yCol: numericCols[0],
      };
    }
  }

  const sampleSize = Math.min(data.length, 50);
  const sample = data.slice(0, sampleSize);

  // Column type classification
  const numericCols: string[] = [];
  const dateCols: string[] = [];
  const categoricalCols: string[] = [];

  for (const col of columns) {
    const vals = sample.map(r => r[col]);
    if (isDateValues(col, vals)) {
      dateCols.push(col);
    } else if (isNumericValues(vals)) {
      numericCols.push(col);
    } else {
      categoricalCols.push(col);
    }
  }

  // Score measures (numeric Y columns) for best priority
  const measureKeywords = ['total', 'amount', 'sales', 'revenue', 'count', 'sum', 'avg', 'price', 'quantity', 'val', 'score', 'percent', 'rate', 'cost', 'profit'];
  const sortedNumericCols = [...numericCols].sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aMatch = measureKeywords.some(kw => aLower.includes(kw)) ? 2 : 0;
    const bMatch = measureKeywords.some(kw => bLower.includes(kw)) ? 2 : 0;
    return bMatch - aMatch;
  });

  const primaryY = sortedNumericCols[0] || numericCols[0] || columns[1] || columns[0];
  const secondaryY = sortedNumericCols[1] || numericCols[1] || primaryY;

  // Case A: Date Time-Series Trend
  if (dateCols.length > 0 && numericCols.length > 0) {
    const primaryX = dateCols[0];
    const isAreaSuitable = data.length >= 10;
    return {
      chartType: isAreaSuitable ? 'area' : 'line',
      isMetricCard: false,
      reason: isAreaSuitable ? 'Continuous Time Series Trend' : 'Date Sequence Trend',
      xCol: primaryX,
      yCol: primaryY,
    };
  }

  // Case B: 3+ Numeric Dimensions => Bubble Chart
  if (numericCols.length >= 3 && categoricalCols.length === 0 && dateCols.length === 0) {
    return {
      chartType: 'bubble',
      isMetricCard: false,
      reason: '3D Numerical Correlation',
      xCol: sortedNumericCols[2] || numericCols[0],
      yCol: primaryY,
      zCol: secondaryY,
    };
  }

  // Case C: 2 Numeric Dimensions => Scatter Plot
  if (numericCols.length >= 2 && categoricalCols.length === 0 && dateCols.length === 0) {
    return {
      chartType: 'scatter',
      isMetricCard: false,
      reason: 'Bivariate Correlation',
      xCol: sortedNumericCols[1] || numericCols[1],
      yCol: primaryY,
    };
  }

  // Case D: Categorical + Numeric
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    // Exclude primary ID columns if better category string exists
    const bestCatCol = categoricalCols.find(c => !/^id$|_id$|uuid$/i.test(c)) || categoricalCols[0];
    const uniqueValues = new Set(data.map(r => String(r[bestCatCol])));

    if (uniqueValues.size >= 2 && uniqueValues.size <= 8 && data.length <= 12) {
      return {
        chartType: 'pie',
        isMetricCard: false,
        reason: 'Proportional Distribution (2–8 categories)',
        xCol: bestCatCol,
        yCol: primaryY,
      };
    }

    return {
      chartType: 'bar',
      isMetricCard: false,
      reason: `Categorical Comparison (${uniqueValues.size} items)`,
      xCol: bestCatCol,
      yCol: primaryY,
    };
  }

  // Fallback default
  return {
    chartType: 'bar',
    isMetricCard: false,
    reason: 'Standard View',
    xCol: columns[0],
    yCol: columns[1] || columns[0],
  };
}
