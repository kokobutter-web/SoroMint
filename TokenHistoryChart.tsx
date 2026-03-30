import React from 'react';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface HistoryData {
  date: string;
  supply: number;
  volume: number;
}

interface TokenHistoryChartProps {
  data: HistoryData[];
  color?: string;
}

/**
 * Interactive Supply and Volume Chart for SoroMint Tokens.
 * Visualizes data derived from Mint/Burn events.
 */
export const TokenHistoryChart: React.FC<TokenHistoryChartProps> = ({ 
  data, 
  color = "#8884d8" 
}) => {
  return (
    <div style={{ width: '100%', height: 400, minWidth: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorSupply" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.8} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#999', fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#999', fontSize: 12 }}
            tickFormatter={(value) => value.toLocaleString()}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#999', fontSize: 12 }}
            tickFormatter={(value) => value.toLocaleString()}
            // Hide if there's no volume to avoid a cluttered zero-axis
            hide={data.length > 0 && data.every((d) => d.volume === 0)}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: '#1a1a1a', 
              border: '1px solid #333',
              borderRadius: '8px',
              color: '#fff'
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ paddingBottom: '20px' }}
          />
          <Bar 
            yAxisId="right"
            name="Transaction Volume"
            dataKey="volume" 
            barSize={20} 
            fill="#444" 
            radius={[4, 4, 0, 0]} 
          />
          <Area
            yAxisId="left"
            name="Total Supply"
            type="monotone"
            dataKey="supply"
            stroke={color}
            fillOpacity={1}
            fill="url(#colorSupply)"
            strokeWidth={2}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TokenHistoryChart;