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
const cleanCurrency = (val) => {
  if (!val || val === '') return 0;
  return parseFloat(val.toString().replace(/[₹,]/g, '')) || 0;
};

const cleanNumber = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  // Keep only digits, dots, and negative signs
  const cleaned = val.toString().replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
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

// USER REQUESTED FIX: parseSheetDate
function parseSheetDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s || s.toLowerCase() === 'no date') return null;

  // Split by common separators (- or / or .)
  const parts = s.split(/[-/.]/);
  if (parts.length !== 3) return null;

  let y, m, d;

  // Case 1: YYYY-MM-DD (standard)
  if (parts[0].length === 4) {
    y = parseInt(parts[0]);
    m = parseInt(parts[1]);
    d = parseInt(parts[2]);
  } 
  // Case 2: DD-MM-YYYY or MM-DD-YYYY or DD-MM-YY
  else {
    d = parseInt(parts[0]);
    m = parseInt(parts[1]);
    y = parseInt(parts[2]);

    // Handle 2-digit year
    if (y < 100) {
      y += 2000;
    }

    // Heuristic for M/D/Y (if month > 12, swap)
    if (m > 12 && d <= 12) {
      [m, d] = [d, m];
    }
  }

  const result = new Date(y, m - 1, d);
  return isNaN(result.getTime()) ? null : result;
}

const formatDate = (dateStr) => {
  const date = parseSheetDate(dateStr);
  if (!date) return '-';
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
};

