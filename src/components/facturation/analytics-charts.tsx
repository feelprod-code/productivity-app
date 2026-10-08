"use client";

import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ActivityUniverse } from "@/types/facturation";
import { MONTHLY_PERFORMANCE_2026 } from "@/lib/facturation-mock";

interface AnalyticsChartsProps {
  universe: ActivityUniverse;
}

const FEELPROD_BREAKDOWN = [
  { name: "Tournage & TJM", value: 14500, color: "#E2B357" },
  { name: "Post-prod & Montage", value: 16800, color: "#6366F1" },
  { name: "Drone S3", value: 4100, color: "#0EA5E9" },
  { name: "Matériel & Dépl.", value: 1870, color: "#94A3B8" },
];

const KINE_BREAKDOWN = [
  { name: "Thérapie Manuelle (HN)", value: 24200, color: "#10B981" },
  { name: "Ostéopathie Tissulaire (HN)", value: 6800, color: "#14B8A6" },
  { name: "Actes Conv. (AMK/AMC)", value: 4800, color: "#3B82F6" },
];

const CONSOLIDATED_BREAKDOWN = [
  { name: "FeelProd (Audiovisuel)", value: 37270, color: "#E2B357" },
  { name: "Cabinet (Soins & HN)", value: 35800, color: "#10B981" },
];

export function AnalyticsCharts({ universe }: AnalyticsChartsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-72 bg-slate-100 dark:bg-slate-800/40 rounded-2xl animate-pulse flex items-center justify-center text-slate-400 text-sm">
        Chargement des graphiques analytiques...
      </div>
    );
  }

  const formatEuro = (value: number) => `${value.toLocaleString("fr-FR")} €`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Bar Chart : Évolution Mensuelle 2026 */}
      <div className="lg:col-span-2 bg-white dark:bg-[#151D24] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              {universe === "feelprod" && "Chiffre d'Affaires Mensuel FeelProd (HT)"}
              {universe === "kine" && "Recettes Mensuelles Cabinet Kiné / Soins"}
              {universe === "consolidated" && "Comparatif Mensuel : FeelProd vs Cabinet (2026)"}
            </h3>
            <p className="text-xs text-slate-400">
              Historique Janvier - Septembre 2026
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg">
            Année 2026
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={MONTHLY_PERFORMANCE_2026}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => val.slice(0, 4)}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `${val / 1000}k€`} />
              <Tooltip
                formatter={(value: any) => [formatEuro(Number(value)), ""]}
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.92)",
                  borderColor: "#334155",
                  borderRadius: "12px",
                  color: "#fff",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />

              {universe === "feelprod" && (
                <Bar
                  name="FeelProd HT (€)"
                  dataKey="feelprodHT"
                  fill="#E2B357"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={false}
                />
              )}

              {universe === "kine" && (
                <Bar
                  name="Cabinet Kiné / HN (€)"
                  dataKey="kineTotal"
                  fill="#10B981"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={false}
                />
              )}

              {universe === "consolidated" && (
                <>
                  <Bar
                    name="FeelProd HT"
                    dataKey="feelprodHT"
                    fill="#E2B357"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    name="Cabinet Kiné"
                    dataKey="kineTotal"
                    fill="#10B981"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie Chart : Répartition par Catégorie */}
      <div className="bg-white dark:bg-[#151D24] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white text-base">
            {universe === "feelprod" && "Ventilation des Prestations"}
            {universe === "kine" && "Typologie des Actes Médicaux"}
            {universe === "consolidated" && "Équilibre Bi-Activité (2026)"}
          </h3>
          <p className="text-xs text-slate-400 mb-2">
            Répartition globale des revenus
          </p>
        </div>

        <div className="h-[195px] w-full flex items-center justify-center">
          <PieChart width={240} height={190}>
            <Pie
              data={
                universe === "feelprod"
                  ? FEELPROD_BREAKDOWN
                  : universe === "kine"
                  ? KINE_BREAKDOWN
                  : CONSOLIDATED_BREAKDOWN
              }
              cx={120}
              cy={95}
              innerRadius={46}
              outerRadius={74}
              paddingAngle={4}
              dataKey="value"
              isAnimationActive={false}
            >
                {(universe === "feelprod"
                  ? FEELPROD_BREAKDOWN
                  : universe === "kine"
                  ? KINE_BREAKDOWN
                  : CONSOLIDATED_BREAKDOWN
                ).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any) => [formatEuro(Number(value)), "Revenu"]}
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.95)",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                  color: "#fff",
                  fontSize: "12px",
                }}
              />
            </PieChart>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {(universe === "feelprod"
            ? FEELPROD_BREAKDOWN
            : universe === "kine"
            ? KINE_BREAKDOWN
            : CONSOLIDATED_BREAKDOWN
          ).map((item) => (
            <div key={item.name} className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <div className="flex items-center space-x-2">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate max-w-[140px]">{item.name}</span>
              </div>
              <span className="font-semibold">{formatEuro(item.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
