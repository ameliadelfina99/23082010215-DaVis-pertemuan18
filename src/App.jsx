import React, { useState, useEffect, useMemo, useTransition } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import superstoreData from './superstore_data.json';

// ========================================================================
// 1. PREPROCESS DATA SEKALI SAJA (Di luar komponen)
// ========================================================================
const parseNum = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(val.toString().replace(/,/g, '.').replace(/[^0-9.-]/g, '')) || 0;
};

const getYearFromRow = (row) => {
  if (row.Tahun) return String(row.Tahun);
  if (row['Order ID'] && String(row['Order ID']).includes('-')) {
    const parts = String(row['Order ID']).split('-');
    if (parts[1] && parts[1].length === 4) return parts[1];
  }
  const num = parseFloat(row['Order Date']);
  if (!isNaN(num) && num > 30000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return String(date.getFullYear());
  }
  return '2026';
};

const getMonthYearFromRow = (row, year) => {
  if (row.Bulan) return `${year}-${String(row.Bulan).padStart(2, '0')}`;
  const num = parseFloat(row['Order Date']);
  if (!isNaN(num) && num > 30000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${year}-01`;
};

// Data yang sudah bersih, tinggal pakai! (Mencegah parse berulang)
const preprocessedData = superstoreData.map(row => {
  const year = getYearFromRow(row);
  return {
    ...row,
    parsedSales: parseNum(row.Sales),
    parsedProfit: parseNum(row.Profit),
    parsedQty: parseNum(row.Quantity),
    year: year,
    monthYear: getMonthYearFromRow(row, year),
    state: row['State/Province'] || row.State || 'Unknown',
    segment: row.Segment || 'Unknown',
    category: row.Category || 'Unknown',
    subCategory: row['Sub-Category'] || 'Unknown',
    region: row.Region || 'Unknown'
  };
});

// Daftar Filter Unik
const filterOptions = {
  years: ['Semua', ...Array.from(new Set(preprocessedData.map(d => d.year))).sort()],
  regions: ['Semua', ...Array.from(new Set(preprocessedData.map(d => d.region))).sort()]
};

const formatUang = (angka) => `$${Math.round(angka).toLocaleString('id-ID')}`;
const formatBulan = (bTahun) => bTahun && bTahun !== '-' ? (bTahun.split('-').length > 1 ? `Bulan ke-${bTahun.split('-')[1]} (${bTahun.split('-')[0]})` : bTahun) : '-';

// ========================================================================
// 2. KOMPONEN CHART MEMOIZED (Cegah Re-render Ekstra)
// ========================================================================
const MemoizedChart = React.memo(({ option, style, isMapLoaded }) => {
  if (isMapLoaded === false) return <div style={style} className="flex items-center justify-center font-bold text-slate-400 bg-slate-50/50 rounded-xl">Memuat Peta...</div>;
  // lazyUpdate=true membuat render tidak blocking
  return <ReactECharts option={option} notMerge={true} lazyUpdate={true} style={style} />;
}, (prevProps, nextProps) => prevProps.option === nextProps.option && prevProps.isMapLoaded === nextProps.isMapLoaded);

export default function App() {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // STATE FILTER & TRANSITION
  const [selectedYear, setSelectedYear] = useState('Semua');
  const [selectedRegion, setSelectedRegion] = useState('Semua');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
      .then(res => res.json())
      .then(usaJson => {
        echarts.registerMap('USA', usaJson);
        setIsMapLoaded(true);
      })
      .catch(err => console.error("Gagal muat peta:", err));
  }, []);

  // ========================================================================
  // 3. FILTERING DATA
  // ========================================================================
  const filteredData = useMemo(() => {
    return preprocessedData.filter(row => 
      (selectedYear === 'Semua' || row.year === selectedYear) &&
      (selectedRegion === 'Semua' || row.region === selectedRegion)
    );
  }, [selectedYear, selectedRegion]);

  // ========================================================================
  // 4. AGREGASI SEKALI JALAN (SINGLE-PASS) UNTUK SEMUA GRAFIK
  // ========================================================================
  const aggData = useMemo(() => {
    const kpi = { totalSales: 0, totalProfit: 0, totalQuantity: 0 };
    const aggMonth = {}, aggState = {}, aggSeg = {}, aggCat = {}, aggSubSales = {}, aggSubProf = {}, aggRegCat = {};

    filteredData.forEach(row => {
      kpi.totalSales += row.parsedSales;
      kpi.totalProfit += row.parsedProfit;
      kpi.totalQuantity += row.parsedQty;

      aggMonth[row.monthYear] = (aggMonth[row.monthYear] || 0) + row.parsedSales;
      aggState[row.state] = (aggState[row.state] || 0) + row.parsedSales;
      aggSeg[row.segment] = (aggSeg[row.segment] || 0) + row.parsedSales;
      aggCat[row.category] = (aggCat[row.category] || 0) + row.parsedSales;
      aggSubSales[row.subCategory] = (aggSubSales[row.subCategory] || 0) + row.parsedSales;
      aggSubProf[row.subCategory] = (aggSubProf[row.subCategory] || 0) + row.parsedProfit;
      
      const rcKey = `${row.region}-${row.category}`;
      aggRegCat[rcKey] = (aggRegCat[rcKey] || 0) + row.parsedSales;
    });

    kpi.profitMargin = kpi.totalSales > 0 ? (kpi.totalProfit / kpi.totalSales) * 100 : 0;

    const getTop = (agg) => {
      let maxKey = '-', maxVal = -Infinity;
      for (const [k, v] of Object.entries(agg)) { if (v > maxVal) { maxVal = v; maxKey = k; } }
      return { name: maxKey, value: maxVal };
    };

    const getBottom = (agg) => {
      let minKey = '-', minVal = Infinity;
      for (const [k, v] of Object.entries(agg)) { if (v < minVal) { minVal = v; minKey = k; } }
      return { name: minKey, value: minVal };
    };

    return {
      kpi, aggMonth, aggState, aggSeg, aggCat, aggSubSales, aggSubProf, aggRegCat,
      insights: filteredData.length > 0 ? {
        topMonth: getTop(aggMonth), topState: getTop(aggState), topSegment: getTop(aggSeg),
        topCategory: getTop(aggCat), topSub: getTop(aggSubSales), worstSub: getBottom(aggSubProf), topRegCat: getTop(aggRegCat)
      } : null
    };
  }, [filteredData]);

  // ========================================================================
  // 5. CHART OPTIONS (Hanya mengubah format data dari agregasi)
  // ========================================================================
  const chartOptions = useMemo(() => {
    const { aggMonth, aggState, aggSeg, aggCat, aggSubSales, aggSubProf, aggRegCat } = aggData;
    
    const sortedMonth = Object.keys(aggMonth).sort();
    const sortedSubS = Object.entries(aggSubSales).sort((a,b) => a[1] - b[1]);
    const sortedSubP = Object.entries(aggSubProf).sort((a,b) => b[1] - a[1]);
    
    const regions = ['Central', 'East', 'South', 'West'], categories = ['Furniture', 'Office Supplies', 'Technology'];
    const heatmapArr = [];
    regions.forEach((r, i) => { categories.forEach((c, j) => { heatmapArr.push([i, j, Math.round(aggRegCat[`${r}-${c}`] || 0)]); }); });

    return {
      trend: { title: { text: 'Tren Penjualan Bulanan', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: sortedMonth, axisLabel: { rotate: 45, fontSize: 10 } }, yAxis: { type: 'value' }, series: [{ data: sortedMonth.map(k => Math.round(aggMonth[k])), type: 'line', smooth: true, itemStyle: { color: '#2563eb' }, areaStyle: { opacity: 0.1, color: '#2563eb' } }] },
      map: { title: { text: 'Peta Penjualan (Negara Bagian)', left: 'center' }, tooltip: { trigger: 'item' }, visualMap: { left: 'right', min: 0, max: Math.max(...Object.values(aggState), 10000), inRange: { color: ['#e0f2fe', '#3b82f6', '#1e3a8a'] }, calculable: true }, series: [{ type: 'map', map: 'USA', roam: true, data: Object.keys(aggState).map(k => ({ name: k, value: Math.round(aggState[k]) })) }] },
      segment: { title: { text: 'Sales by Segment', left: 'center' }, tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', radius: '55%', center: ['50%', '45%'], data: Object.keys(aggSeg).map(k => ({ name: k, value: Math.round(aggSeg[k]) })), itemStyle: { borderColor: '#fff', borderWidth: 2 } }] },
      category: { title: { text: 'Sales by Category', left: 'center' }, tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', radius: ['35%', '60%'], center: ['50%', '45%'], data: Object.keys(aggCat).map(k => ({ name: k, value: Math.round(aggCat[k]) })), itemStyle: { borderColor: '#fff', borderWidth: 2 } }] },
      subCategory: { title: { text: 'Sales per Sub-Kategori', left: 'center' }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true }, xAxis: { type: 'value' }, yAxis: { type: 'category', data: sortedSubS.map(d => d[0]), axisLabel: { fontSize: 10 } }, series: [{ type: 'bar', data: sortedSubS.map(d => Math.round(d[1])), itemStyle: { color: '#0ea5e9' } }] },
      profit: { title: { text: 'Profit/Loss per Sub-Kategori', left: 'center' }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: '3%', right: '4%', bottom: '18%', containLabel: true }, xAxis: { type: 'category', data: sortedSubP.map(d => d[0]), axisLabel: { interval: 0, rotate: 45, fontSize: 10 } }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: sortedSubP.map(d => ({ value: Math.round(d[1]), itemStyle: { color: d[1] >= 0 ? '#10b981' : '#ef4444' } })) }] },
      heatmap: { title: { text: 'Heatmap Penjualan (Region vs Category)', left: 'center' }, tooltip: { position: 'top' }, grid: { height: '55%', top: '18%' }, xAxis: { type: 'category', data: regions, splitArea: { show: true } }, yAxis: { type: 'category', data: categories, splitArea: { show: true } }, visualMap: { min: 0, max: Math.max(...heatmapArr.map(d=>d[2]), 100000), calculable: true, orient: 'horizontal', left: 'center', bottom: '0%', inRange: { color: ['#f8fafc', '#93c5fd', '#1e3a8a'] } }, series: [{ name: 'Sales', type: 'heatmap', data: heatmapArr, label: { show: true }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } } }] }
    };
  }, [aggData]);

  // HANDLER FILTER DENGAN TRANSITION
  const handleYearChange = (e) => startTransition(() => setSelectedYear(e.target.value));
  const handleRegionChange = (e) => startTransition(() => setSelectedRegion(e.target.value));

  const { kpi, insights } = aggData;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans border-t-4 border-blue-600">
      
      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Superstore Performance Report</h1>
          <p className="text-slate-500 font-medium mt-1">Dashboard Interaktif dengan Narasi AI — Pertemuan 18</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-800 text-lg">Amelia Delfina Putri</p>
          <p className="text-blue-600 font-semibold bg-blue-50 px-3 py-1 rounded-lg inline-block mt-1">NPM: 210xxxxxxx</p> 
        </div>
      </div>

      {/* FILTER BOX */}
      <div className="max-w-7xl mx-auto mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">📅 Tahun:</span>
          <select className="bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 p-2 px-4 font-bold cursor-pointer" value={selectedYear} onChange={handleYearChange}>
            {filterOptions.years.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">📍 Wilayah:</span>
          <select className="bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 p-2 px-4 font-bold cursor-pointer" value={selectedRegion} onChange={handleRegionChange}>
            {filterOptions.regions.map(region => <option key={region} value={region}>{region}</option>)}
          </select>
        </div>
        <div className="ml-auto text-xs font-bold text-slate-600 bg-slate-100 p-2 px-4 rounded-xl border border-slate-200 flex items-center gap-2">
          {isPending && <span className="animate-spin text-blue-500">⏳</span>}
          📂 Ter-filter: <span className="text-blue-600 font-extrabold">{filteredData.length.toLocaleString('id-ID')}</span> Baris
        </div>
      </div>

      {/* TABS */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-wrap gap-2 bg-slate-200/60 p-1.5 rounded-2xl border border-slate-300">
        {[ { id: 'overview', label: '📊 Ringkasan Eksekutif' }, { id: 'demografi', label: '🥧 Pangsa Segmen & Kategori' }, { id: 'produk', label: '📈 Performa Sub-Kategori' }, { id: 'kesimpulan', label: '🎯 Kesimpulan Dinamis' } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs md:text-sm tracking-wide transition-all duration-300 ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-md border border-slate-200' : 'text-slate-600 hover:bg-white/40'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ERROR KALAU FILTER KOSONG */}
      {!insights && !isPending && (
        <div className="max-w-7xl mx-auto bg-red-50 text-red-600 p-8 rounded-2xl text-center font-bold border border-red-200">
          ⚠️ Tidak ada data untuk kombinasi filter ini. Silakan ubah filter.
        </div>
      )}

      {/* KONTEN UTAMA */}
      {insights && (
        <div className={`max-w-7xl mx-auto min-h-[500px] transition-opacity duration-300 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Penjualan</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{formatUang(kpi.totalSales)}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Keuntungan</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{formatUang(kpi.totalProfit)}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-purple-500">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Volume Terjual</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{kpi.totalQuantity.toLocaleString('id-ID')} <span className="text-sm font-normal text-slate-500">Unit</span></h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-orange-500">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Margin Laba</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{kpi.profitMargin.toFixed(2)}%</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.trend} style={{ height: '320px' }} /></div>
                  <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><span className="text-blue-500">📈</span> Narasi Tren Dinamis:</h4>
                    <p className="text-sm text-slate-600 leading-relaxed text-justify">
                      Puncak penjualan omset tertinggi terjadi pada periode <strong>{formatBulan(insights.topMonth.name)}</strong> dengan total pemasukan mencapai <strong className="text-green-600">{formatUang(insights.topMonth.value)}</strong>.
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.map} isMapLoaded={isMapLoaded} style={{ height: '320px' }} /></div>
                  <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                    <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📍</span> Narasi Geografis Dinamis:</h4>
                    <p className="text-sm text-slate-600 leading-relaxed text-justify">
                      Negara bagian <strong>{insights.topState.name}</strong> tampil sebagai kontributor paling dominan, menyumbangkan pemasukan kotor sebesar <strong className="text-blue-600">{formatUang(insights.topState.value)}</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DEMOGRAFI */}
          {activeTab === 'demografi' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.segment} style={{ height: '350px' }} /></div>
                <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">👤</span> Pangsa Segmen Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Kelompok pembeli dari segmen <strong>{insights.topSegment.name}</strong> menjadi penopang pendapatan utama dengan transaksi mencapai <strong>{formatUang(insights.topSegment.value)}</strong>.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.category} style={{ height: '350px' }} /></div>
                <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📦</span> Kategori Favorit Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Komoditas barang dari kategori <strong>{insights.topCategory.name}</strong> sangat diminati pasar, menyumbang sales sebesar <strong>{formatUang(insights.topCategory.value)}</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRODUK */}
          {activeTab === 'produk' && (
            <div className="space-y-8 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.subCategory} style={{ height: '420px' }} /></div>
                <div className="p-6 bg-slate-50/80 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📊</span> Evaluasi Omset Sub-Kategori Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Produk unggulan (Star Product) saat ini adalah <strong>{insights.topSub.name}</strong> dengan raihan sales memukau sebesar <strong>{formatUang(insights.topSub.value)}</strong>.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.profit} style={{ height: '420px' }} /></div>
                <div className="p-6 bg-slate-50/80 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">⚠️</span> Peringatan Profitabilitas Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Titik lemah perusahaan terletak pada <strong>{insights.worstSub.name}</strong> dengan riwayat profitabilitas di angka <strong className="text-red-600">{formatUang(insights.worstSub.value)}</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: KESIMPULAN AI */}
          {activeTab === 'kesimpulan' && (
            <div className="space-y-8 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.heatmap} style={{ height: '380px' }} /></div>
                <div className="p-6 bg-slate-50/80 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">🎛️</span> Matriks Region-Kategori Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Kombinasi pasar yang menghasilkan uang terbanyak berada di <strong>{insights.topRegCat.name}</strong> dengan capaian omset <strong>{formatUang(insights.topRegCat.value)}</strong>.
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden border border-slate-800">
                <div className="absolute -top-10 -right-10 p-12 opacity-10 text-9xl font-black select-none">AI</div>
                <h3 className="text-xl md:text-2xl font-black mb-4 flex items-center gap-3 tracking-wide">
                  <span>🤖</span> Auto-Generated Executive Summary
                </h3>
                <p className="text-sm text-slate-300 mb-6 leading-relaxed text-justify border-b border-white/10 pb-4">
                  Berdasarkan pemrosesan data filter secara seketika ({filteredData.length.toLocaleString()} baris transaksi), mesin cerdas merumuskan rekomendasi taktis berikut:
                </p>
                <ul className="space-y-4 text-sm text-slate-200 leading-relaxed text-justify">
                  <li className="flex gap-3 items-start"><span className="text-blue-400 font-bold text-lg mt-0.5">1.</span><div>Pertahankan stok untuk <strong>{insights.topState.name}</strong> (Total: {formatUang(insights.topState.value)}).</div></li>
                  <li className="flex gap-3 items-start"><span className="text-blue-400 font-bold text-lg mt-0.5">2.</span><div>Fokuskan alokasi iklan pada segmen <strong>{insights.topSegment.name}</strong>.</div></li>
                  <li className="flex gap-3 items-start"><span className="text-blue-400 font-bold text-lg mt-0.5">3.</span><div>Lakukan audit harga modal terhadap produk <strong>{insights.worstSub.name}</strong> (Margin: {formatUang(insights.worstSub.value)}).</div></li>
                  <li className="flex gap-3 items-start"><span className="text-blue-400 font-bold text-lg mt-0.5">4.</span><div>Siapkan anggaran besar di <strong>{formatBulan(insights.topMonth.name)}</strong> untuk memaksimalkan momentum periode belanja.</div></li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.35s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}