const parseDate = parseSheetDate;
const normalizeDate = (dateStr) => {
  const d = parseSheetDate(dateStr);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getDateKey = (d) => {
  if (!d) return 0;
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
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
    try {
      setLoading(true);
      // Cache busting: add timestamp to ensure we get the latest sheet data
      const baseUrl = DATASETS[activeDataset].url;
      const syncUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}cache_bust=${Date.now()}`;
      const response = await axios.get(syncUrl);

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid data format received from sync source.');
      }

      const cleaned = response.data.map((item, index) => {
        const campaign = item.Campaign || item['Campaign name'] || item['Campaign Name'] || 'Unnamed';
        const reach = cleanNumber(item.Reach || item.reach || 0);
        const clicks = cleanNumber(item.Clicks || item['Link clicks'] || item.clicks || 0);
        const leads = cleanNumber(item.Leads || item.leads || item['Total Leads'] || 0);
        const spend = cleanNumber(item.Spend || item.Cost || item['Daily ad set budget'] || item.spend || 0);
        const cpl = leads > 0 ? (spend / leads) : (cleanNumber(item['Cost per lead'] || item['CPL'] || 0));
        const statusRaw = item['Campaign configured status'] || item.Status || item.status || 'Active';

        return {
          ...item,
          id: index,
          name: campaign,
          campaign,
          status: statusRaw,
          leads,
          cpl,
          reach,
          clicks,
          spend,
          region: item.Region || item.region || 'Unknown',
          date: item.Date || item.date || 'No Date'
        };
      });

      setData(cleaned);
      setLastRefreshed(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to fetch data. Please check your connection.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-set the date range to the latest date found in the sheet
  useEffect(() => {
    if (data.length > 0) {
      const dates = data.map(d => parseSheetDate(d.date)).filter(Boolean);
      if (dates.length > 0) {
        const latest = new Date(Math.max(...dates.map(d => d.getTime())));
        const formatted = latest.toISOString().split('T')[0];
        // Only set if user hasn't interacted or it's the initial load
        if (startDate === '2026-03-27' && endDate === '2026-03-27') {
          setStartDate(formatted);
          setEndDate(formatted);
        }
      }
    }
  }, [data]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
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

  // --- Filtering & Sorting Logic ---
  const uniqueCampaigns = useMemo(() => {
    if (!data.length) return [];
    const names = data.map(item => item.name);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filteredDropdownItems = useMemo(() => {
    if (!searchTerm) return uniqueCampaigns;
    return uniqueCampaigns.filter(name =>
      name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [uniqueCampaigns, searchTerm]);

  const filteredData = useMemo(() => {
    if (!data.length) return [];

    const term = searchTerm.toLowerCase().trim();
    const fromKey = startDate ? getDateKey(parseDate(startDate)) : null;
    const toKey = endDate ? getDateKey(parseDate(endDate)) : null;

    let result = data.filter(item => {
      // 1. Search filter
      const n = (item.name || '').toLowerCase();
      if (term && !n.includes(term)) return false;
      
      // 2. Status filter (case-insensitive)
      if (statusFilter !== 'All Status') {
        const itemStatus = (item.status || '').toLowerCase();
        if (itemStatus !== statusFilter.toLowerCase()) return false;
      }

      // 3. Date filtering (inclusive range)
      const recordDate = parseSheetDate(item.date);
      if (!recordDate) return false;
      
      const rowKey = getDateKey(recordDate);

      if (fromKey && rowKey < fromKey) return false;
      if (toKey && rowKey > toKey) return false;

      return true;
    });

    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'date') {
          valA = parseDate(valA)?.getTime() || 0;
          valB = parseDate(valB)?.getTime() || 0;
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [data, searchTerm, statusFilter, sortConfig, startDate, endDate]);

  // KPI Calculations
  const stats = useMemo(() => {
    const totalLeads = filteredData.reduce((acc, curr) => acc + (Number(curr.leads) || 0), 0);
    const totalClicks = filteredData.reduce((acc, curr) => acc + (Number(curr.clicks) || 0), 0);
    const totalReach = filteredData.reduce((acc, curr) => acc + (Number(curr.reach) || 0), 0);
    const totalSpend = filteredData.reduce((acc, curr) => acc + (Number(curr.spend) || 0), 0);
    const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;

    return { totalLeads, totalClicks, totalReach, totalSpend, avgCPL };
  }, [filteredData]);

  // Chart Data preparation
  const chartDataLeadsByCampaign = useMemo(() => {
    return [...filteredData]
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 8)
      .map(item => ({
        name: item.name.substring(0, 15) + '...',
        leads: item.leads
      }));
  }, [filteredData]);

  const chartDataLeadsOverTime = useMemo(() => {
    const grouped = filteredData.reduce((acc, curr) => {
      const normalized = formatDate(curr.date);
      if (!normalized || normalized === '-') return acc;
      if (!acc[normalized]) acc[normalized] = 0;
      acc[normalized] += curr.leads;
      return acc;
    }, {});

    return Object.keys(grouped).map(date => ({
      date,
      leads: grouped[date]
    })).sort((a, b) => (parseDate(a.date)?.getTime() || 0) - (parseDate(b.date)?.getTime() || 0));
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

    const campaignsWithLeads = filteredData.filter(d => d.leads > 0 && d.cpl > 0);
    const best = campaignsWithLeads.length > 0 ? campaignsWithLeads.reduce((prev, curr) => prev.cpl < curr.cpl ? prev : curr) : null;
    const worst = campaignsWithLeads.length > 0 ? campaignsWithLeads.reduce((prev, curr) => prev.cpl > curr.cpl ? prev : curr) : null;
    const lowLeadsHighSpend = filteredData.filter(d => d.spend > 1000 && d.leads < 5);

    return { best, worst, lowLeadsHighSpend };
  }, [filteredData]);

  // Table Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

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
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium shadow-lg shadow-primary-500/20"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              Sync Data
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8">

        {/* --- KPI Cards --- */}
        {filteredData.length === 0 ? (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-8 text-center">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-amber-800 dark:text-amber-300 font-medium">No data available for the selected filters</p>
            <p className="text-amber-600 dark:text-amber-400 text-sm">Try selecting a different date range or clearing your search.</p>
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
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5">
              <span className="text-xs font-semibold text-slate-400 uppercase">From</span>
              <input
                type="date"
                className="bg-transparent text-sm outline-none dark:text-white"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-xs font-semibold text-slate-400 uppercase ml-2">To</span>
              <input
                type="date"
                className="bg-transparent text-sm outline-none dark:text-white"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="text-slate-400 w-5 h-5 ml-2" />
              <select
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All Status">All Status</option>
                <option value="Active">Active</option>
                <option value="Paused">Paused</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
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
                  <th onClick={() => handleSort('name')} className="sticky left-0 z-40 bg-white dark:bg-slate-900 pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Campaign Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('date')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('status')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('Ad delivery')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Delivery {sortConfig.key === 'Ad delivery' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('Daily ad set budget')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Daily Budget {sortConfig.key === 'Daily ad set budget' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('Remaining budget')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Remaining {sortConfig.key === 'Remaining budget' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('leads')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Leads {sortConfig.key === 'leads' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('cpl')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">CPL {sortConfig.key === 'cpl' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('reach')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Reach {sortConfig.key === 'reach' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
                  <th onClick={() => handleSort('Impressions')} className="pb-4 pt-2 px-4 font-semibold text-slate-500 uppercase text-xs tracking-wider cursor-pointer hover:text-primary-500 group border-b border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1">Impressions {sortConfig.key === 'Impressions' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</span>
                  </th>
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
                    <td className="sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 py-4 px-4 text-sm font-medium text-slate-900 dark:text-white max-w-[200px] truncate shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-b border-slate-100 dark:border-slate-800" title={campaign.name}>
                      {campaign.name}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap border-b border-slate-100 dark:border-slate-800">
                      {formatDate(campaign.date)}
                    </td>
                    <td className="py-4 px-4 text-sm border-b border-slate-100 dark:border-slate-800">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap",
                        campaign.status === 'Active' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      )}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign['Ad delivery'] || '-'}
                    </td>
                    <td className="py-4 px-4 text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign['Daily ad set budget'] ? formatCurrency(cleanCurrency(campaign['Daily ad set budget'])) : '-'}
                    </td>
                    <td className="py-4 px-4 text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign['Remaining budget'] ? formatCurrency(cleanCurrency(campaign['Remaining budget'])) : '-'}
                    </td>
                    <td className="py-4 px-4 text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800">
                      {formatNumber(campaign.leads)}
                    </td>
                    <td className="py-4 px-4 text-sm font-semibold text-primary-600 dark:text-primary-400 border-b border-slate-100 dark:border-slate-800">
                      {formatCurrency(campaign.cpl)}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      {formatNumber(campaign.reach)}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      {campaign.Impressions ? formatNumber(cleanNumber(campaign.Impressions)) : '-'}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      {formatNumber(campaign.clicks)}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign.region}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      {campaign.Objective || '-'}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      {campaign['Results Type'] || '-'}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign['Creative object type'] || '-'}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign['Campaign start time'] || '-'}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                      {campaign['Campaign end time'] || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-6">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-700 dark:text-slate-300">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-slate-700 dark:text-slate-300">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of <span className="font-medium text-slate-700 dark:text-slate-300">{filteredData.length}</span> results
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
