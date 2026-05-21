import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import superstoreData from './superstore_data.json';

// ========================================================================
// 1. FUNGSI SAKTI: PENGONVERSI FORMAT ANGKA & TANGGAL EXCEL
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

const getMonthYearFromRow = (row) => {
  const year = getYearFromRow(row);
  if (row.Bulan) return `${year}-${String(row.Bulan).padStart(2, '0')}`;
  
  const num = parseFloat(row['Order Date']);
  if (!isNaN(num) && num > 30000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
  }
  return `${year}-01`;
};

// Fungsi pembantu format Uang
const formatUang = (angka) => `$${Math.round(angka).toLocaleString('id-ID')}`;

function App() {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const [selectedYear, setSelectedYear] = useState('Semua');
  const [selectedRegion, setSelectedRegion] = useState('Semua');

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
      .then(response => response.json())
      .then(usaJson => {
        echarts.registerMap('USA', usaJson);
        setIsMapLoaded(true);
      })
      .catch(err => console.error("Gagal memuat file peta:", err));
  }, []);

  const filterOptions = useMemo(() => {
    const years = new Set();
    const regions = new Set();
    superstoreData.forEach(row => {
      years.add(getYearFromRow(row));
      if (row.Region) regions.add(row.Region);
    });
    return {
      years: ['Semua', ...Array.from(years).sort()],
      regions: ['Semua', ...Array.from(regions).sort()]
    };
  }, []);

  const filteredData = useMemo(() => {
    return superstoreData.filter(row => {
      const year = getYearFromRow(row);
      const region = row.Region || '';
      const matchYear = selectedYear === 'Semua' || year === selectedYear;
      const matchRegion = selectedRegion === 'Semua' || region === selectedRegion;
      return matchYear && matchRegion;
    });
  }, [selectedYear, selectedRegion]);

  const kpi = useMemo(() => {
    let sales = 0, profit = 0, qty = 0;
    filteredData.forEach(row => {
      sales += parseNum(row.Sales);
      profit += parseNum(row.Profit);
      qty += parseNum(row.Quantity);
    });
    return { totalSales: sales, totalProfit: profit, totalQuantity: qty, profitMargin: sales > 0 ? (profit / sales) * 100 : 0 };
  }, [filteredData]);

  // ========================================================================
  // 🔥 OTAK AI: MENGHITUNG INSIGHT OTOMATIS UNTUK NARASI DINAMIS
  // ========================================================================
  const insights = useMemo(() => {
    if (filteredData.length === 0) return null;

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

    const aggMonth = {}, aggState = {}, aggSeg = {}, aggCat = {}, aggSubSales = {}, aggSubProf = {}, aggRegCat = {};

    filteredData.forEach(row => {
      const month = getMonthYearFromRow(row);
      const state = row['State/Province'] || row.State || 'Unknown';
      const seg = row.Segment || 'Unknown';
      const cat = row.Category || 'Unknown';
      const sub = row['Sub-Category'] || 'Unknown';
      const regCat = `${row.Region || 'Unknown'} - ${cat}`;
      const sales = parseNum(row.Sales);
      const profit = parseNum(row.Profit);

      aggMonth[month] = (aggMonth[month] || 0) + sales;
      aggState[state] = (aggState[state] || 0) + sales;
      aggSeg[seg] = (aggSeg[seg] || 0) + sales;
      aggCat[cat] = (aggCat[cat] || 0) + sales;
      aggSubSales[sub] = (aggSubSales[sub] || 0) + sales;
      aggSubProf[sub] = (aggSubProf[sub] || 0) + profit;
      aggRegCat[regCat] = (aggRegCat[regCat] || 0) + sales;
    });

    return {
      topMonth: getTop(aggMonth),
      topState: getTop(aggState),
      topSegment: getTop(aggSeg),
      topCategory: getTop(aggCat),
      topSub: getTop(aggSubSales),
      worstSub: getBottom(aggSubProf),
      topRegCat: getTop(aggRegCat)
    };
  }, [filteredData]);

  // KONFIGURASI GRAFIK
  const salesTrendOption = useMemo(() => {
    const agg = {};
    filteredData.forEach(row => { agg[getMonthYearFromRow(row)] = (agg[getMonthYearFromRow(row)] || 0) + parseNum(row.Sales); });
    const sortedKeys = Object.keys(agg).sort();
    return { title: { text: 'Tren Penjualan Bulanan', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: sortedKeys, axisLabel: { rotate: 45, fontSize: 10 } }, yAxis: { type: 'value' }, series: [{ data: sortedKeys.map(k => Math.round(agg[k])), type: 'line', smooth: true, itemStyle: { color: '#2563eb' }, areaStyle: { opacity: 0.1, color: '#2563eb' } }] };
  }, [filteredData]);

  const mapChartOption = useMemo(() => {
    const stateData = {};
    filteredData.forEach(row => { const state = row['State/Province'] || row.State; if (state) stateData[state] = (stateData[state] || 0) + parseNum(row.Sales); });
    const data = Object.keys(stateData).map(state => ({ name: state, value: Math.round(stateData[state]) }));
    return { title: { text: 'Peta Penjualan (Negara Bagian)', left: 'center' }, tooltip: { trigger: 'item' }, visualMap: { left: 'right', min: 0, max: Math.max(...data.map(d=>d.value), 10000), inRange: { color: ['#e0f2fe', '#3b82f6', '#1e3a8a'] }, calculable: true }, series: [{ type: 'map', map: 'USA', roam: true, data }] };
  }, [filteredData]);

  const segmentOption = useMemo(() => {
    const agg = {}; filteredData.forEach(row => { if(row.Segment) agg[row.Segment] = (agg[row.Segment] || 0) + parseNum(row.Sales); });
    return { title: { text: 'Sales by Segment', left: 'center' }, tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', radius: '55%', center: ['50%', '45%'], data: Object.keys(agg).map(k => ({ name: k, value: Math.round(agg[k]) })), itemStyle: { borderColor: '#fff', borderWidth: 2 } }] };
  }, [filteredData]);

  const categoryOption = useMemo(() => {
    const agg = {}; filteredData.forEach(row => { if(row.Category) agg[row.Category] = (agg[row.Category] || 0) + parseNum(row.Sales); });
    return { title: { text: 'Sales by Category', left: 'center' }, tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', radius: ['35%', '60%'], center: ['50%', '45%'], data: Object.keys(agg).map(k => ({ name: k, value: Math.round(agg[k]) })), itemStyle: { borderColor: '#fff', borderWidth: 2 } }] };
  }, [filteredData]);

  const subCategoryOption = useMemo(() => {
    const agg = {}; filteredData.forEach(row => { const sub = row['Sub-Category']; if(sub) agg[sub] = (agg[sub] || 0) + parseNum(row.Sales); });
    const sorted = Object.entries(agg).sort((a,b) => a[1] - b[1]);
    return { title: { text: 'Sales per Sub-Kategori', left: 'center' }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true }, xAxis: { type: 'value' }, yAxis: { type: 'category', data: sorted.map(d => d[0]), axisLabel: { fontSize: 10 } }, series: [{ type: 'bar', data: sorted.map(d => Math.round(d[1])), itemStyle: { color: '#0ea5e9' } }] };
  }, [filteredData]);

  const profitOption = useMemo(() => {
    const agg = {}; filteredData.forEach(row => { const sub = row['Sub-Category']; if(sub) agg[sub] = (agg[sub] || 0) + parseNum(row.Profit); });
    const sorted = Object.entries(agg).sort((a,b) => b[1] - a[1]);
    return { title: { text: 'Profit/Loss per Sub-Kategori', left: 'center' }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: '3%', right: '4%', bottom: '18%', containLabel: true }, xAxis: { type: 'category', data: sorted.map(d => d[0]), axisLabel: { interval: 0, rotate: 45, fontSize: 10 } }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: sorted.map(d => ({ value: Math.round(d[1]), itemStyle: { color: d[1] >= 0 ? '#10b981' : '#ef4444' } })) }] };
  }, [filteredData]);

  const heatmapOption = useMemo(() => {
    const regions = ['Central', 'East', 'South', 'West'], categories = ['Furniture', 'Office Supplies', 'Technology'], agg = {};
    filteredData.forEach(row => { if(row.Region && row.Category) { const key = `${row.Region}-${row.Category}`; agg[key] = (agg[key] || 0) + parseNum(row.Sales); }});
    const data = []; regions.forEach((reg, i) => { categories.forEach((cat, j) => { data.push([i, j, Math.round(agg[`${reg}-${cat}`] || 0)]); }); });
    return { title: { text: 'Heatmap Penjualan (Region vs Category)', left: 'center' }, tooltip: { position: 'top' }, grid: { height: '55%', top: '18%' }, xAxis: { type: 'category', data: regions, splitArea: { show: true } }, yAxis: { type: 'category', data: categories, splitArea: { show: true } }, visualMap: { min: 0, max: Math.max(...data.map(d=>d[2]), 100000), calculable: true, orient: 'horizontal', left: 'center', bottom: '0%', inRange: { color: ['#f8fafc', '#93c5fd', '#1e3a8a'] } }, series: [{ name: 'Sales', type: 'heatmap', data: data, label: { show: true }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } } }] };
  }, [filteredData]);

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

      {/* FILTER */}
      <div className="max-w-7xl mx-auto mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">📅 Tahun:</span>
          <select className="bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 p-2 px-4 font-bold cursor-pointer" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
            {filterOptions.years.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-700 uppercase tracking-wider">📍 Wilayah:</span>
          <select className="bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 p-2 px-4 font-bold cursor-pointer" value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
            {filterOptions.regions.map(region => <option key={region} value={region}>{region}</option>)}
          </select>
        </div>
        <div className="ml-auto text-xs font-bold text-slate-600 bg-slate-100 p-2 px-4 rounded-xl border border-slate-200">
          📂 Ter-filter: <span className="text-blue-600 font-extrabold">{filteredData.length.toLocaleString('id-ID')}</span> Baris Transaksi
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

      {/* KONTEN JIKA DATA KOSONG */}
      {!insights && (
        <div className="max-w-7xl mx-auto bg-red-50 text-red-600 p-8 rounded-2xl text-center font-bold border border-red-200">
          ⚠️ Tidak ada data untuk kombinasi filter ini. Silakan ubah filter.
        </div>
      )}

      {/* KONTEN UTAMA JIKA DATA ADA */}
      {insights && (
        <div className="max-w-7xl mx-auto">
          {/* HALAMAN 1: OVERVIEW */}
          <div className={activeTab === 'overview' ? 'block animate-fade-in' : 'hidden'}>
            <div className="space-y-8">
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
                  <div className="p-4 border-b border-slate-100"><ReactECharts option={salesTrendOption} notMerge={true} style={{ height: '320px' }} /></div>
                  <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><span className="text-blue-500">📈</span> Narasi Tren Dinamis:</h4>
                    <p className="text-sm text-slate-600 leading-relaxed text-justify">
                      Berdasarkan filter data yang kamu pilih, puncak penjualan omset tertinggi terjadi pada periode <strong>{insights.topMonth.name}</strong> dengan total pemasukan mencapai <strong className="text-green-600">{formatUang(insights.topMonth.value)}</strong>. Fluktuasi di bulan-bulan lainnya menunjukkan bahwa perusahaan harus memusatkan kampanye pemasaran saat mendekati periode puncak ini.
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100">{!isMapLoaded ? <div className="h-[320px] flex items-center justify-center font-bold">Memuat Peta...</div> : <ReactECharts option={mapChartOption} notMerge={true} style={{ height: '320px' }} />}</div>
                  <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                    <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📍</span> Narasi Geografis Dinamis:</h4>
                    <p className="text-sm text-slate-600 leading-relaxed text-justify">
                      Untuk kriteria data saat ini, negara bagian <strong>{insights.topState.name}</strong> tampil sebagai kontributor paling dominan, menyumbangkan pemasukan kotor sebesar <strong className="text-blue-600">{formatUang(insights.topState.value)}</strong>. Hal ini menjadikannya area paling krusial untuk distribusi inventaris logistik.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* HALAMAN 2: DEMOGRAFI */}
          <div className={activeTab === 'demografi' ? 'block animate-fade-in' : 'hidden'}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><ReactECharts option={segmentOption} notMerge={true} style={{ height: '350px' }} /></div>
                <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">👤</span> Pangsa Segmen Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Analisis data menunjukkan bahwa kelompok pembeli dari segmen <strong>{insights.topSegment.name}</strong> menjadi penopang pendapatan utama dengan transaksi mencapai <strong>{formatUang(insights.topSegment.value)}</strong>. Strategi <i>customer retention</i> harus diprioritaskan pada segmen ini karena terbukti paling responsif terhadap penjualan.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><ReactECharts option={categoryOption} notMerge={true} style={{ height: '350px' }} /></div>
                <div className="p-6 bg-slate-50/80 flex-1 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📦</span> Kategori Favorit Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Dari data yang disaring, komoditas barang dari kategori <strong>{insights.topCategory.name}</strong> sangat diminati pasar, menyumbang sales sebesar <strong>{formatUang(insights.topCategory.value)}</strong>. Manajemen stok untuk barang di kategori ini harus diperketat agar tidak terjadi <i>out-of-stock</i>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* HALAMAN 3: PRODUK */}
          <div className={activeTab === 'produk' ? 'block animate-fade-in' : 'hidden'}>
            <div className="space-y-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><ReactECharts option={subCategoryOption} notMerge={true} style={{ height: '420px' }} /></div>
                <div className="p-6 bg-slate-50/80 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">📊</span> Evaluasi Omset Sub-Kategori Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Membedah lebih dalam ke tingkat sub-kategori, produk unggulan (Star Product) saat ini adalah <strong>{insights.topSub.name}</strong> dengan raihan sales memukau sebesar <strong>{formatUang(insights.topSub.value)}</strong>. Produk ini memiliki *brand awareness* yang kuat di rentang filter yang Anda pilih.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><ReactECharts option={profitOption} notMerge={true} style={{ height: '420px' }} /></div>
                <div className="p-6 bg-slate-50/80 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">⚠️</span> Peringatan Profitabilitas Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Meskipun ada barang laku, grafik ini mendeteksi titik lemah perusahaan. Sub-kategori <strong>{insights.worstSub.name}</strong> adalah produk dengan performa margin terburuk saat ini dengan riwayat profitabilitas di angka <strong className="text-red-600">{formatUang(insights.worstSub.value)}</strong>. Ini butuh evaluasi Harga Jual Pokok (HPP) atau pengurangan diskon secara radikal!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* HALAMAN 4: KESIMPULAN */}
          <div className={activeTab === 'kesimpulan' ? 'block animate-fade-in' : 'hidden'}>
            <div className="space-y-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><ReactECharts option={heatmapOption} notMerge={true} style={{ height: '380px' }} /></div>
                <div className="p-6 bg-slate-50/80 border-t border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><span className="text-blue-500">🎛️</span> Matriks Region-Kategori Dinamis:</h4>
                  <p className="text-sm text-slate-600 leading-relaxed text-justify">
                    Heatmap memvisualisasikan interaksi silang yang kuat. Kombinasi pasar yang paling panas dan menghasilkan uang terbanyak berada di wilayah-kategori <strong>{insights.topRegCat.name}</strong> dengan capaian omset <strong>{formatUang(insights.topRegCat.value)}</strong>.
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
                  <li className="flex gap-3 items-start">
                    <span className="text-blue-400 font-bold text-lg mt-0.5">1.</span>
                    <div>
                      Pertahankan *supply chain* prioritas untuk negara bagian <strong>{insights.topState.name}</strong>, mengingat area ini adalah jantung pendapatan perusahaan (Total: {formatUang(insights.topState.value)}).
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="text-blue-400 font-bold text-lg mt-0.5">2.</span>
                    <div>
                      Fokuskan alokasi iklan digital dan promosi B2C/B2B pada segmen <strong>{insights.topSegment.name}</strong> yang terbukti menjadi tulang punggung transaksi.
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="text-blue-400 font-bold text-lg mt-0.5">3.</span>
                    <div>
                      Lakukan audit harga modal dan kelayakan diskon segera terhadap produk <strong>{insights.worstSub.name}</strong>. Produk ini terindikasi sangat menguras margin keuntungan perusahaan saat ini (Margin tercatat: {formatUang(insights.worstSub.value)}).
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="text-blue-400 font-bold text-lg mt-0.5">4.</span>
                    <div>
                      Siapkan anggaran besar di bulan <strong>{insights.topMonth.name.split('-')[1]}</strong> tahun berikutnya untuk memaksimalkan euforia historis belanja tertinggi bulanan.
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.35s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default App;