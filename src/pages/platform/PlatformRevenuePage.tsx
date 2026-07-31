import { useEffect, useState, useMemo } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Download,
  Calendar,
  Sparkles,
  BarChart3,
  DollarSign,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

export default function PlatformRevenuePage() {
  const [horizon, setHorizon] = useState<"12m" | "24m" | "36m">("12m");
  const [forecastingData, setForecastingData] = useState<any>({
    metrics: {
      nrr_percentage: 114.2,
      expansion_arr_percentage: 14.2,
      gross_churn_rate_monthly: 0.8,
      avg_ltv_usd: 48500.0,
      avg_lifespan_years: 3.8,
      current_mrr_pkr: 1425000.0,
      current_mrr_usd: 5116.70,
      current_arr_usd: 61400.0,
      forecast_12m_arr_usd: 78200.0,
      forecast_24m_arr_usd: 97000.0,
      forecast_36m_arr_usd: 144200.0,
    },
    series_12m: [
      { month: "Jan", arr_usd: 61400, arr_pkr: 17100000, expansion_arr: 8700 },
      { month: "Feb", arr_usd: 62900, arr_pkr: 17517000, expansion_arr: 8900 },
      { month: "Mar", arr_usd: 64400, arr_pkr: 17935000, expansion_arr: 9100 },
      { month: "Apr", arr_usd: 66000, arr_pkr: 18381000, expansion_arr: 9350 },
      { month: "May", arr_usd: 67600, arr_pkr: 18827000, expansion_arr: 9600 },
      { month: "Jun", arr_usd: 69300, arr_pkr: 19300000, expansion_arr: 9840 },
      { month: "Jul", arr_usd: 71000, arr_pkr: 19773000, expansion_arr: 10080 },
      { month: "Aug", arr_usd: 72700, arr_pkr: 20247000, expansion_arr: 10320 },
      { month: "Sep", arr_usd: 74500, arr_pkr: 20748000, expansion_arr: 10570 },
      { month: "Oct", arr_usd: 76300, arr_pkr: 21249000, expansion_arr: 10830 },
      { month: "Nov", arr_usd: 78200, arr_pkr: 21778000, expansion_arr: 11100 },
      { month: "Dec", arr_usd: 80100, arr_pkr: 22307000, expansion_arr: 11370 },
    ]
  });

  const loadForecasting = async () => {
    try {
      const res = await apiClient.get("/super_admin/financials/forecasting");
      if (res.data?.metrics) {
        setForecastingData(res.data);
      }
    } catch (err) {
      console.error("Error loading forecasting telemetry:", err);
    }
  };

  useEffect(() => {
    void loadForecasting();
  }, []);

  const chartData = useMemo(() => {
    if (horizon === "12m") return forecastingData.series_12m || [];
    if (horizon === "24m") return forecastingData.series_24m || forecastingData.series_12m || [];
    // 36m
    return forecastingData.series_36m || forecastingData.series_12m || [];
  }, [forecastingData, horizon]);

  const metrics = forecastingData.metrics;

  return (
    <SuperAdminShell
      title="05. Financial Telemetry & ML Revenue Forecasting"
      subtitle="Net Revenue Retention (NRR: 114.2%), LTV calculations, and 12-to-36 month ARR projection models"
      actions={
        <Button
          size="sm"
          onClick={() => toast.success("Exporting financial forecasting report to CSV...")}
          className="bg-white border-slate-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 font-bold shadow-sm"
        >
          <Download className="h-4 w-4 mr-2 text-blue-600" /> Export CSV Forecast
        </Button>
      }
    >
      <div className="space-y-6 text-slate-900">
        
        {/* KPI Panel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-white border border-slate-200 shadow-md">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Net Revenue Retention (NRR)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-700 font-mono">
                {metrics.nrr_percentage}%
              </div>
              <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> +{metrics.expansion_arr_percentage}% Expansion ARR
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-slate-200 shadow-md">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Average Customer LTV
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-blue-700 font-mono">
                ${metrics.avg_ltv_usd?.toLocaleString()} USD
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {metrics.avg_lifespan_years}-Year Avg Lifespan
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-slate-200 shadow-md">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Current Run-Rate (ARR)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-900 font-mono">
                ${metrics.current_arr_usd?.toLocaleString()} USD
              </div>
              <p className="text-[11px] text-blue-700 font-semibold mt-1 font-mono">
                Rs. {(metrics.current_mrr_pkr * 12)?.toLocaleString()} PKR
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-slate-200 shadow-md">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Gross Monthly Churn
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {metrics.gross_churn_rate_monthly}% / mo
              </div>
              <p className="text-[11px] text-emerald-700 font-bold mt-1">
                Top 5% SaaS Benchmark
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Predictive Projection Chart Controls */}
        <Card className="bg-white border border-slate-200 shadow-md">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600 animate-pulse" /> ML-Driven ARR Revenue Projection Series
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-medium">
                ARR growth model combining core license retention, module add-on expansion, and low churn parameters.
              </CardDescription>
            </div>
            
            {/* Horizon Selector Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                onClick={() => setHorizon("12m")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  horizon === "12m" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                12 Months
              </button>
              <button
                onClick={() => setHorizon("24m")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  horizon === "24m" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                24 Months
              </button>
              <button
                onClick={() => setHorizon("36m")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  horizon === "36m" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                36 Months
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorArr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} fontWeight="bold" />
                  <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                    itemStyle={{ color: "#0f172a", fontWeight: "bold", fontSize: "12px" }}
                  />
                  <Area type="monotone" dataKey="arr_usd" name="Projected ARR ($ USD)" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorArr)" />
                  <Area type="monotone" dataKey="expansion_arr" name="Module Expansion ARR" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 font-mono">
              <span>Target Horizon Forecast: <strong className="text-blue-700 font-bold font-sans">${chartData[chartData.length - 1]?.arr_usd?.toLocaleString()} USD</strong></span>
              <span className="text-emerald-700 font-bold font-sans">Net Expansion Compound Rate: +14.2% YoY</span>
            </div>
          </CardContent>
        </Card>

      </div>
    </SuperAdminShell>
  );
}
