"use client";

import React from "react";
import { Film, Stethoscope, BarChart3, Sparkles } from "lucide-react";
import { ActivityUniverse } from "@/types/facturation";
import { cn } from "@/lib/utils";

interface ActivitySwitcherProps {
  currentUniverse: ActivityUniverse;
  onUniverseChange: (universe: ActivityUniverse) => void;
  stats: {
    feelprodCount: number;
    kineCount: number;
    feelprodPending: number;
    kinePending: number;
  };
}

export function ActivitySwitcher({
  currentUniverse,
  onUniverseChange,
  stats,
}: ActivitySwitcherProps) {
  return (
    <div className="w-full bg-white/80 dark:bg-[#151D24]/90 backdrop-blur-md rounded-2xl p-2 border border-[#1E2A33]/10 dark:border-white/10 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* FeelProd Button */}
        <button
          onClick={() => onUniverseChange("feelprod")}
          className={cn(
            "relative group flex items-center justify-between p-3 rounded-xl transition-all duration-300 text-left cursor-pointer",
            currentUniverse === "feelprod"
              ? "bg-[#0F172A] text-white shadow-md ring-2 ring-[#E2B357]/60"
              : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          )}
        >
          <div className="flex items-center space-x-3">
            <div
              className={cn(
                "p-2.5 rounded-lg flex items-center justify-center transition-colors",
                currentUniverse === "feelprod"
                  ? "bg-[#E2B357] text-[#0F172A]"
                  : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
              )}
            >
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-sm tracking-wide">FeelProd</span>
                {currentUniverse === "feelprod" && (
                  <span className="inline-block w-2 h-2 rounded-full bg-[#E2B357] animate-pulse" />
                )}
              </div>
              <p className="text-[11px] opacity-75 leading-tight">
                Audiovisuel • TVA 20% • TJM & Forfaits
              </p>
            </div>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                currentUniverse === "feelprod"
                  ? "bg-white/15 text-[#E2B357]"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              )}
            >
              {stats.feelprodCount} dossiers
            </span>
            {stats.feelprodPending > 0 && (
              <p className="text-[10px] text-amber-400 font-medium mt-0.5">
                {stats.feelprodPending} en attente
              </p>
            )}
          </div>
        </button>

        {/* Cabinet Kiné / Thérapie Button */}
        <button
          onClick={() => onUniverseChange("kine")}
          className={cn(
            "relative group flex items-center justify-between p-3 rounded-xl transition-all duration-300 text-left cursor-pointer",
            currentUniverse === "kine"
              ? "bg-[#064E3B] text-white shadow-md ring-2 ring-[#34D399]/60"
              : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          )}
        >
          <div className="flex items-center space-x-3">
            <div
              className={cn(
                "p-2.5 rounded-lg flex items-center justify-center transition-colors",
                currentUniverse === "kine"
                  ? "bg-[#34D399] text-[#064E3B]"
                  : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
              )}
            >
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-sm tracking-wide">Cabinet Kiné / Thérapie</span>
                {currentUniverse === "kine" && (
                  <span className="inline-block w-2 h-2 rounded-full bg-[#34D399] animate-pulse" />
                )}
              </div>
              <p className="text-[11px] opacity-75 leading-tight">
                Soins manuels • Exonéré TVA • HN & Conv
              </p>
            </div>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                currentUniverse === "kine"
                  ? "bg-white/15 text-[#34D399]"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              )}
            >
              {stats.kineCount} séances
            </span>
            {stats.kinePending > 0 && (
              <p className="text-[10px] text-emerald-300 font-medium mt-0.5">
                {stats.kinePending} en attente
              </p>
            )}
          </div>
        </button>

        {/* Consolidated Button */}
        <button
          onClick={() => onUniverseChange("consolidated")}
          className={cn(
            "relative group flex items-center justify-between p-3 rounded-xl transition-all duration-300 text-left cursor-pointer",
            currentUniverse === "consolidated"
              ? "bg-[#1E2A33] text-white shadow-md ring-2 ring-[#AE7D5C]/60"
              : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          )}
        >
          <div className="flex items-center space-x-3">
            <div
              className={cn(
                "p-2.5 rounded-lg flex items-center justify-center transition-colors",
                currentUniverse === "consolidated"
                  ? "bg-[#AE7D5C] text-white"
                  : "bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
              )}
            >
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-sm tracking-wide">Vue Consolidée</span>
                {currentUniverse === "consolidated" && (
                  <Sparkles className="w-3.5 h-3.5 text-[#AE7D5C]" />
                )}
              </div>
              <p className="text-[11px] opacity-75 leading-tight">
                Pilotage bi-activité • CA & Encours cumulés
              </p>
            </div>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                currentUniverse === "consolidated"
                  ? "bg-white/15 text-[#AE7D5C]"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              )}
            >
              Global
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
