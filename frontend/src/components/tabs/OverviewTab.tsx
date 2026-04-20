"use client";

// ──────────────────────────────────────────────
// LogSense AI — Genel Bakış Sekmesi
// ──────────────────────────────────────────────

import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, LineChart, Line, ReferenceLine,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { ChartPoint } from "@/types";

interface OverviewTabProps {
  stats: { total: number; info: number; warn: number; error: number; anomalies: number };
  chartData: ChartPoint[];
  severityData: Array<{ name: string; value: number; color: string }>;
  httpData: Array<{ name: string; value: number }>;
  riskData: Array<{ name: string; value: number }>;
  topErrorsData: Array<{ name: string; value: number }>;
}

export default function OverviewTab({
  stats,
  chartData,
  severityData,
  httpData,
  riskData,
  topErrorsData,
}: OverviewTabProps) {
  return (
    <div className="tab-pane fade-in">
      {/* İstatistik Kutuları */}
      <div className="stats-grid">
        <div className="stat-box blue">
          <div className="stat-icon-wrap">📊</div>
          <div className="stat-data">
            <span className="stat-num">{stats.total}</span>
            <span className="stat-lbl">Toplam Log</span>
          </div>
        </div>
        <div className="stat-box cyan">
          <div className="stat-icon-wrap">ℹ️</div>
          <div className="stat-data">
            <span className="stat-num">{stats.info}</span>
            <span className="stat-lbl">Bilgi Akışı</span>
          </div>
        </div>
        <div className="stat-box yellow">
          <div className="stat-icon-wrap">⚠️</div>
          <div className="stat-data">
            <span className="stat-num">{stats.warn}</span>
            <span className="stat-lbl">Uyarılar</span>
          </div>
        </div>
        <div className="stat-box red">
          <div className="stat-icon-wrap">🔴</div>
          <div className="stat-data">
            <span className="stat-num">{stats.error}</span>
            <span className="stat-lbl">Hatalar</span>
          </div>
        </div>
      </div>

      {/* KATMAN 1: Trafik & İstihbarat */}
      <div className="charts-row">
        <div className="chart-card-v2">
          <div className="chart-title-v2">
            📈 Gerçek Zamanlı Trafik Hacmi <span className="badge-live-sm">CANLI</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" stroke="#475569" fontSize={10} />
              <YAxis stroke="#475569" fontSize={10} />
              <Tooltip
                contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-hover)", borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: "var(--text-primary)" }}
                labelStyle={{ color: "var(--text-secondary)" }}
              />
              <Area type="monotone" dataKey="info" stroke="#3b82f6" fill="url(#gI)" strokeWidth={2} name="Bilgi" />
              <Area type="monotone" dataKey="warn" stroke="#f59e0b" fill="transparent" strokeWidth={2} name="Uyarı" />
              <Area type="monotone" dataKey="error" stroke="#ef4444" fill="transparent" strokeWidth={2} name="Hata" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card-v2">
          <div className="chart-title-v2">
            🧠 AI Anomali Zekası <span className="badge-trend-sm">GPT-4o</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" stroke="#475569" fontSize={10} />
              <YAxis stroke="#475569" fontSize={10} domain={[0, 1]} />
              <Tooltip
                contentStyle={{ background: "var(--bg-card)", border: "1px solid #c084fc", borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: "var(--text-primary)" }}
                labelStyle={{ color: "var(--text-secondary)" }}
                formatter={(v: number | undefined) => [(Number(v ?? 0) * 100).toFixed(0) + "%", "Olasılık"]}
              />
              <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="5 5" label={{ value: "Alarm Eşiği", fill: "#ef4444", fontSize: 10, position: "right" }} />
              <Line type="monotone" dataKey="maxScore" stroke="#c084fc" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KATMAN 2: Özel Tanılamalar */}
      <div className="charts-row triple">
        <div className="chart-card-v2">
          <div className="chart-title-v2">❤️ Sistem Sağlık Oranı</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={severityData} innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value" stroke="none">
                {severityData.map((entry, index) => (
                  <Cell key={`c-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-hover)", borderRadius: 8, fontSize: 11 }} itemStyle={{ color: "var(--text-primary)" }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card-v2">
          <div className="chart-title-v2">🌐 HTTP Durum Kodları</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={httpData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" stroke="#475569" fontSize={10} />
              <YAxis stroke="#475569" fontSize={10} />
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-hover)", borderRadius: 8, fontSize: 11 }} itemStyle={{ color: "var(--text-primary)" }} />
              <Bar dataKey="value" fill="#22d3ee" barSize={24} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card-v2">
          <div className="chart-title-v2">🛡️ IP Güvenlik Risk Profilleme</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={riskData} dataKey="value" nameKey="name" outerRadius={70} stroke="none">
                {riskData.map((entry, index) => (
                  <Cell
                    key={`r-${index}`}
                    fill={entry.name === "High" ? "#ef4444" : entry.name === "Medium" ? "#f59e0b" : "#22c55e"}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-hover)", borderRadius: 8, fontSize: 11 }} itemStyle={{ color: "var(--text-primary)" }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KATMAN 3: Operasyonel Olay Desenleri */}
      <div className="charts-row single">
        <div className="chart-card-v2">
          <div className="chart-title-v2">🚨 En Sık Karşılaşılan Hata Desenleri (Kök Neden Analizi)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topErrorsData} layout="vertical" margin={{ left: 30, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={true} vertical={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} width={180} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                contentStyle={{ background: "var(--bg-card)", border: "1px solid #ef4444", borderRadius: 8, fontSize: 11 }}
                itemStyle={{ color: "var(--text-primary)" }}
                labelStyle={{ color: "var(--text-secondary)", fontSize: 9 }}
              />
              <Bar dataKey="value" fill="#ef4444" barSize={14} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
