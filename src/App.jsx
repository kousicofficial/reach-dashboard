import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Search, Filter, RefreshCw, TrendingUp, Users, Target,
  IndianRupee, AlertCircle, CheckCircle2, Moon, Sun, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const DATASETS = {
  dharani: {
    name: 'Dharani Kesavan',
    url: 'https://opensheet.elk.sh/1PQYedruILIibtQ8RJnEnUmTU_mxxwV_lT3tVz2SZ6i0/clean_data'
  },
  ramk7: {
    name: 'RamK7',
    url: 'https://opensheet.elk.sh/1PQYedruILIibtQ8RJnEnUmTU_mxxwV_lT3tVz2SZ6i0/clean_data1'
  }
};

// --- Helper Functions ---
const parseNumber = (val) => {
  if (val === undefined || val === null || val === '' || val === ' ') return 0;
  if (typeof val === 'number') return val;
  
  // Clean specifically for currency and standard marketing fields
  // Matches user requested: value.toString().replace(/₹|,/g, "").trim()
  const cleaned = val.toString()
    .replace(/[₹,]/g, '')     // Remove currency and commas
    .replace(/[^0-9.-]/g, '') // Remove everything else except numbers and dots
    .trim();
    
  const parsed = Number(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(val);
};

const formatNumber = (val) => {
  return new Intl.NumberFormat('en-IN').format(val);
};

function convertSheetDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s || s.toLowerCase() === 'no date') return null;

  const parts = s.split("/");
  if (parts.length !== 3) return null;

  const [month, day, year] = parts;
  // Handle 2-digit years if they exist, though user says YYYY
  const fullYear = year.length === 2 ? `20${year}` : year;

  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const formatDisplayDate = (isoDate) => {
  if (!isoDate || isoDate === '-') return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
};


// --- Components ---

