"use client";

import React, { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface MonthlyData {
    month: string;
    total: number;
}

interface FinOpsChartProps {
    data: MonthlyData[];
}

export function FinOpsChart({ data }: FinOpsChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card className="bg-white border-[#1E2A33]/10 shadow-sm w-full h-[400px] flex items-center justify-center">
                <p className="text-[#1E2A33]/50 font-roboto">Aucune facture n'a encore été analysée.</p>
            </Card>
        );
    }

    return (
        <Card className="bg-white border-[#1E2A33]/10 shadow-sm w-full mb-12">
            <CardHeader className="border-b border-[#1E2A33]/5 pb-4 bg-[#FDFBEF]/50">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-xl font-roboto font-medium text-[#1E2A33] flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-[#AE7D5C]" />
                            Évolution des Dépenses
                        </CardTitle>
                        <CardDescription>Vue macro au mois le mois basée sur les factures consolidées.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#AE7D5C" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#AE7D5C" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis
                                dataKey="month"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#71717A', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#71717A', fontSize: 12 }}
                                tickFormatter={(value) => `${value}€`}
                            />
                            <Tooltip
                                cursor={{ stroke: '#AE7D5C', strokeWidth: 1, strokeDasharray: '3 3' }}
                                contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: any) => [`${Number(value).toFixed(2)} €`, "Total Ce Mois"]}
                            />
                            <Area
                                type="monotone"
                                dataKey="total"
                                stroke="#AE7D5C"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorTotal)"
                                activeDot={{ r: 6, fill: "#1E2A33", stroke: "#FFF", strokeWidth: 2 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
