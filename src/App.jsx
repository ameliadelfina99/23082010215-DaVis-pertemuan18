import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import superstoreData from './superstore_data.json';

// Pindahkan fungsi pembersih angka ke LUAR komponen agar tidak dibuat ulang terus
const parseNum = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(val.toString().replace(/,/g, '.').replace(/[^0-9.-]/g, '')) || 0;
};

function App() {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
      .then(response => response.json())
      .then(usaJson => {
        echarts.registerMap('USA', usaJson);
        setIsMapLoaded(true);
      })
      .catch(err => console.error("Gagal memuat file peta:", err));
  }, []);

  // ========================================================================
  // 🔥 TURBO MODE: Menggunakan useMemo agar dihitung 1x saja oleh Browser!
  // ========================================================================

  const kpi = useMemo(() => {
    let sales = 0, profit = 0, qty = 0;
    superstoreData.forEach(row => {
      sales += parseNum(row.Sales);
      profit += parseNum(row.Profit);
      qty += parseNum(row.Quantity);
    });
    return {
      totalSales: sales,
      totalProfit: profit,
      totalQuantity: qty,
      profitMargin: sales > 0 ? (profit / sales) * 100 : 0
    };
  }, []);

  const salesTrendOption = useMemo(() => {
    const agg = {};
    superstoreData.forEach(row => {
      const tahun = row.Tahun || (row['Order Date'] ? row['Order Date'].substring(6,10) : '2023');
      const bulan = row.Bulan ? String(row.Bulan).padStart(2, '0') : (row['Order Date'] ? row['Order Date'].substring(3,5) : '01');
      const date = `${tahun}-${bulan}`;
      agg[date] = (agg[date] || 0) + parseNum(row.Sales);
    });
    const sortedKeys = Object.keys(agg).sort();
    return {
      title: { text: 'Monthly Sales Trend', left: 'center' }, tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: sortedKeys, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: { type: 'value', axisLabel: { formatter: '${value}' } },
      series: [{ data: sortedKeys.map(k => Math.round(agg[k])), type: 'line', smooth: true, itemStyle: { color: '#2563eb' }, areaStyle: { opacity: 0.1, color: '#2563eb' } }]
    };
  }, []);

  const mapChartOption = useMemo(() => {
    const stateData = {};
    superstoreData.forEach(row => {
      const state = row['State/Province'] || row.State;
      if (state) stateData[state] = (stateData[state] || 0) + parseNum(row.Sales);
    });
    const data = Object.keys(stateData).map(state => ({ name: state, value: Math.round(stateData[state]) }));
    return {
      title: { text: 'Sales Distribution by State', left: 'center' }, tooltip: { trigger: 'item', formatter: '{b}<br/>Sales: ${c}' },
      visualMap: { left: 'right', min: 0, max: 100000, inRange: { color: ['#e0f2fe', '#3b82f6', '#1e3a8a'] }, text: ['High', 'Low'], calculable: true },
      series: [{ type: 'map', map: 'USA', roam: true, data }]
    };
  }, []);

  const segmentOption = useMemo(() => {
    const agg = {};
    superstoreData.forEach(row => { if(row.Segment) agg[row.Segment] = (agg[row.Segment] || 0) + parseNum(row.Sales); });
    const data = Object.keys(agg).map(k => ({ name: k, value: Math.round(agg[k]) }));
    return {
      title: { text: 'Sales by Segment', left: 'center' }, tooltip: { trigger: 'item', formatter: '{b}: ${c} ({d}%)' }, legend: { bottom: 0 },
      series: [{ type: 'pie', radius: '60%', data, itemStyle: { borderColor: '#fff', borderWidth: 2 } }]
    };
  }, []);

  const categoryOption = useMemo(() => {
    const agg = {};
    superstoreData.forEach(row => { if(row.Category) agg[row.Category] = (agg[row.Category] || 0) + parseNum(row.Sales); });
    const data = Object.keys(agg).map(k => ({ name: k, value: Math.round(agg[k]) }));
    return {
      title: { text: 'Sales by Category', left: 'center' }, tooltip: { trigger: 'item', formatter: '{b}: ${c} ({d}%)' }, legend: { bottom: 0 },
      series: [{ type: 'pie', radius: ['40%', '65%'], data, itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 } }]
    };
  }, []);

  const subCategoryOption = useMemo(() => {
    const agg = {};
    superstoreData.forEach(row => { const sub = row['Sub-Category']; if(sub) agg[sub] = (agg[sub] || 0) + parseNum(row.Sales); });
    const sorted = Object.entries(agg).sort((a,b) => a[1] - b[1]);
    return {
      title: { text: 'Sales by Sub-Category', left: 'center' }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true }, xAxis: { type: 'value' }, yAxis: { type: 'category', data: sorted.map(d => d[0]), axisLabel: { fontSize: 10 } },
      series: [{ type: 'bar', data: sorted.map(d => Math.round(d[1])), itemStyle: { color: '#0ea5e9' } }]
    };
  }, []);

  const profitOption = useMemo(() => {
    const agg = {};
    superstoreData.forEach(row => { const sub = row['Sub-Category']; if(sub) agg[sub] = (agg[sub] || 0) + parseNum(row.Profit); });
    const sorted = Object.entries(agg).sort((a,b) => b[1] - a[1]);
    return {
      title: { text: 'Profit by Sub-Category', left: 'center' }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true }, xAxis: { type: 'category', data: sorted.map(d => d[0]), axisLabel: { interval: 0, rotate: 45, fontSize: 10 } }, yAxis: { type: 'value' },
      series: [{ type: 'bar', data: sorted.map(d => ({ value: Math.round(d[1]), itemStyle: { color: d[1] >= 0 ? '#10b981' : '#ef4444' } })) }]
    };
  }, []);

  const heatmapOption = useMemo(() => {
    const regions = ['Central', 'East', 'South', 'West'], categories = ['Furniture', 'Office Supplies', 'Technology'], agg = {};
    superstoreData.forEach(row => { if(row.Region && row.Category) { const key = `${row.Region}-${row.Category}`; agg[key] = (agg[key] || 0) + parseNum(row.Sales); }});
    const data = [];
    regions.forEach((reg, i) => { categories.forEach((cat, j) => { data.push([i, j, Math.round(agg[`${reg}-${cat}`] || 0)]); }); });
    return {
      title: { text: 'Sales Heatmap (Region vs Category)', left: 'center' }, tooltip: { position: 'top' }, grid: { height: '60%', top: '15%' },
      xAxis: { type: 'category', data: regions, splitArea: { show: true } }, yAxis: { type: 'category', data: categories, splitArea: { show: true } },
      visualMap: { min: 0, max: 250000, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%', inRange: { color: ['#f8fafc', '#93c5fd', '#1e3a8a'] } },
      series: [{ name: 'Sales', type: 'heatmap', data: data, label: { show: true }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } } }]
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      
      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800">Superstore Analytics</h1>
          <p className="text-slate-500 mt-1">Laporan Visualisasi Data - Pertemuan 18</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-800 text-lg">Amelia Delfina Putri</p>
          <p className="text-blue-600 font-semibold bg-blue-50 px-3 py-1 rounded-lg inline-block mt-1">NPM: 23082010215</p> 
        </div>
      </div>

      {/* MENU NAVIGASI (TABS) */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-wrap gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
        {[
          { id: 'overview', label: '📊 Ringkasan Utama' },
          { id: 'demografi', label: '🥧 Segmen & Kategori' },
          { id: 'produk', label: '📈 Kinerja Produk' },
          { id: 'kesimpulan', label: '📝 Kesimpulan' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 ${
              activeTab === tab.id 
              ? 'bg-blue-600 text-white shadow-md transform scale-[1.02]' 
              : 'bg-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* KONTEN HALAMAN */}
      <div className="max-w-7xl mx-auto">
        
        {/* HALAMAN 1: OVERVIEW */}
        <div className={activeTab === 'overview' ? 'block animate-fade-in' : 'hidden'}>
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500">
                <p className="text-sm text-slate-500 font-semibold uppercase">Total Sales</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-1">${kpi.totalSales.toLocaleString('id-ID', {maximumFractionDigits:0})}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500">
                <p className="text-sm text-slate-500 font-semibold uppercase">Total Profit</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-1">${kpi.totalProfit.toLocaleString('id-ID', {maximumFractionDigits:0})}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-purple-500">
                <p className="text-sm text-slate-500 font-semibold uppercase">Total Quantity</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-1">{kpi.totalQuantity.toLocaleString('id-ID')} Pcs</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-orange-500">
                <p className="text-sm text-slate-500 font-semibold uppercase">Profit Margin</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-1">{kpi.profitMargin.toFixed(2)}%</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100"><ReactECharts option={salesTrendOption} style={{ height: '300px' }} /></div>
                <div className="p-5 bg-slate-50 flex-1">
                  <h4 className="font-bold text-slate-700 mb-2">📝 Analisis Tren</h4>
                  <p className="text-sm text-slate-600 text-justify">Tren penjualan mengalami fluktuasi, namun memuncak pada akhir tahun (Q4). Ini mengindikasikan tingginya permintaan saat musim liburan.</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100">
                  {!isMapLoaded ? <div className="h-[300px] flex items-center justify-center">Loading Map...</div> : <ReactECharts option={mapChartOption} style={{ height: '300px' }} />}
                </div>
                <div className="p-5 bg-slate-50 flex-1">
                  <h4 className="font-bold text-slate-700 mb-2">📝 Wilayah Potensial</h4>
                  <p className="text-sm text-slate-600 text-justify">California dan New York mendominasi penjualan terbanyak. Wilayah pesisir terbukti menjadi pasar paling krusial bagi perusahaan.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HALAMAN 2: DEMOGRAFI */}
        <div className={activeTab === 'demografi' ? 'block animate-fade-in' : 'hidden'}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100"><ReactECharts option={segmentOption} style={{ height: '350px' }} /></div>
              <div className="p-5 bg-slate-50 flex-1">
                <h4 className="font-bold text-slate-700 mb-2">📝 Profil Segmen</h4>
                <p className="text-sm text-slate-600 text-justify">Konsumen ritel biasa (Consumer) adalah tulang punggung pendapatan, memakan porsi lebih dari separuh total transaksi keseluruhan.</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100"><ReactECharts option={categoryOption} style={{ height: '350px' }} /></div>
              <div className="p-5 bg-slate-50 flex-1">
                <h4 className="font-bold text-slate-700 mb-2">📝 Kategori Favorit</h4>
                <p className="text-sm text-slate-600 text-justify">Penjualan tersebar sangat seimbang di antara Technology, Furniture, dan Office Supplies. Tidak ada dominasi kategori yang terlalu timpang.</p>
              </div>
            </div>
          </div>
        </div>

        {/* HALAMAN 3: PRODUK */}
        <div className={activeTab === 'produk' ? 'block animate-fade-in' : 'hidden'}>
          <div className="space-y-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100"><ReactECharts option={subCategoryOption} style={{ height: '400px' }} /></div>
              <div className="p-5 bg-slate-50">
                <h4 className="font-bold text-slate-700 mb-2">📝 Performa Sub-Kategori (Sales)</h4>
                <p className="text-sm text-slate-600 text-justify">Phones dan Chairs adalah mesin pencetak uang utama. Namun penjualan Fasteners sangat rendah dan perlu dievaluasi stoknya.</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100"><ReactECharts option={profitOption} style={{ height: '400px' }} /></div>
              <div className="p-5 bg-slate-50">
                <h4 className="font-bold text-slate-700 mb-2">📝 Kesehatan Profit</h4>
                <p className="text-sm text-slate-600 text-justify">Banyak barang terjual bukan berarti selalu untung. Tables, Bookcases, dan Supplies tercatat menguras kas perusahaan karena nilai marginnya yang minus (rugi).</p>
              </div>
            </div>
          </div>
        </div>

        {/* HALAMAN 4: KESIMPULAN */}
        <div className={activeTab === 'kesimpulan' ? 'block animate-fade-in' : 'hidden'}>
          <div className="space-y-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100"><ReactECharts option={heatmapOption} style={{ height: '350px' }} /></div>
              <div className="p-5 bg-slate-50">
                <h4 className="font-bold text-slate-700 mb-2">📝 Cross-Tabulation (Region vs Category)</h4>
                <p className="text-sm text-slate-600 text-justify">Titik terang utama berada di Region East (Teknologi) dan West (Furniture). Region South sangat minim kontribusi dan menjadi PR untuk strategi marketing berikutnya.</p>
              </div>
            </div>

            <div className="bg-blue-900 text-white p-8 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-10 text-9xl">🎯</div>
              <h3 className="text-2xl font-bold mb-4">Executive Summary & Kesimpulan Akhir</h3>
              <ul className="list-disc list-inside space-y-3 text-blue-100 leading-relaxed text-justify relative z-10">
                <li><strong className="text-white">Fokus Musiman:</strong> Promosi harus dimaksimalkan pada kuartal keempat (Q4) karena terbukti merupakan momentum puncak daya beli pelanggan.</li>
                <li><strong className="text-white">Optimalisasi Wilayah:</strong> Perusahaan perlu mempertahankan ekspansi di wilayah Pantai Barat (California) dan Pantai Timur (New York), namun butuh strategi diskon khusus untuk mengangkat performa wilayah Selatan (South).</li>
                <li><strong className="text-white">Evaluasi Produk Rugi:</strong> Sub-kategori "Tables" dan "Bookcases" harus segera diaudit. Tingginya angka penjualan tidak diiringi dengan keuntungan (profit minus). Disarankan untuk mencari supplier baru yang lebih murah atau menaikkan harga jual dasar.</li>
                <li><strong className="text-white">Target Konsumen:</strong> Segmen "Consumer" dan kategori "Technology" (terutama Phones) merupakan tulang punggung utama (*Cash Cow*) perusahaan saat ini yang harus diprioritaskan stoknya.</li>
              </ul>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default App;