const MetricCard = ({ title, value, icon: Icon, trend, prefix = '', suffix = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="card-premium flex flex-col justify-between group hover:border-primary-500 transition-all duration-300"
  >
    <div className="flex justify-between items-start">
      <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors">
        <Icon className="w-6 h-6 text-slate-600 dark:text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400" />
      </div>
    </div>
    <div className="mt-4">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</p>
      <h3 className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
        {prefix}{value}{suffix}
      </h3>
    </div>
  </motion.div>
);

const SectionHeader = ({ title, subtitle }) => (
  <div className="mb-6">
    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h2>
    <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
  </div>
);

const Skeleton = ({ className }) => (
  <div className={cn("animate-pulse bg-slate-200 dark:bg-slate-800 rounded", className)} />
);

const CardSkeleton = () => (
  <div className="card-premium h-32 flex flex-col justify-between">
    <Skeleton className="w-10 h-10 rounded-lg" />
    <div className="space-y-2">
      <Skeleton className="w-20 h-3" />
      <Skeleton className="w-32 h-6" />
    </div>
  </div>
);

const App = () => {
  const [activeDataset, setActiveDataset] = useState('dharani');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('All Status');
    setStartDate('');
    setEndDate('');
  };

  const searchRef = React.useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const baseUrl = DATASETS[activeDataset].url;
      const response = await axios.get(baseUrl);

      if (!response.data || !Array.isArray(response.data)) {
        setData([]);
        return;
      }

      // STEP 1: STANDARDIZE DATA (CRITICAL)
      const rawData = response.data || [];
      const cleaned = rawData.map((item, index) => {
        const campaign = item["Campaign name"] || item["Campaign"] || "Unknown";

        const leads = parseNumber(item["Leads"]);
        const spend = parseNumber(item["Daily ad set budget"] || item["Spend"]);
        const clicks = parseNumber(item["Link clicks"]);
        const reach = parseNumber(item["Reach"]);

        const normalizedDate = convertSheetDate(item["Date"]);

        return {
          id: `${activeDataset}-${index}`,
          campaign,
          leads,
          spend,
          clicks,
          reach,
          status: item["Campaign configured status"] || "Active",
          region: item["Region"] || "Unknown",
          normalizedDate
        };
      });

      // STEP 2: REMOVE DUPLICATES (IMPORTANT)
      const uniqueMap = new Map();

      cleaned.forEach(item => {
        const key = `${item.campaign}-${item.normalizedDate}-${item.leads}`;

        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        }
      });

      const finalData = Array.from(uniqueMap.values());

      setData(finalData);
      setLastRefreshed(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to fetch data. Please check your connection.');
      console.error('API Error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Remove auto-setting logic that may cause "No Data" issues by being too restrictive
  useEffect(() => {
    // We let the dashboard show all data by default (startDate/endDate are '')
    // This ensures full visibility on first load as requested.
  }, [data]);

  useEffect(() => {
    fetchData();
    // Auto refresh every 5 minutes (300,000ms)
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, [activeDataset]);

  // Dark Mode Toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Reset page when filters or dataset changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, startDate, endDate, activeDataset]);

  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const filteredDropdownItems = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!data.length) return [];
    
    const uniqueNames = Array.from(new Set(data.map(item => item.campaign).filter(Boolean)));
    if (!term) return uniqueNames.slice(0, 10);
    return uniqueNames.filter(name => name.toLowerCase().includes(term)).slice(0, 10);
  }, [data, searchTerm]);

  // STEP 5: FIX FILTER LOGIC (STRICT)
  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (startDate && row.normalizedDate < startDate) return false;
      if (endDate && row.normalizedDate > endDate) return false;

      if (statusFilter !== "All Status" &&
        row.status !== statusFilter) return false;

      if (searchTerm &&
        !row.campaign.toLowerCase().includes(searchTerm.toLowerCase()))
        return false;

      return true;
    });
  }, [data, startDate, endDate, statusFilter, searchTerm]);

  // Handle Sorting Separately
  const sortedData = useMemo(() => {
    let result = [...filteredData];
    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'date') {
          valA = a.normalizedDate || '';
          valB = b.normalizedDate || '';
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [filteredData, sortConfig]);

  // STEP 4: FIX KPI CALCULATION
  const stats = useMemo(() => {
    const totalLeads = filteredData.reduce((sum, row) => sum + row.leads, 0);
    const totalClicks = filteredData.reduce((sum, row) => sum + row.clicks, 0);
    const totalReach = filteredData.reduce((sum, row) => sum + row.reach, 0);
    const totalSpend = filteredData.reduce((sum, row) => sum + row.spend, 0);

    // STEP 9: DEBUG VALIDATION
    console.log("DATA LENGTH:", data.length);
    console.log("FILTERED LENGTH:", filteredData.length);
    console.log("TOTAL LEADS:", totalLeads);

    return {
      totalLeads,
      totalClicks,
      totalReach,
      totalSpend,
      avgCPL: totalLeads > 0 ? totalSpend / totalLeads : 0
    };
  }, [filteredData, data.length]);

  // Chart Data preparation
  const chartDataLeadsByCampaign = useMemo(() => {
    return [...filteredData]
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 8)
      .map(item => ({
        name: item.campaign.substring(0, 15) + '...',
        leads: item.leads
      }));
  }, [filteredData]);

  const chartDataLeadsOverTime = useMemo(() => {
    const grouped = filteredData.reduce((acc, curr) => {
      const normalized = curr.normalizedDate;
      if (!normalized) return acc;
      if (!acc[normalized]) acc[normalized] = 0;
      acc[normalized] += curr.leads;
      return acc;
    }, {});

    return Object.keys(grouped).map(date => ({
      date,
      leads: grouped[date]
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData]);

  const chartDataStatus = useMemo(() => {
    const active = filteredData.filter(d => d.status === 'Active').length;
    const paused = filteredData.filter(d => d.status === 'Paused').length;
    const archived = filteredData.filter(d => d.status === 'Archived').length;
    return [
      { name: 'Active', value: active, color: '#10b981' },
      { name: 'Paused', value: paused, color: '#f59e0b' },
      { name: 'Archived', value: archived, color: '#64748b' }
    ];
  }, [filteredData]);

  // Insights
  const insights = useMemo(() => {
    if (filteredData.length === 0) return null;

    const campaignsWithLeads = filteredData.filter(d => d.leads > 0 && (d.spend / d.leads) > 0);
    const best = campaignsWithLeads.length > 0 ? campaignsWithLeads.reduce((prev, curr) => (prev.spend / prev.leads) < (curr.spend / curr.leads) ? prev : curr) : null;
    const worst = campaignsWithLeads.length > 0 ? campaignsWithLeads.reduce((prev, curr) => (prev.spend / prev.leads) > (curr.spend / curr.leads) ? prev : curr) : null;
    const lowLeadsHighSpend = filteredData.filter(d => d.spend > 1000 && d.leads < 5);

    return { best, worst, lowLeadsHighSpend };
  }, [filteredData]);

  // Table Pagination
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  // Table Pagination Logic
  const totalPagesCount = Math.ceil(sortedData.length / itemsPerPage);
  const displayPages = totalPagesCount || 1;

  if (loading && data.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <header className="glass border-b border-slate-200 dark:border-slate-800 px-4 py-4 md:px-8">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <Skeleton className="w-48 h-10" />
            <Skeleton className="w-24 h-10" />
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {[1, 2, 3, 4, 5].map(i => <CardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <Skeleton className="h-[400px] rounded-premium" />
            <Skeleton className="h-[400px] rounded-premium" />
          </div>
          <Skeleton className="w-full h-[500px] rounded-premium" />
        </main>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl max-w-md border border-slate-200 dark:border-slate-800">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Something went wrong</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <button 
            onClick={fetchData}
            className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 transition-colors duration-300">
      {/* --- Header --- */}
      <header className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-slate-800 px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 text-primary-600">
              <TrendingUp />
              Reach Dashboard FIXED V6
            </h1>
            <p className="text-slate-500 text-sm">
              Marketing Performance Overview • <span className="text-primary-600 dark:text-primary-400 font-medium">{DATASETS[activeDataset].name}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {Object.entries(DATASETS).map(([key, dataset]) => (
                <button
                  key={key}
                  id={`dataset-switch-${key}`}
                  onClick={() => setActiveDataset(key)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                    activeDataset === key
                      ? "bg-primary-600 text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  {dataset.name}
                </button>
              ))}
            </div>
            <button
              id="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {darkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-slate-600" />}
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400">Last updated</p>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {lastRefreshed.toLocaleTimeString()}
              </p>
            </div>
            <button
               id="sync-button"
               onClick={fetchData}
               className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium shadow-lg shadow-primary-500/20"
             >
               <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
               Sync Data
             </button>
             
             <button
               id="export-csv-button"
               onClick={() => {
                 const headers = ["Campaign", "Date", "Status", "Leads", "Clicks", "Reach", "Spend"];
                 const rows = filteredData.map(item => [
                   item.campaign,
                   item.normalizedDate,
                   item.status,
                   item.leads,
                   item.clicks,
                   item.reach,
                   item.spend
                 ]);
                 const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
                 const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                 const link = document.createElement("a");
                 const url = URL.createObjectURL(blob);
                 link.setAttribute("href", url);
                 link.setAttribute("download", `dashboard_export_${activeDataset}.csv`);
                 link.style.visibility = 'hidden';
                 document.body.appendChild(link);
                 link.click();
                 document.body.removeChild(link);
               }}
               className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium shadow-lg shadow-emerald-500/20"
             >
               Download CSV
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8">

        {/* --- KPI Cards & Filter Status --- */}
        {filteredData.length === 0 && (searchTerm || statusFilter !== 'All Status' || startDate || endDate) ? (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-8 text-center">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-amber-800 dark:text-amber-300 font-medium">No results match your active filters</p>
            <p className="text-amber-600 dark:text-amber-400 text-sm">Try clearing filters or selecting a wider date range.</p>
          </div>
        ) : filteredData.length === 0 && data.length > 0 ? (
           <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-8 text-center">
            <p className="text-blue-800 dark:text-blue-300 font-medium">Loading filtered data...</p>
          </div>
        ) : filteredData.length === 0 && data.length === 0 ? (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6 mb-8 text-center border border-dashed border-slate-300 dark:border-slate-700">
            <RefreshCw className="w-8 h-8 text-slate-400 mx-auto mb-2 animate-spin" />
            <p className="text-slate-500 dark:text-slate-400">Fetching initial campaign data...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard title="Total Leads" value={formatNumber(stats.totalLeads)} icon={Target} />
            <MetricCard title="Total Clicks" value={formatNumber(stats.totalClicks)} icon={Users} />
            <MetricCard title="Total Reach" value={formatNumber(stats.totalReach)} icon={TrendingUp} />
            <MetricCard title="Total Spend" value={formatCurrency(stats.totalSpend)} icon={IndianRupee} />
            <MetricCard title="Avg. CPL" value={formatCurrency(stats.avgCPL)} icon={AlertCircle} suffix={stats.avgCPL > 200 ? " ⚠️" : " ✅"} />
          </div>
        )}

        {/* --- Filters & Search --- */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8 items-end lg:items-center">
          <div className="relative flex-1 w-full" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              id="search-input"
              type="text"
              placeholder="Search or select campaign..."
              className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary-500 transition-all outline-none"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />
            {searchTerm && (
              <button
                id="clear-search"
                onClick={() => {
                  setSearchTerm('');
                  setShowDropdown(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Dropdown Menu */}
            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar"
                >
                  {filteredDropdownItems.length > 0 ? (
                    filteredDropdownItems.map((name, idx) => (
                      <button
                        key={idx}
                        className={cn(
                          "w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800",
                          searchTerm === name ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 font-medium" : "text-slate-600 dark:text-slate-300"
                        )}
                        onClick={() => {
                          setSearchTerm(name);
                          setShowDropdown(false);
                        }}
                      >
                        {name}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-slate-500 italic">No campaigns found</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

            <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 overflow-x-auto">
                <div className="flex gap-1 mr-2 border-r border-slate-200 dark:border-slate-800 pr-2">
                  <button
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setStartDate(today);
                      setEndDate(today);
                    }}
                    className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-slate-100 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      const yesterday = new Date();
                      yesterday.setDate(yesterday.getDate() - 1);
                      const dStr = yesterday.toISOString().split('T')[0];
                      setStartDate(dStr);
                      setEndDate(dStr);
                    }}
                    className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-slate-100 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    Yesterday
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 7);
                      setStartDate(d.toISOString().split('T')[0]);
                      setEndDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-slate-100 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    7D
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 14);
                      setStartDate(d.toISOString().split('T')[0]);
                      setEndDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-slate-100 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    14D
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 30);
                      setStartDate(d.toISOString().split('T')[0]);
                      setEndDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-slate-100 dark:bg-slate-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    30D
                  </button>
                </div>
                <span className="text-xs font-semibold text-slate-400 uppercase">From</span>
                <input
                  id="start-date-input"
                  type="date"
                  className="bg-transparent text-sm outline-none dark:text-white"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-xs font-semibold text-slate-400 uppercase ml-2">To</span>
                <input
                  id="end-date-input"
                  type="date"
                  className="bg-transparent text-sm outline-none dark:text-white"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="text-slate-400 w-5 h-5 ml-2" />
                <select
                  id="status-filter-select"
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All Status">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>

              {(searchTerm || statusFilter !== 'All Status' || startDate || endDate) && (
                <button
                  id="clear-filters"
                  onClick={clearFilters}
                  className="px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Clear All
                </button>
              )}
            </div>
        </div>

        {/* --- Charts --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Bar Chart: Leads by Campaign */}
          <div className="card-premium h-[400px]">
            <SectionHeader title="Top Campaigns by Leads" subtitle="Performance of your best marketing assets" />
            <div className="h-[300px] w-full flex items-center justify-center">
              {chartDataLeadsByCampaign.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataLeadsByCampaign}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} tick={{ fill: darkMode ? '#94a3b8' : '#64748b' }} />
                    <YAxis fontSize={12} axisLine={false} tickLine={false} tick={{ fill: darkMode ? '#94a3b8' : '#64748b' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="leads" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-slate-400 text-sm italic">No data for selected period</div>
              )}
            </div>
          </div>

          {/* Line Chart: Leads over time */}
          <div className="card-premium h-[400px]">
            <SectionHeader title="Leads Trend" subtitle="Campaign performance over the recent period" />
            <div className="h-[300px] w-full flex items-center justify-center">
              {chartDataLeadsOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataLeadsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="date" fontSize={12} axisLine={false} tickLine={false} tick={{ fill: darkMode ? '#94a3b8' : '#64748b' }} />
                    <YAxis fontSize={12} axisLine={false} tickLine={false} tick={{ fill: darkMode ? '#94a3b8' : '#64748b' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    />
                    <Line type="monotone" dataKey="leads" stroke="#0ea5e9" strokeWidth={3} dot={{ fill: '#0ea5e9', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-slate-400 text-sm italic">No data for selected period</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Pie Chart: Status Distribution */}
          <div className="card-premium h-[400px]">
            <SectionHeader title="Campaign Status" subtitle="Active vs Paused breakdown" />
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartDataStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartDataStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', borderRadius: '12px', border: 'none' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Insights Section */}
          <div className="card-premium lg:col-span-2 h-[400px]">
            <SectionHeader title="Smart Insights" subtitle="Automated analysis of your performance" />
            <div className="space-y-4">
              {insights?.best && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 flex gap-4">
                  <div className="mt-1 p-2 bg-emerald-500 rounded-lg shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-emerald-900 dark:text-emerald-400">Best Performing Campaign</h4>
                    <p className="text-sm text-emerald-700 dark:text-emerald-500 mt-1">
                      <span className="font-bold">{insights.best.name}</span> has the lowest Cost Per Lead at <span className="font-bold">{formatCurrency(insights.best.cpl)}</span>.
                    </p>
                  </div>
                </div>
              )}

              {insights?.worst && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 flex gap-4">
                  <div className="mt-1 p-2 bg-amber-500 rounded-lg shrink-0">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-900 dark:text-amber-400">Inefficient Spend Alert</h4>
                    <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                      <span className="font-bold">{insights.worst.name}</span> has the highest CPL of <span className="font-bold">{formatCurrency(insights.worst.cpl)}</span>. Consider optimizing this campaign.
                    </p>
                  </div>
                </div>
              )}

              {insights?.lowLeadsHighSpend.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 flex gap-4">
                  <div className="mt-1 p-2 bg-rose-500 rounded-lg shrink-0">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-rose-900 dark:text-rose-400">High Spend Warning</h4>
                    <p className="text-sm text-rose-700 dark:text-rose-500 mt-1">
                      Multiple campaigns have high spend but low conversion rates. Check targeting for these campaigns.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- Data Table --- */}
        <div className="card-premium overflow-hidden flex flex-col h-[600px]">
          <SectionHeader title="Campaign Details" subtitle="Full breakdown of all marketing initiatives" />
          <div className="flex-1 overflow-auto custom-scrollbar relative">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[2000px]">
              <thead className="sticky top-0 z-30 bg-white dark:bg-slate-900 shadow-sm transition-colors">
                <tr>
                  <th onClick={() => handleSort('campaign')} className="sticky left-0 z-40 bg-white dark:bg-slate-900 pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Campaign Name {sortConfig.key === 'campaign' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('normalizedDate')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Date {sortConfig.key === 'normalizedDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('status')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">Delivery</th>
                  <th onClick={() => handleSort('spend')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Spend {sortConfig.key === 'spend' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">Remaining</th>
                  <th onClick={() => handleSort('leads')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Leads {sortConfig.key === 'leads' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">CPL</th>
                  <th onClick={() => handleSort('reach')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Reach {sortConfig.key === 'reach' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">Impressions</th>
                  <th onClick={() => handleSort('clicks')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Link Clicks {sortConfig.key === 'clicks' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">Region</th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">Objective</th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">Results Type</th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">Creative Type</th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">Start Time</th>
                  <th className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800">End Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/5 transition-colors">
                {paginatedData.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 py-4 px-4 text-sm font-medium text-slate-900 dark:text-white max-w-[200px] truncate shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-b border-slate-100 dark:border-slate-800" title={campaign.campaign}>
                      {campaign.campaign}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap border-b border-slate-100 dark:border-slate-800">
                      {formatDisplayDate(campaign?.normalizedDate)}
                    </td>
                    <td className="py-4 px-4 text-sm border-b border-slate-100 dark:border-slate-800">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap",
                        campaign?.status === 'Active' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      )}>
                        {campaign?.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      -
                    </td>
                    <td className="py-4 px-4 text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign?.spend ? formatCurrency(campaign.spend) : '-'}
                    </td>
                    <td className="py-4 px-4 text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      -
                    </td>
                    <td className="py-4 px-4 text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800">
                      {formatNumber(campaign.leads)}
                    </td>
                    <td className="py-4 px-4 text-sm font-semibold text-primary-600 dark:text-primary-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign.leads > 0 ? formatCurrency(campaign.spend / campaign.leads) : formatCurrency(0)}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      {formatNumber(campaign.reach)}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      -
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      {formatNumber(campaign.clicks)}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign.region}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      -
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      -
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      -
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      -
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      -
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Table Pagination */}
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-6">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-700 dark:text-slate-300">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-slate-700 dark:text-slate-300">{Math.min(currentPage * itemsPerPage, filteredData?.length || 0)}</span> of <span className="font-medium text-slate-700 dark:text-slate-300">{filteredData?.length || 0}</span> results
            </p>
            <div className="flex gap-2">
              <button
                id="prev-page-button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                id="next-page-button"
                onClick={() => setCurrentPage(p => Math.min(displayPages, p + 1))}
                disabled={currentPage === displayPages}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                aria-label="Next Page"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 md:px-8 mt-12 text-center">
        <p className="text-slate-400 text-sm">© {new Date().getFullYear()} Reach Skyline. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default App;
