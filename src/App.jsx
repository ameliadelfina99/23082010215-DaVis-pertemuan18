import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import superstoreData from './superstore_data.json';

// ========================================================================
// 1. PREPROCESS DATA SEKALI SAJA
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

const filterOptions = {
  years: ['Semua', ...Array.from(new Set(preprocessedData.map(d => d.year))).sort()],
  regions: ['Semua', ...Array.from(new Set(preprocessedData.map(d => d.region))).sort()]
};

const formatUang = (angka) => `$${Math.round(angka).toLocaleString('id-ID')}`;
const formatBulan = (bTahun) => {
  if (!bTahun || bTahun === '-') return '-';
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const parts = bTahun.split('-');
  return parts.length > 1 ? `${bulan[parseInt(parts[1])-1]} ${parts[0]}` : bTahun;
};

// ========================================================================
// 2. KOMPONEN CHART MEMOIZED
// ========================================================================
const MemoizedChart = React.memo(({ option, style, isMapLoaded }) => {
  if (isMapLoaded === false) return <div style={style} className="flex items-center justify-center font-bold text-slate-400 bg-slate-50/50 rounded-xl">Memuat Peta...</div>;
  return <ReactECharts option={option} notMerge={true} lazyUpdate={true} style={style} />;
}, (prevProps, nextProps) => prevProps.option === nextProps.option && prevProps.isMapLoaded === nextProps.isMapLoaded);


