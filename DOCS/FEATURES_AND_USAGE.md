# 📖 Features & Usage Guide

Welcome to the **NivexQL** documentation! This guide will walk you through the core features of the platform and teach you how to maximize your analytics workflow.

## 1. Connecting to a Database
NivexQL operates entirely locally, meaning your database credentials never leave your machine.
- Click the **+** button in the **Sources** section of the left sidebar.
- Enter your connection details (PostgreSQL is fully supported out of the box).
- Once connected, your active database is highlighted, and the **Schema** tab will populate automatically.

## 2. The Notebook Interface
The core of NivexQL is the Notebook. Instead of a single scratching pad, you build an analysis step-by-step using **Cells**.

### Generating SQL with AI
1. Click **New Insight** to create a blank cell.
2. In the input box at the top of the cell, type your question in plain English (e.g., *"Show me the top 5 customers by total revenue this year"*).
3. Press **Enter**. 
4. The local LLM will interpret your schema and generate the corresponding SQL, execute it, and return the data.

### Manual SQL & Shortcuts
If you prefer to write or tweak SQL manually:
- Use the **Monaco Editor** within the cell. 
- Press `Cmd + Enter` (or `Ctrl + Enter` on Windows/Linux) to execute the raw SQL directly, skipping the AI generation step.
- You can format your SQL instantly by clicking the **Format** button in the editor header.

## 3. Organizing Your Workspace

### Drag & Drop
Notice the **`⋮⋮`** grip handle in the top left of every cell? 
Click and drag it to smoothly reorder cells in your workspace. This allows you to build a logical narrative top-to-bottom.

### Cell Pinning
Have a KPI or a main table you need to keep visible at all times?
Click the **Pin Icon** in the top right of a cell. This locks the cell to the very top of your workspace. Pinned cells are visually distinct and stay at the top even as you create new cells below.

## 4. Interactive Analytics

### 🔍 Auto-Drill Downs (Result Row Click)
When looking at a data table, you don't need to write a new `WHERE` clause to investigate a specific value.
- Hover over any value in the result table.
- **Click it**.
- A brand new cell will spawn directly below, pre-filled with an AI prompt to investigate that exact value (e.g., *"Show me details where customer_tier is 'Enterprise' based on the previous query"*).

### 📊 D3 Visualizations
By default, queries returning less than 500 rows are plotted as beautiful D3.js charts.
- Toggle between **Table** and **Chart** views using the icons on the top right of the result pane.
- Select from various chart types (Bar, Line, Area, Scatter, Bubble, Pie) using the dropdown.

### 📝 Sorting & Filtering
- Click any column header to sort the table ascending or descending.
- Use the inline input box above the table headers to quickly filter down columns.

## 5. The Sidebar Tools

### Schema Integration
Click on any table in the **Schema** tab to see its columns and data types.
**Pro tip:** Click the **`+`** icon next to a table name to instantly inject that table's name into your active cell's prompt!

### Query History
The **History** tab tracks every successful and failed query run during your session, including row counts and execution time.
- Click any past query to instantly load it back into your active cell.

### 🧠 Business Context (Crucial Feature)
AI struggles with company-specific jargon. The **Context** tab solves this.
- Open the Context tab.
- Define your business rules in plain English (e.g., *"When I ask for 'active users', it means users with `last_login > 30 days`"*).
- The agent will automatically inject these rules as system instructions into *every* query it generates, ensuring absolute accuracy for your specific domain.

## 6. Agentic Auto-Correction
If the AI generates a query that hits a PostgreSQL syntax error or a missing column error, **you don't need to fix it**.
The backend catches the database error, feeds the exact error message back to the LLM, and asks it to correct its mistake. You will see this happen live in the agent status log beneath the editor!
