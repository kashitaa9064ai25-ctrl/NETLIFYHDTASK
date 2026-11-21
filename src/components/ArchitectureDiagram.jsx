import React, { useState, useMemo } from 'react';

export const DIAGRAM_TEMPLATES = {
    'Example Flow': 'User -> Website -> Server -> Database\nServer -> CPU',
};

export const DIAGRAM_THEMES = {
    blue: {
        label: 'Blue',
        swatch: 'bg-blue-500',
        boxBg: '#eff6ff',
        boxBorder: '#3b82f6',
        boxText: '#1e3a8a',
        arrow: '#60a5fa',
    },
    emerald: {
        label: 'Green',
        swatch: 'bg-emerald-500',
        boxBg: '#ecfdf5',
        boxBorder: '#10b981',
        boxText: '#064e3b',
        arrow: '#34d399',
    },
    purple: {
        label: 'Purple',
        swatch: 'bg-purple-500',
        boxBg: '#faf5ff',
        boxBorder: '#a855f7',
        boxText: '#581c87',
        arrow: '#c084fc',
    },
    amber: {
        label: 'Amber',
        swatch: 'bg-amber-500',
        boxBg: '#fffbeb',
        boxBorder: '#f59e0b',
        boxText: '#78350f',
        arrow: '#fbbf24',
    },
    slate: {
        label: 'Dark',
        swatch: 'bg-slate-700',
        boxBg: '#f8fafc',
        boxBorder: '#475569',
        boxText: '#0f172a',
        arrow: '#64748b',
    },
};

export default function ArchitectureDiagram({
    syntax = '',
    theme: propTheme,
    onThemeChange,
    showThemePicker = false,
}) {
    const [internalTheme, setInternalTheme] = useState('blue');
    const activeThemeKey = propTheme || internalTheme;
    const activeTheme = DIAGRAM_THEMES[activeThemeKey] || DIAGRAM_THEMES.blue;

    const handleSelectTheme = (key) => {
        setInternalTheme(key);
        if (onThemeChange) onThemeChange(key);
    };

    // Build deduplicated nodes & directed edges across all lines
    const { nodes, edges, svgWidth, svgHeight } = useMemo(() => {
        const lines = (syntax || '')
            .split('\n')
            .map((line) =>
                line
                    .split('->')
                    .map((item) => item.trim())
                    .filter(Boolean)
            )
            .filter((row) => row.length > 0);

        if (lines.length === 0) {
            return { nodes: [], edges: [], svgWidth: 0, svgHeight: 0 };
        }

        const nodeMap = new Map();
        const edgeList = [];
        const edgeSet = new Set();

        lines.forEach((chain) => {
            chain.forEach((label, idx) => {
                if (!nodeMap.has(label)) {
                    nodeMap.set(label, { label, col: idx });
                }
                if (idx > 0) {
                    const from = chain[idx - 1];
                    const to = label;
                    const edgeKey = `${from}=>${to}`;
                    if (!edgeSet.has(edgeKey)) {
                        edgeSet.add(edgeKey);
                        edgeList.push({ from, to });
                    }
                    // Ensure target column is at least parent's column + 1
                    const fromNode = nodeMap.get(from);
                    const toNode = nodeMap.get(to);
                    if (toNode.col <= fromNode.col) {
                        toNode.col = fromNode.col + 1;
                    }
                }
            });
        });

        // Group nodes by column and assign vertical row indices
        const colCounts = new Map();
        const boxWidth = 140;
        const boxHeight = 44;
        const gapX = 52;
        const gapY = 26;
        const padding = 20;

        const positionedNodes = [];
        let maxCol = 0;
        let maxRow = 0;

        nodeMap.forEach((node) => {
            const row = colCounts.get(node.col) || 0;
            colCounts.set(node.col, row + 1);

            maxCol = Math.max(maxCol, node.col);
            maxRow = Math.max(maxRow, row);

            positionedNodes.push({
                ...node,
                row,
                x: padding + node.col * (boxWidth + gapX),
                y: padding + row * (boxHeight + gapY),
                width: boxWidth,
                height: boxHeight,
            });
        });

        const positionedMap = new Map(positionedNodes.map((n) => [n.label, n]));

        const resolvedEdges = edgeList
            .map(({ from, to }) => {
                const source = positionedMap.get(from);
                const target = positionedMap.get(to);
                if (!source || !target) return null;

                // Connect right edge of source to left edge of target
                const x1 = source.x + source.width;
                const y1 = source.y + source.height / 2;
                const x2 = target.x - 3;
                const y2 = target.y + target.height / 2;

                return { from, to, x1, y1, x2, y2 };
            })
            .filter(Boolean);

        return {
            nodes: positionedNodes,
            edges: resolvedEdges,
            svgWidth: padding * 2 + (maxCol + 1) * boxWidth + maxCol * gapX,
            svgHeight: padding * 2 + (maxRow + 1) * boxHeight + maxRow * gapY,
        };
    }, [syntax]);

    if (nodes.length === 0) return null;

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            {showThemePicker && (
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-gray-100">
                    <span className="text-[11px] font-semibold text-gray-500">Color Theme:</span>
                    <div className="flex items-center gap-2">
                        {Object.entries(DIAGRAM_THEMES).map(([key, t]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => handleSelectTheme(key)}
                                title={t.label}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition ${activeThemeKey === key
                                        ? 'border-gray-800 bg-gray-100 font-semibold text-gray-800'
                                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <span className={`w-2.5 h-2.5 rounded-full ${t.swatch}`} />
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <svg
                    width="100%"
                    height={svgHeight}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="min-w-fit mx-auto block"
                >
                    <defs>
                        <marker
                            id={`arrowhead-${activeThemeKey}`}
                            markerWidth="8"
                            markerHeight="8"
                            refX="7"
                            refY="4"
                            orient="auto"
                        >
                            <path d="M0,1 L7,4 L0,7 Z" fill={activeTheme.arrow} />
                        </marker>
                    </defs>

                    {/* Connecting Arrows */}
                    {edges.map((edge, idx) => {
                        const midX = (edge.x1 + edge.x2) / 2;
                        const pathData =
                            edge.y1 === edge.y2
                                ? `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`
                                : `M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`;

                        return (
                            <path
                                key={idx}
                                d={pathData}
                                fill="none"
                                stroke={activeTheme.arrow}
                                strokeWidth="2"
                                markerEnd={`url(#arrowhead-${activeThemeKey})`}
                            />
                        );
                    })}

                    {/* Deduplicated Node Boxes */}
                    {nodes.map((node) => (
                        <g key={node.label}>
                            <rect
                                x={node.x}
                                y={node.y}
                                width={node.width}
                                height={node.height}
                                rx="8"
                                fill={activeTheme.boxBg}
                                stroke={activeTheme.boxBorder}
                                strokeWidth="1.75"
                            />
                            <text
                                x={node.x + node.width / 2}
                                y={node.y + node.height / 2 + 4}
                                textAnchor="middle"
                                fill={activeTheme.boxText}
                                fontSize="12"
                                fontWeight="600"
                                fontFamily="sans-serif"
                            >
                                {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
                            </text>
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
}