export default function App() {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const [selectedYear, setSelectedYear] = useState('Semua');
  const [selectedRegion, setSelectedRegion] = useState('Semua');

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
  // 3. KALIMAT KONTEKS FILTER DINAMIS (AI OTOMATIS)
  // ========================================================================
  const filterText = useMemo(() => {
    if (selectedYear === 'Semua' && selectedRegion === 'Semua') return "keseluruhan data operasional historis";
    if (selectedYear !== 'Semua' && selectedRegion === 'Semua') return `kinerja bisnis sepanjang tahun ${selectedYear}`;
    if (selectedYear === 'Semua' && selectedRegion !== 'Semua') return `kinerja di wilayah ${selectedRegion} secara keseluruhan`;
    return `kinerja pada tahun ${selectedYear} khusus di wilayah ${selectedRegion}`;
  }, [selectedYear, selectedRegion]);

  const filteredData = useMemo(() => {
    return preprocessedData.filter(row => 
      (selectedYear === 'Semua' || row.year === selectedYear) &&
      (selectedRegion === 'Semua' || row.region === selectedRegion)
    );
  }, [selectedYear, selectedRegion]);

  // ========================================================================
  // 4. AGREGASI & INSIGHTS
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
  // 5. CHART OPTIONS
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

  const { kpi, insights } = aggData;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans border-t-4 border-blue-600">
      
      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Superstore Performance Report</h1>
          <p className="text-slate-500 font-medium mt-1">Dashboard Interaktif — Pertemuan 18</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-800 text-lg">Amelia Delfina Putri</p>
          <p className="text-blue-600 font-semibold bg-blue-50 px-3 py-1 rounded-lg inline-block mt-1">NPM: 23082010215</p> 
        </div>
      </div>

      {/* FILTER BOX */}
      <div className="max-w-7xl mx-auto mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">📅 Tahun:</span>
          <select 
            className="bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 p-2 px-4 font-bold cursor-pointer transition-all" 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            {filterOptions.years.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">📍 Wilayah:</span>
          <select 
            className="bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 p-2 px-4 font-bold cursor-pointer transition-all" 
            value={selectedRegion} 
            onChange={(e) => setSelectedRegion(e.target.value)}
          >
            {filterOptions.regions.map(region => <option key={region} value={region}>{region}</option>)}
          </select>
        </div>
        <div className="ml-auto text-xs font-bold text-slate-600 bg-slate-100 p-2 px-4 rounded-xl border border-slate-200 flex items-center gap-2 shadow-inner">
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
      {!insights && (
        <div className="max-w-7xl mx-auto bg-red-50 text-red-600 p-8 rounded-2xl text-center font-bold border border-red-200 shadow-sm">
          ⚠️ Tidak ada data transaksi yang ditemukan untuk filter {selectedYear} di wilayah {selectedRegion}. Silakan sesuaikan filter.
        </div>
      )}

      {/* KONTEN UTAMA */}
      {insights && (
        <div className="max-w-7xl mx-auto min-h-[500px] transition-opacity duration-300 opacity-100">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-fade-in">
              {/* KPI CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500 hover:shadow-md transition-all">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Penjualan</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{formatUang(kpi.totalSales)}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 hover:shadow-md transition-all">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Keuntungan</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{formatUang(kpi.totalProfit)}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-purple-500 hover:shadow-md transition-all">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Volume Terjual</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{kpi.totalQuantity.toLocaleString('id-ID')} <span className="text-sm font-normal text-slate-500">Unit</span></h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-orange-500 hover:shadow-md transition-all">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Margin Laba</p>
                  <h3 className="text-3xl font-black text-slate-800 mt-1">{kpi.profitMargin.toFixed(2)}%</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.trend} style={{ height: '320px' }} /></div>
                  <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><span className="text-blue-500">📈</span> Analisis Tren Historis:</h4>
                    <p className="text-sm text-slate-600 leading-relaxed text-justify">
                      Meninjau <strong className="text-slate-800">{filterText}</strong>, fluktuasi pendapatan memuncak secara drastis pada periode <strong className="text-blue-600">{formatBulan(insights.topMonth.name)}</strong>. Pada rentang waktu tersebut, perusahaan berhasil mengamankan aliran kas masuk (sales) sebesar <strong className="text-green-600">{formatUang(insights.topMonth.value)}</strong>. Tren ini menegaskan perlunya kesiapan stok inventori yang agresif sebelum periode puncak tersebut tiba di siklus berikutnya.
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.map} isMapLoaded={isMapLoaded} style={{ height: '320px' }} /></div>
                  <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                    <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📍</span> Distribusi Geografis:</h4>
                    <p className="text-sm text-slate-600 leading-relaxed text-justify">
                      Pemetaan wilayah operasional <strong className="text-slate-800">{filterText}</strong> menyoroti dominasi absolut dari negara bagian <strong className="text-blue-600">{insights.topState.name}</strong>. Wilayah ini bertindak sebagai urat nadi perusahaan dengan akumulasi belanja pelanggan menyentuh <strong className="text-green-600">{formatUang(insights.topState.value)}</strong>. Pemeliharaan fasilitas pergudangan di area ini tidak boleh terganggu.
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
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">👤</span> Pangsa Segmen Konsumen:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Bedah demografi berdasarkan <strong className="text-slate-800">{filterText}</strong> membuktikan bahwa segmen <strong className="text-blue-600">{insights.topSegment.name}</strong> adalah penguasa pasar utama. Kelompok ini menyerap perputaran uang hingga <strong className="text-green-600">{formatUang(insights.topSegment.value)}</strong>. Kebijakan *customer retention* (seperti program loyalitas) wajib difokuskan secara masif pada segmen ini.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.category} style={{ height: '350px' }} /></div>
                <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📦</span> Daya Tarik Kategori Produk:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Dalam lanskap permintaan produk <strong className="text-slate-800">{filterText}</strong>, kelompok komoditas <strong className="text-blue-600">{insights.topCategory.name}</strong> tampil sebagai lini bisnis terkuat. Kategori ini menyumbang porsi kue pendapatan sebesar <strong className="text-green-600">{formatUang(insights.topCategory.value)}</strong>. Tim *procurement* (pengadaan barang) harus memprioritaskan modal belanja untuk mengamankan stok vendor di kategori ini.
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
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📊</span> Evaluasi Omset Sub-Kategori Utama:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Menganalisis pencapaian spesifik produk <strong className="text-slate-800">{filterText}</strong>, predikat bintang utama (*Star Product*) diraih oleh <strong>{insights.topSub.name}</strong>. Produk ini memiliki daya serap pasar yang memukau, berhasil mencetak angka penjualan kotor senilai <strong className="text-green-600">{formatUang(insights.topSub.value)}</strong>. Promosi dan *upselling* harus difokuskan mengelilingi keberhasilan lini barang ini.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><MemoizedChart option={chartOptions.profit} style={{ height: '420px' }} /></div>
                <div className="p-6 bg-slate-50/80 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">⚠️</span> Peringatan Defisit Profitabilitas:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Di balik gemerlapnya penjualan, evaluasi margin laba <strong className="text-slate-800">{filterText}</strong> mengungkap fakta krusial: Sub-kategori <strong className="text-red-600">{insights.worstSub.name}</strong> merupakan lintah finansial terbesar bagi perusahaan saat ini. Produk tersebut mencatatkan kinerja margin yang sangat memprihatinkan, yakni sebesar <strong className="text-red-600">{formatUang(insights.worstSub.value)}</strong>. Evaluasi Harga Pokok Penjualan (HPP) atau pemotongan batas diskon (*discount threshold*) adalah kewajiban yang tidak bisa ditunda.
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
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">🎛️</span> Interaksi Kepadatan Wilayah vs Kategori:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Tabulasi silang pada metrik <strong className="text-slate-800">{filterText}</strong> memvisualisasikan konsentrasi transaksi yang tajam. Pertemuan geografis dan komoditas yang paling menghasilkan *cashflow* tertinggi berada di poros <strong className="text-blue-600">{insights.topRegCat.name}</strong>. Poros spesifik ini menyumbang likuiditas senilai <strong className="text-green-600">{formatUang(insights.topRegCat.value)}</strong>, menjadikannya "zona aman" bisnis yang paling stabil di tengah krisis.
                  </p>
                </div>
              </div>

              {/* AUTO-GENERATED EXECUTIVE SUMMARY */}
              <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white p-8 md:p-10 rounded-3xl shadow-xl relative overflow-hidden border border-slate-800">
                <div className="absolute -top-10 -right-10 p-12 opacity-10 text-9xl font-black select-none pointer-events-none">AI</div>
                <h3 className="text-xl md:text-2xl font-black mb-4 flex items-center gap-3 tracking-wide">
                  <span>🤖</span> Konklusi Strategis Otomatis (Auto-Generated)
                </h3>
                <p className="text-sm text-slate-300 mb-6 leading-relaxed text-justify border-b border-white/10 pb-5">
                  Berdasarkan pemrosesan instan terhadap <strong>{filteredData.length.toLocaleString('id-ID')} baris data</strong> yang mewakili profil <strong>{filterText}</strong>, algoritma analitik merumuskan 4 poin *actionable plan* sebagai berikut:
                </p>
                
                <ul className="space-y-5 text-sm text-slate-200 leading-relaxed text-justify">
                  <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10">
                    <span className="text-blue-400 font-bold text-xl leading-none">1.</span>
                    <div>
                      <strong className="text-white block text-base mb-1">Proteksi Jalur Logistik Utama</strong>
                      Negara bagian <strong className="text-blue-300">{insights.topState.name}</strong> adalah jangkar kehidupan finansial perusahaan (menyumbang {formatUang(insights.topState.value)}). Anggaran pemeliharaan pergudangan armada pengiriman di area ini harus ditambah untuk mencegah keterlambatan suplai.
                    </div>
                  </li>
                  <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10">
                    <span className="text-blue-400 font-bold text-xl leading-none">2.</span>
                    <div>
                      <strong className="text-white block text-base mb-1">Targeting Kampanye Segmental</strong>
                      Fokuskan alokasi iklan digital (Facebook/Google Ads) secara spesifik untuk menyasar persona profil <strong className="text-blue-300">{insights.topSegment.name}</strong>. Data historis membuktikan segmen ini memiliki konversi tertinggi tanpa keraguan.
                    </div>
                  </li>
                  <li className="flex gap-4 items-start bg-red-900/20 p-4 rounded-xl border border-red-500/20">
                    <span className="text-red-400 font-bold text-xl leading-none">3.</span>
                    <div>
                      <strong className="text-red-300 block text-base mb-1">Intervensi Kebijakan Harga Segera!</strong>
                      Gelar audit investigasi secara menyeluruh terhadap skema harga dan kelayakan diskon pada produk <strong className="text-red-300">{insights.worstSub.name}</strong>. Produk ini bukan lagi aset, melainkan beban (*liability*) yang menguras kas perusahaan dengan catatan margin di angka <strong>{formatUang(insights.worstSub.value)}</strong>.
                    </div>
                  </li>
                  <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10">
                    <span className="text-blue-400 font-bold text-xl leading-none">4.</span>
                    <div>
                      <strong className="text-white block text-base mb-1">Eskalasi Persiapan Musiman</strong>
                      Siapkan peluncuran anggaran promosi gila-gilaan tepat sebelum periode <strong className="text-blue-300">{formatBulan(insights.topMonth.name)}</strong> tiba. Euforia historis belanja di bulan tersebut tidak boleh disia-siakan dan harus dieksploitasi untuk mencetak rekor penjualan baru.
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ANIMASI HALUS PERPINDAHAN HALAMAN */}
      <style>{`
        .animate-fade-in { animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}