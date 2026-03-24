# Reach Skyline Dashboard

A modern, professional marketing analytics dashboard built with React, Tailwind CSS, and Recharts.

## Features

- **Real-time Data**: Fetches data from Google Sheets API via OpenSheet.
- **Auto-Refresh**: Automatically refreshes performance metrics every 5 minutes.
- **Premium UI**: Sleek, SaaS-style interface with glassmorphism and smooth animations.
- **KPI Metrics**: Track Total Leads, Clicks, Reach, Spend, and Average CPL at a glance.
- **Interactive Charts**:
  - Bar Chart: Performance by Campaign.
  - Line Chart: Lead progression over time.
  - Pie Chart: Campaign status distribution.
- **Advanced Table**: Search, sort, and paginate through campaign data.
- **Smart Insights**: Automatically identifies best and worst performing campaigns with optimization warnings.
- **Dark Mode**: Fully supports high-contrast dark mode for late-night analysis.
- **Responsive**: Optimised for Desktop, Tablet, and Mobile.

## Tech Stack

- **React.js** (Vite)
- **Tailwind CSS** (Styling)
- **Recharts** (Data Visualization)
- **Framer Motion** (Animations)
- **Lucide React** (Icons)
- **Axios** (API Calls)

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Locally**:
   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

## API Integration

The application fetches data from:
`https://opensheet.elk.sh/1PQYedruILIibtQ8RJnEnUmTU_mxxwV_lT3tVz2SZ6i0/clean_data`

### Data Cleaning Process

- Strips currency symbols (₹) and commas from numeric strings.
- Handles empty values as 0 to ensure accurate calculations.
- Calculates automated metrics like Total Spend and Cost Per Lead (CPL).

---
Developed with ❤️ by Antigravity.
