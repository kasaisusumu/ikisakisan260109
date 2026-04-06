// components/RadarChart.tsx
"use client";

import React from 'react';

interface RadarChartProps {
    ratings: any;
    color: string;
    isLoading: boolean;
    onLabelClick?: (key: string, label: string) => void;
}

export default function RadarChart({ ratings, color, isLoading, onLabelClick }: RadarChartProps) {
    if (isLoading) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2 animate-pulse">
                <div className="w-5 h-5 border-2 border-orange-300 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] font-bold">詳細データを取得中...</span>
            </div>
        );
    }

    if (!ratings || Object.values(ratings).every(v => v === 0)) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-1">
                <span className="text-xs font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">評価データなし</span>
            </div>
        );
    }

    const metrics = [
        { key: 'room', label: '部屋' },
        { key: 'bath', label: '風呂' },
        { key: 'meal', label: '食事' },
        { key: 'service', label: '接客' },
        { key: 'location', label: '立地' },
        { key: 'equipment', label: '設備' }
    ];

    const size = 160;
    const center = size / 2;
    const radius = (size / 2) - 20;

    const getPoint = (value: number, index: number, total: number) => {
        const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
        const r = (value / 5) * radius;
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    };

    const polygonPoints = metrics.map((m, i) => getPoint(ratings[m.key] || 0, i, metrics.length)).join(' ');

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible animate-in zoom-in-95 duration-500">
            {[1, 2, 3, 4, 5].map((level) => (
                <polygon
                    key={level}
                    points={metrics.map((_, i) => getPoint(level, i, metrics.length)).join(' ')}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="1"
                />
            ))}
            {metrics.map((_, i) => (
                <line key={`axis-${i}`} x1={center} y1={center} x2={center + radius * Math.cos((Math.PI * 2 * i) / metrics.length - Math.PI / 2)} y2={center + radius * Math.sin((Math.PI * 2 * i) / metrics.length - Math.PI / 2)} stroke="#e5e7eb" strokeWidth="1" />
            ))}
            <polygon points={polygonPoints} fill={color} fillOpacity="0.4" stroke={color} strokeWidth="2" strokeLinejoin="round" />
            
            {metrics.map((m, i) => {
                const angle = (Math.PI * 2 * i) / metrics.length - Math.PI / 2;
                const lx = center + (radius + 20) * Math.cos(angle);
                const ly = center + (radius + 15) * Math.sin(angle);
                const val = ratings[m.key] ? ratings[m.key].toFixed(1) : '-';
                return (
                    <g 
                        key={`label-${i}`}
                        onClick={(e) => {
                            if (onLabelClick) {
                                e.stopPropagation();
                                e.preventDefault();
                                onLabelClick(m.key, m.label);
                            }
                        }}
                        className={onLabelClick ? "cursor-pointer hover:opacity-60 transition-opacity" : ""}
                        // style={onLabelClick ? { pointerEvents: 'bounding-box' } : {}}
                    >
                        {/* クリック判定領域を広げるための透明な四角形 */}
                        <rect x={lx - 20} y={ly - 15} width={40} height={30} fill="transparent" />
                        
                        <text x={lx} y={ly - 6} fontSize="9" fontWeight="bold" fill="#6b7280" textAnchor="middle" dominantBaseline="middle">
                            {m.label}
                        </text>
                        <text x={lx} y={ly + 6} fontSize="10" fontWeight="black" fill={color} textAnchor="middle" dominantBaseline="middle">
                            {val}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}