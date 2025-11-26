import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line, Cell, ComposedChart, ScatterChart, Scatter, ZAxis } from 'recharts';
import { Search, Filter, Package, TrendingUp, ArrowLeft, FileText, Calendar, MapPin, DollarSign, AlertCircle, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

// Convert Excel date serial number to JavaScript Date
const excelDateToJSDate = (serial) => {
  if (!serial || isNaN(serial)) return null;
  return new Date((serial - 25569) * 86400000);
};

// Calculate vendor performance scores
const calculateVendorScore = (vendorPOs) => {
  const totalPOValue = vendorPOs.reduce((sum, po) => sum + po.basicValue, 0);

  const priceScore = 30; // Give 30 marks to all vendors for now, formula to be set later

  const totalGrnQty = vendorPOs.reduce((sum, po) => sum + po.totalGrnQty, 0);
  const totalRejectQty = vendorPOs.reduce((sum, po) => sum + po.rejectQty, 0);
  const rejectionRate = totalGrnQty > 0 ? (totalRejectQty / totalGrnQty) * 100 : 0;
  const qualityScore = Math.max(0, 60 - (rejectionRate * 2));

  const ordersWithDates = vendorPOs.filter(po => po.deliveryDate && po.lastGrn && po.lastGrn !== 'Pending');
  const delayedOrders = ordersWithDates.filter(po => {
    const delivery = new Date(po.deliveryDate);
    const grn = new Date(po.lastGrn);
    return grn > delivery;
  }).length;

  const onTimeRate = ordersWithDates.length > 0
    ? ((ordersWithDates.length - delayedOrders) / ordersWithDates.length) * 100
    : 100;
  const deliveryScore = (onTimeRate / 100) * 10;

  return {
    total: Math.round(priceScore + qualityScore + deliveryScore),
    price: Math.round(priceScore),
    quality: Math.round(qualityScore),
    delivery: Math.round(deliveryScore),
    rejectionRate: rejectionRate.toFixed(2),
    onTimeRate: onTimeRate.toFixed(1),
    totalPOValue,
    totalOrders: vendorPOs.length,
    delayedOrders
  };
};

const calculateDelay = (deliveryDate, lastGrn) => {
  if (!deliveryDate || !lastGrn || lastGrn === 'Pending') return null;
  const delivery = new Date(deliveryDate);
  const grn = new Date(lastGrn);
  if (isNaN(delivery.getTime()) || isNaN(grn.getTime())) return null;
  const diffTime = grn - delivery;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const calculateItemScore = (pos) => {
  const totalOrders = pos.length;
  const totalGrnQty = pos.reduce((sum, p) => sum + p.totalGrnQty, 0);
  const totalRejectQty = pos.reduce((sum, p) => sum + p.rejectQty, 0);
  const rejectionRate = totalGrnQty > 0 ? (totalRejectQty / totalGrnQty) * 100 : 0;
  const ordersWithDates = pos.filter(po => po.deliveryDate && po.lastGrn && po.lastGrn !== 'Pending');
  const delayedOrders = ordersWithDates.filter(po => {
    const delivery = new Date(po.deliveryDate);
    const grn = new Date(po.lastGrn);
    return grn > delivery;
  }).length;
  const onTimeRate = ordersWithDates.length > 0
    ? ((ordersWithDates.length - delayedOrders) / ordersWithDates.length) * 100
    : 100;
  return { //sdf
    totalOrders,
    onTimeRate: onTimeRate.toFixed(1),
    rejectionRate: rejectionRate.toFixed(2)
  };
};

const VendorPerformanceDashboard = () => {
  const [poData, setPoData] = useState([]);
  const [viewLevel, setViewLevel] = useState('items');
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [cameFrom, setCameFrom] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [allVendorsSearchTerm, setAllVendorsSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Function to load data from Google Sheets
  const loadDataFromGoogleSheets = async () => {
    setLoading(true);
    try {
      // Google Sheets CSV export URL
      const spreadsheetId = '1AZXCEeO4BekbMPuV3jtiLSyxkN2ba4R5p9DRFPsSdpg';
      const response = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`);

      if (!response.ok) {
        console.log('Failed to fetch data from Google Sheets');
        return;
      }

      const csvText = await response.text();
      const workbook = XLSX.read(csvText, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const parsedData = json.slice(1).filter(row => row.length > 0).map(row => ({
        poNo: row[0]?.toString() || '',
        poDt: excelDateToJSDate(parseFloat(row[1]))?.toLocaleDateString() || row[1]?.toString() || '',
        itemCd: row[2]?.toString() || '',
        itemDesc: row[3]?.toString() || '',
        unit: row[4]?.toString() || '',
        poQty: parseFloat(row[5]) || 0,
        basicRate: parseFloat(row[6]) || 0,
        basicValue: parseFloat(row[7]) || 0,
        vendorCd: row[8]?.toString() || '',
        poVendor: row[9]?.toString() || '',
        matType: row[10]?.toString() || '',
        matGrp: row[11]?.toString() || '',
        vendorCity: row[12]?.toString() || '',
        totalGrnQty: parseFloat(row[13]) || 0,
        rejectQty: parseFloat(row[14]) || 0,
        lastGrn: excelDateToJSDate(parseFloat(row[15]))?.toLocaleDateString() || row[15]?.toString() || null,
        deliveryDate: excelDateToJSDate(parseFloat(row[16]))?.toLocaleDateString() || row[16]?.toString() || ''
      }));

      setPoData(parsedData);
      setLastRefreshed(new Date());
      console.log('Data loaded from Google Sheets:', parsedData.length, 'records');
    } catch (error) {
      console.error('Error loading data from Google Sheets:', error);
    } finally {
      setLoading(false);
    }
  };

  const allVendors = useMemo(() => {
    if (poData.length === 0) return [];
    const vendorMap = {};
    poData.forEach(po => {
      // Skip POs with no vendor name or placeholder values
      if (!po.poVendor || po.poVendor.trim() === '' ||
          po.poVendor.toLowerCase() === 'po not released' ||
          po.vendorCd.trim() === '') return;
      if (!vendorMap[po.vendorCd]) {
        vendorMap[po.vendorCd] = {
          vendorCd: po.vendorCd,
          vendorName: po.poVendor,
          vendorCity: po.vendorCity,
          itemsCount: new Set(),
          pos: []
        };
      }
      vendorMap[po.vendorCd].itemsCount.add(po.itemCd);
      vendorMap[po.vendorCd].pos.push(po);
    });
    return Object.values(vendorMap).map(vendor => ({
      ...vendor,
      scores: calculateVendorScore(vendor.pos),
      itemsCount: vendor.itemsCount.size
    })).sort((a, b) => b.scores.total - a.scores.total);
  }, [poData]);

  useEffect(() => {
    // Initial load
    loadDataFromGoogleSheets();

    // Set up interval to refresh every 10 minutes (10 * 60 * 1000 = 600000 ms)
    const interval = setInterval(() => {
      loadDataFromGoogleSheets();
    }, 600000);

    return () => clearInterval(interval); // cleanup
  }, []);

  const itemsData = useMemo(() => {
    const itemMap = {};

    poData.forEach(po => {
      if (!itemMap[po.itemCd]) {
        itemMap[po.itemCd] = {
          itemCd: po.itemCd,
          itemDesc: po.itemDesc,
          matType: po.matType,
          matGrp: po.matGrp,
          unit: po.unit,
          totalPOValue: 0,
          totalPOQty: 0,
          vendorCount: new Set(),
          pos: []
        };
      }
      itemMap[po.itemCd].totalPOValue += po.basicValue;
      itemMap[po.itemCd].totalPOQty += po.poQty;
      itemMap[po.itemCd].vendorCount.add(po.vendorCd);
      itemMap[po.itemCd].pos.push(po);
    });

    return Object.values(itemMap).map(item => ({
      ...item,
      vendorCount: item.vendorCount.size
    }));
  }, [poData]);

  const materialGroups = ['All', ...new Set(itemsData.map(item => item.matGrp))];
  const materialTypes = ['All', ...new Set(itemsData.map(item => item.matType))];

  const filteredItems = useMemo(() => {
    return itemsData.filter(item => {
      const matchesSearch = item.itemCd.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.itemDesc.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGroup = filterGroup === 'All' || item.matGrp === filterGroup;
      const matchesType = filterType === 'All' || item.matType === filterType;
      const matchesDateRange = !dateFrom || !dateTo || item.pos.some(po => {
        const poDate = new Date(po.poDt);
        const fromDateObj = new Date(dateFrom);
        const toDateObj = new Date(dateTo);
        return poDate >= fromDateObj && poDate <= toDateObj;
      });
      return matchesSearch && matchesGroup && matchesType && matchesDateRange;
    });
  }, [itemsData, searchTerm, filterGroup, filterType, dateFrom, dateTo]);

  const vendorsForItem = useMemo(() => {
    if (!selectedItem) return [];

    const vendorMap = {};
    selectedItem.pos.forEach(po => {
      if (!vendorMap[po.vendorCd]) {
        vendorMap[po.vendorCd] = {
          vendorCd: po.vendorCd,
          vendorName: po.poVendor,
          vendorCity: po.vendorCity,
          pos: []
        };
      }
      vendorMap[po.vendorCd].pos.push(po);
    });

    return Object.values(vendorMap).map(vendor => ({
      ...vendor,
      scores: calculateVendorScore(vendor.pos)
    })).sort((a, b) => b.scores.total - a.scores.total);
  }, [selectedItem]);

  const itemScores = calculateItemScore(selectedItem ? selectedItem.pos : []);

  const filteredAllVendors = useMemo(() => {
    if (!allVendorsSearchTerm.trim()) return allVendors;
    const search = allVendorsSearchTerm.toLowerCase();
    return allVendors.filter(vendor =>
      vendor.vendorName.toLowerCase().includes(search) ||
      vendor.vendorCd.toLowerCase().includes(search) ||
      vendor.vendorCity.toLowerCase().includes(search)
    );
  }, [allVendors, allVendorsSearchTerm]);

  if (viewLevel === 'items') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
        <div className="container mx-auto xl:px-8">
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-4xl font-bold text-indigo-900">Vendor Performance Dashboard</h1>
              <button
                onClick={() => loadDataFromGoogleSheets()}
                disabled={loading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} transition-colors`}
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-indigo-700">Select an item to view vendor performance</p>
              <div className="text-xs text-slate-600">
                Last updated: {lastRefreshed.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex mb-8">
            <div className="inline-flex rounded-full bg-slate-100 p-1 shadow-sm">
              <button
                onClick={() => setViewLevel('items')}
                className={`px-6 py-2 rounded-full font-medium text-sm transition-all ${
                  viewLevel === 'items'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-white'
                }`}
              >
                Items
              </button>
              <button
                onClick={() => setViewLevel('allVendors')}
                className={`px-6 py-2 rounded-full font-medium text-sm transition-all ${
                  viewLevel === 'allVendors'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-white'
                }`}
              >
                All Vendors
              </button>
            </div>
          </div>



          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by code or description..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <div>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="From"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="To"
                  />
                </div>
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:bg-slate-50 transition-colors ${showFilters ? 'bg-blue-50 border-blue-300' : ''}`}
              >
                <Filter size={16} className={showFilters ? 'text-blue-600' : 'text-slate-600'} />
              </button>
            </div>

            {showFilters && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg border animated-slide-down">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={filterGroup}
                    onChange={(e) => setFilterGroup(e.target.value)}
                  >
                    <option value="All">All Material Groups</option>
                    {materialGroups.slice(1).map(group => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>

                  <select
                    className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="All">All Material Types</option>
                    {materialTypes.slice(1).map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Dashboard Overview Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 leading-tight">
                <BarChart className="text-blue-500" size={20} />
                Top Items by PO Value
              </h3>
              <ResponsiveContainer width="100%" height={420}>
                <ComposedChart
                  data={filteredItems
                    .sort((a, b) => b.totalPOValue - a.totalPOValue)
                    .slice(0, 6)}
                  margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="itemCd"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={10}
                  />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    tickFormatter={(value) => `${(value / 10000000).toFixed(1)}Cr`}
                    width={50}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    width={40}
                  />
                  <Tooltip
                    formatter={(value, name, props) => {
                      const item = props.payload;
                      if (name === 'PO Value (Cr)') {
                        return [
                          `₹${(value / 10000000).toFixed(2)}Cr`,
                          'Purchase Value'
                        ];
                      }
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        const item = payload[0].payload;
                        return (
                          <div className="text-sm">
                            <div className="font-bold text-slate-800">{item.itemCd}</div>
                            <div className="text-slate-600 truncate max-w-xs">{item.itemDesc}</div>
                          </div>
                        );
                      }
                      return label;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    yAxisId="left"
                    dataKey="totalPOValue"
                    fill="#3b82f6"
                    name="PO Value (Cr)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="vendorCount"
                    stroke="#10b981"
                    strokeWidth={3}
                    name="Vendors"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 leading-tight">
                <BarChart className="text-green-500" size={20} />
                Top Items by Value & Quantity
              </h3>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart
                  data={filteredItems
                    .sort((a, b) => b.totalPOValue - a.totalPOValue)
                    .slice(0, 6)
                    .map(item => ({
                      item: item.itemCd,
                      value: item.totalPOValue / 10000000, // In Crores for display
                      quantity: item.totalPOQty / 1000, // In Thousands for display
                    }))}
                  margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="item"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={11}
                  />
                  <YAxis
                    yAxisId="value"
                    orientation="left"
                    label={{ value: 'Value (₹ Cr)', angle: -90, position: 'insideLeft' }}
                    tickFormatter={(value) => `${value}`}
                  />
                  <YAxis
                    yAxisId="quantity"
                    orientation="right"
                    label={{ value: 'Quantity (K Units)', angle: 90, position: 'insideRight' }}
                    tickFormatter={(value) => `${value}K`}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === 'value') {
                        return [`₹${value.toFixed(2)} Cr`, 'Purchase Value'];
                      }
                      return [`${value.toFixed(2)}K Units`, 'Total Quantity'];
                    }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        const item = payload[0].payload;
                        return (
                          <div className="text-sm">
                            <div className="font-bold text-slate-800">{item.item}</div>
                            <div className="text-slate-600 truncate max-w-xs">{item.itemDesc}</div>
                          </div>
                        );
                      }
                      return label;
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="value"
                    dataKey="value"
                    fill="#10b981"
                    name="Purchase Value"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="quantity"
                    dataKey="quantity"
                    fill="#3b82f6"
                    name="Total Quantity"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 text-xs text-slate-600 text-center">
                Simple bar chart showing the top 6 items by purchase value (green bars) and total quantity ordered (blue bars)
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map(item => (
              <div
                key={item.itemCd}
                onClick={() => {
                  setSelectedItem(item);
                  setViewLevel('vendors');
                }}
                className="bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-2xl transition-all transform hover:-translate-y-1"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-800">{item.itemCd}</h3>
                    <p className="text-slate-600 text-sm mt-1 line-clamp-2">{item.itemDesc}</p>
                  </div>
                  <Package className="text-blue-500 flex-shrink-0 ml-2" size={24} />
                </div>

                <div className="flex gap-2 mb-4 flex-wrap">
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                    {item.matGrp}
                  </span>
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                    {item.matType}
                  </span>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    {item.unit}
                  </span>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Total PO Value</span>
                    <span className="text-lg font-bold text-slate-800">
                      ₹{(item.totalPOValue / 10000000).toFixed(2)}Cr
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Total Quantity</span>
                    <span className="text-md font-semibold text-slate-700">
                      {item.totalPOQty.toLocaleString()} {item.unit}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Vendors</span>
                    <span className="text-md font-semibold text-blue-600">
                      {item.vendorCount}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (viewLevel === 'vendors') {
    const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
        <div className="container mx-auto xl:px-8">
          {/* Breadcrumb Navigation */}
          <div className="mb-6 flex items-center gap-2 text-sm">
            <button
              onClick={() => {
                setViewLevel('items');
                setSelectedItem(null);
                setSelectedVendor(null);
                setCameFrom(null);
              }}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
            >
              Items
            </button>
            <span className="text-slate-500">{'>'}</span>
            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium">
              {selectedItem.itemCd}
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-slate-800">{selectedItem.itemCd}</h1>
                <p className="text-slate-600 mt-1">{selectedItem.itemDesc}</p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                    {selectedItem.matGrp}
                  </span>
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                    {selectedItem.matType}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-600">
                  ₹{(selectedItem.totalPOValue / 10000000).toFixed(2)}Cr
                </div>
                <div className="text-sm text-slate-500">Total PO Value</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {vendorsForItem.slice(0, 3).map((vendor, index) => (
              <div key={vendor.vendorCd} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-4xl">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                  </span>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-slate-800">
                      {vendor.scores.total}
                    </div>
                    <div className="text-sm text-slate-500">/100</div>
                  </div>
                </div>
                <h3 className="font-bold text-lg text-slate-800 mb-1 line-clamp-1">{vendor.vendorName}</h3>
                <p className="text-sm text-slate-600 mb-3">{vendor.vendorCity}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Price</span>
                    <span className="font-semibold">{vendor.scores.price}/30</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Quality</span>
                    <span className="font-semibold">{vendor.scores.quality}/60</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Delivery</span>
                    <span className="font-semibold">{vendor.scores.delivery}/10</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <Clock className="text-purple-500" size={24} />
                <span className="text-sm text-slate-600">On-Time Rate</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {itemScores.onTimeRate}%
              </div>
              <div className="text-xs text-slate-500">Delivery Performance</div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <FileText className="text-orange-500" size={24} />
                <span className="text-sm text-slate-600">Total Orders</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {itemScores.totalOrders}
              </div>
              <div className="text-xs text-slate-500">Purchase Orders</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Overall Performance Scores</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vendorsForItem}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="vendorName" angle={-20} textAnchor="end" height={100} fontSize={12} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="scores.total" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                    {vendorsForItem.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Score Breakdown</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vendorsForItem}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="vendorName" angle={-20} textAnchor="end" height={100} fontSize={12} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="scores.price" stackId="a" fill="#3b82f6" name="Price (30)" />
                  <Bar dataKey="scores.quality" stackId="a" fill="#10b981" name="Quality (60)" />
                  <Bar dataKey="scores.delivery" stackId="a" fill="#f59e0b" name="Delivery (10)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Item Performance Overview</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={[
                  { name: 'On-Time', value: parseFloat(itemScores.onTimeRate), color: '#10b981' },
                  { name: 'Delayed', value: 100 - parseFloat(itemScores.onTimeRate), color: '#f59e0b' }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {[0, 1].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#10b981', '#f59e0b'][index]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Quality Summary</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={[
                  { name: 'Rejection Rate', value: parseFloat(itemScores.rejectionRate), color: '#ef4444' }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 50]} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Rate']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    <Cell fill="#ef4444" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-4 mb-6">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">All Vendors - Click to View Details</h2>
            {vendorsForItem.map((vendor, index) => (
              <div
                key={vendor.vendorCd}
                onClick={() => {
                  setSelectedVendor(vendor);
                  setViewLevel('poDetails');
                }}
                className="bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-2xl transition-all mb-4"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📊'}
                    </span>
                    <div>
                      <h3 className="text-2xl font-bold text-slate-800">{vendor.vendorName}</h3>
                      <p className="text-slate-600">Code: {vendor.vendorCd} | {vendor.vendorCity}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold text-slate-800">{vendor.scores.total}</div>
                    <div className="text-sm text-slate-500">Overall Score</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-sm text-blue-600 mb-1">Total PO Value</div>
                    <div className="text-xl font-bold text-blue-700">
                      ₹{(vendor.scores.totalPOValue / 10000000).toFixed(2)}Cr
                    </div>
                    <div className="text-xs text-blue-600 mt-1">Score: {vendor.scores.price}/30</div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-sm text-green-600 mb-1">Quality</div>
                    <div className="text-xl font-bold text-green-700">{vendor.scores.quality}/60</div>
                    <div className="text-xs text-green-600 mt-1">Rejection: {vendor.scores.rejectionRate}%</div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-sm text-purple-600 mb-1">Delivery</div>
                    <div className="text-xl font-bold text-purple-700">{vendor.scores.delivery}/10</div>
                    <div className="text-xs text-purple-600 mt-1">On-time: {vendor.scores.onTimeRate}%</div>
                  </div>

                  <div className="bg-orange-50 rounded-lg p-4">
                    <div className="text-sm text-orange-600 mb-1">Total Orders</div>
                    <div className="text-xl font-bold text-orange-700">{vendor.scores.totalOrders}</div>
                    <div className="text-xs text-orange-600 mt-1">Delayed: {vendor.scores.delayedOrders}</div>
                  </div>

                  <div className="bg-pink-50 rounded-lg p-4">
                    <div className="text-sm text-pink-600 mb-1">Click to View</div>
                    <div className="text-xl font-bold text-pink-700">{vendor.pos.length}</div>
                    <div className="text-xs text-pink-600 mt-1">PO Details →</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">All Purchase Orders</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">PO No</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">PO Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Item Description</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Vendor</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">PO Qty</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Value</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">GRN Qty</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Reject Qty</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Expected</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Delivered</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {selectedItem.pos.map((po, index) => {
                    const delay = calculateDelay(po.deliveryDate, po.lastGrn);
                    const isDelayed = delay && delay > 0;
                    const rejectionRate = po.totalGrnQty > 0 ? (po.rejectQty / po.totalGrnQty * 100).toFixed(2) : 0;

                    return (
                      <tr key={po.poNo} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{po.poNo}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{po.poDt}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">{po.itemDesc}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{po.poVendor}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{po.poQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{po.unit}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">₹{po.basicRate.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800 text-right">
                          ₹{(po.basicValue / 100000).toFixed(2)}L
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{po.totalGrnQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`font-semibold ${po.rejectQty > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {po.rejectQty.toLocaleString()}
                            {po.rejectQty > 0 && ` (${rejectionRate}%)`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{po.deliveryDate}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{po.lastGrn || 'Pending'}</td>
                        <td className="px-4 py-3 text-center">
                          {!po.lastGrn ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              <Clock size={12} className="mr-1" />
                              Pending
                            </span>
                          ) : isDelayed ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <XCircle size={12} className="mr-1" />
                              Delayed {delay}d
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle size={12} className="mr-1" />
                              On-time
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>


        </div>
      </div>
    );
  }

  if (viewLevel === 'allVendors') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
        <div className="container mx-auto xl:px-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-indigo-900 mb-2">Vendor Performance Dashboard</h1>
            <p className="text-indigo-700">Browse and search all vendors</p>
          </div>
          <div className="flex mb-8">
            <div className="inline-flex rounded-full bg-slate-100 p-1 shadow-sm">
              <button
                onClick={() => setViewLevel('items')}
                className={`px-6 py-2 rounded-full font-medium text-sm transition-all ${
                  viewLevel === 'items'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-white'
                }`}
              >
                Items
              </button>
              <button
                onClick={() => setViewLevel('allVendors')}
                className={`px-6 py-2 rounded-full font-medium text-sm transition-all ${
                  viewLevel === 'allVendors'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-white'
                }`}
              >
                All Vendors
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Search by vendor name, code, or location..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={allVendorsSearchTerm}
                onChange={(e) => setAllVendorsSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Dashboard Overview Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <FileText className="text-blue-500" size={24} />
                Top Vendors by Order Count
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart
                  data={filteredAllVendors
                    .sort((a, b) => b.scores.totalOrders - a.scores.totalOrders)
                    .slice(0, 7)}
                  margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="vendorName"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={10}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => [`${value} orders`, 'Total Orders']}
                  />
                  <Bar dataKey="scores.totalOrders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <DollarSign className="text-green-500" size={24} />
                Top Vendors by Order Value
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart
                  data={filteredAllVendors
                    .sort((a, b) => b.scores.totalPOValue - a.scores.totalPOValue)
                    .slice(0, 7)}
                  margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="vendorName"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={10}
                  />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    tickFormatter={(value) => `${(value / 100000000).toFixed(1)}Cr`}
                    width={50}
                  />
                  <YAxis yAxisId="right" orientation="right" width={40} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === 'Order Value (Cr)' ? `₹${(value / 10000000).toFixed(2)}Cr` : `${value} orders`,
                      name
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    yAxisId="left"
                    dataKey="scores.totalPOValue"
                    fill="#10b981"
                    name="Order Value (Cr)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="scores.totalOrders"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    name="Total Orders"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Package className="text-slate-600" size={24} />
              All Vendors ({filteredAllVendors.length} total)
            </h3>
            <p className="text-slate-600 mt-1">Click any vendor to view their detailed purchase orders and performance metrics</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAllVendors
              .sort((a, b) => b.scores.total - a.scores.total)
              .map((vendor, index) => (
              <div
                key={vendor.vendorCd}
                onClick={() => {
                  setCameFrom('allVendors');
                  setSelectedVendor(vendor);
                  setViewLevel('poDetails');
                }}
                className="bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-2xl transition-all transform hover:-translate-y-1"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-800">{vendor.vendorName}</h3>
                    <p className="text-slate-600 text-sm mt-1">Code: {vendor.vendorCd}</p>
                    <p className="text-slate-600 text-sm mt-1">City: {vendor.vendorCity}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-600">
                      {vendor.scores.total}
                    </div>
                    <div className="text-sm text-slate-500">Overall Score</div>
                  </div>
                </div>

                <div className="flex gap-2 mb-4 flex-wrap">
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    {vendor.itemsCount} Items
                  </span>
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                    {vendor.scores.totalOrders} POs
                  </span>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Total PO Value</span>
                    <span className="text-lg font-bold text-slate-800">
                      ₹{(vendor.scores.totalPOValue / 10000000).toFixed(2)}Cr
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">On-Time %</span>
                    <span className="text-md font-semibold text-slate-700">
                      {vendor.scores.onTimeRate}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (viewLevel === 'poDetails') {
    try {
      // Debug logging
      console.log('PO Details View:', { selectedVendor, cameFrom, viewLevel });

      if (!selectedVendor || typeof selectedVendor !== 'object' || !selectedVendor.vendorName) {
        return (
          <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md">
              <div className="text-center">
                <div className="text-red-500 text-6xl mb-4">⚠️</div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Vendor Not Found</h2>
                <p className="text-slate-600 mb-6">
                  Unable to load vendor details. Please try again.
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setSelectedVendor(null);
                      setViewLevel('allVendors');
                    }}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Back to All Vendors
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVendor(null);
                      setCameFrom(null);
                      setViewLevel('items');
                    }}
                    className="w-full px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                  >
                    Back to Items
                  </button>
                </div>
                <div className="mt-4 text-xs text-slate-500">
                  Debug: viewLevel={viewLevel}, hasVendor={!!selectedVendor}, vendorType={typeof selectedVendor}, vendorKeys={selectedVendor ? Object.keys(selectedVendor).join(',') : 'null'}
                </div>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
          <div className="max-w-7xl mx-auto">
          {/* Breadcrumb Navigation */}
          <div className="mb-6 flex items-center gap-2 text-sm">
            {cameFrom === 'allVendors' ? (
              <>
                <button
                  onClick={() => {
                    setViewLevel('allVendors');
                    setSelectedVendor(null);
                    setSelectedItem(null);
                  }}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                >
                  All Vendors
                </button>
                <span className="text-slate-500">{'>'}</span>
                <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium">
                  {selectedVendor.vendorName}
                </span>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setViewLevel('items');
                    setSelectedItem(null);
                    setSelectedVendor(null);
                    setCameFrom(null);
                  }}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                >
                  Items
                </button>
                <span className="text-slate-500">{'>'}</span>
                {selectedItem && (
                  <>
                    <button
                      onClick={() => {
                        setViewLevel('vendors');
                        setSelectedVendor(null);
                      }}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                    >
                      {selectedItem.itemCd}
                    </button>
                    <span className="text-slate-500">{'>'}</span>
                  </>
                )}
                <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium">
                  {selectedVendor.vendorName}
                </span>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <h1 className="text-3xl font-bold text-slate-800 mb-2">{selectedVendor.vendorName}</h1>
                <div className="flex gap-4 text-slate-600 mb-4">
                  <div className="flex items-center gap-2">
                    <FileText size={18} />
                    <span>Vendor Code: {selectedVendor.vendorCd}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={18} />
                    <span>{selectedVendor.vendorCity}</span>
                  </div>
                </div>
                {selectedItem && (
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {selectedItem.matGrp}
                    </span>
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                      {selectedItem.matType}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6">
                <div className="text-center">
                  <div className="text-5xl font-bold text-blue-700 mb-2">
                    {selectedVendor.scores.total}
                  </div>
                  <div className="text-sm text-blue-600 font-medium mb-3">Overall Performance Score</div>
                  <div className="flex justify-between text-xs">
                    <span>Price: {selectedVendor.scores.price}/30</span>
                    <span>Quality: {selectedVendor.scores.quality}/60</span>
                    <span>Delivery: {selectedVendor.scores.delivery}/10</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="text-blue-500" size={24} />
                <span className="text-sm text-slate-600">Total Value</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                ₹{(selectedVendor.scores.totalPOValue / 10000000).toFixed(2)}Cr
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle className="text-green-500" size={24} />
                <span className="text-sm text-slate-600">Quality</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {selectedVendor.scores.rejectionRate}%
              </div>
              <div className="text-xs text-slate-500">Rejection Rate</div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <Calendar className="text-orange-500" size={24} />
                <span className="text-sm text-slate-600">Avg Delivery Time</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {selectedVendor.scores.onTimeRate}%
              </div>
              <div className="text-xs text-slate-500">On-Time Rate</div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <Clock className="text-purple-500" size={24} />
                <span className="text-sm text-slate-600">Total Orders</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {selectedVendor.scores.totalOrders}
              </div>
              <div className="text-xs text-slate-500">Purchase Orders</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Delivery Status Overview</h3>
              {(() => {
                try {
                  // Get accurate counts from actual order data
                  const pos = selectedVendor.pos || [];
                  const pendingCount = pos.filter(po => !po.lastGrn || po.lastGrn === 'Pending').length;

                  // Only count completed orders (those with GRN dates that aren't 'Pending')
                  const completedOrders = pos.filter(po => po.lastGrn && po.lastGrn !== 'Pending');
                  const delayedCount = completedOrders.filter(po => {
                    if (!po.deliveryDate || !po.lastGrn) return false;
                    const delivery = new Date(po.deliveryDate);
                    const grn = new Date(po.lastGrn);
                    return grn > delivery;
                  }).length;
                  const onTimeCount = completedOrders.length - delayedCount;

                  const totalOrders = pos.length;
                  const completionRate = totalOrders > 0 ? ((completedOrders.length / totalOrders) * 100).toFixed(1) : '0';

                  const summaryData = [
                    { name: 'On Time', count: onTimeCount, color: '#10b981' },
                    { name: 'Delayed', count: delayedCount, color: '#f59e0b' },
                    { name: 'Pending', count: pendingCount, color: '#6b7280' }
                  ].filter(item => item.count > 0); // Only show categories with data

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-700">{onTimeCount}</div>
                          <div className="text-xs text-green-600">On Time</div>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-700">{completionRate}%</div>
                          <div className="text-xs text-blue-600">Completion Rate</div>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-lg">
                          <div className="text-2xl font-bold text-orange-700">{delayedCount}</div>
                          <div className="text-xs text-orange-600">Delayed</div>
                        </div>
                      </div>

                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={summaryData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {summaryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      <div className="text-xs text-slate-500 text-center">
                        Delivery status for {totalOrders} purchase orders • {pendingCount} pending delivery
                      </div>
                    </div>
                  );
                } catch (error) {
                  return (
                    <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
                      <div className="text-center">
                        <div className="text-gray-400 text-4xl mb-2">📊</div>
                        <div className="text-gray-600">Delivery status unavailable</div>
                        <div className="text-xs text-gray-500 mt-1">Error: {error.message}</div>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Quality Analysis & Quantity Trends</h3>
              {(() => {
                try {
                  // Safely prepare data with null checks
                  const chartData = selectedVendor.pos && selectedVendor.pos.length > 0
                    ? selectedVendor.pos.map(po => {
                        if (!po) return null;
                        const grnQty = typeof po.totalGrnQty === 'number' ? po.totalGrnQty : 0;
                        const rejectQty = typeof po.rejectQty === 'number' ? po.rejectQty : 0;
                        return {
                          poNo: po.poNo?.slice(-4) || 'N/A',
                          accepted: Math.max(0, grnQty - rejectQty),
                          rejected: rejectQty,
                          grnQty: grnQty,
                          rejectQty: rejectQty
                        };
                      }).filter(item => item !== null)
                    : [];

                  if (chartData.length === 0) {
                    throw new Error('No data available');
                  }

                  return (
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="poNo" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="accepted" stackId="a" fill="#10b981" name="Accepted Qty" />
                        <Bar yAxisId="left" dataKey="rejected" stackId="a" fill="#ef4444" name="Rejected Qty" />
                        <Line yAxisId="right" type="monotone" dataKey="grnQty" stroke="#3b82f6" strokeWidth={3} name="GRN Qty" />
                        <Line yAxisId="right" type="monotone" dataKey="rejectQty" stroke="#f59e0b" strokeWidth={3} name="Reject Qty" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  );
                } catch (error) {
                  return (
                    <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
                      <div className="text-center">
                        <div className="text-gray-400 text-4xl mb-2">📊</div>
                        <div className="text-gray-600">Chart temporarily unavailable</div>
                        <div className="text-xs text-gray-500 mt-1">Error loading quality analysis: {error.message}</div>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Purchase Orders</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">PO No</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">PO Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Item Description</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">PO Qty</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Value</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">GRN Qty</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Reject Qty</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Expected</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Delivered</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {selectedVendor.pos.map((po, index) => {
                    const delay = calculateDelay(po.deliveryDate, po.lastGrn);
                    const isDelayed = delay && delay > 0;
                    const rejectionRate = po.totalGrnQty > 0 ? (po.rejectQty / po.totalGrnQty * 100).toFixed(2) : 0;

                    return (
                      <tr key={po.poNo} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{po.poNo}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{po.poDt}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">{po.itemDesc}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{po.poQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{po.unit}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">₹{po.basicRate.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800 text-right">
                          ₹{(po.basicValue / 100000).toFixed(2)}L
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{po.totalGrnQty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`font-semibold ${po.rejectQty > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {po.rejectQty.toLocaleString()}
                            {po.rejectQty > 0 && ` (${rejectionRate}%)`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{po.deliveryDate}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{po.lastGrn || 'Pending'}</td>
                        <td className="px-4 py-3 text-center">
                          {!po.lastGrn ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              <Clock size={12} className="mr-1" />
                              Pending
                            </span>
                          ) : isDelayed ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <XCircle size={12} className="mr-1" />
                              Delayed {delay}d
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle size={12} className="mr-1" />
                              On-time
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>


        </div>
      </div>
    );
    } catch (error) {
      console.error('Error rendering PO Details:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        selectedVendor,
        cameFrom,
        viewLevel
      });
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">🐛</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Application Error</h2>
              <p className="text-slate-600 mb-6">
                An error occurred: {error.message || 'Unknown error'}
              </p>
              <div className="text-left text-xs text-slate-500 mb-4 p-2 bg-slate-100 rounded">
                <strong>Error Details:</strong><br/>
                Message: {error.message}<br/>
                Vendor: {selectedVendor?.vendorName}<br/>
                Called from: {cameFrom}
              </div>
              <button
                onClick={() => {
                  setSelectedVendor(null);
                  setViewLevel('allVendors');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Back to All Vendors
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  return null;
};

export default VendorPerformanceDashboard;
