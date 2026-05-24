import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['hsl(120 100% 65%)', 'hsl(0 100% 65%)'];

const AttendanceChart = ({ attended, total, target }) => {
  const missed = total - attended;
  const pct = ((attended / total) * 100).toFixed(1);
  const data = [
    { name: 'Attended', value: attended },
    { name: 'Missed', value: missed },
  ];

  return (
    <div className="glass-card hover-lift h-full">
      <h3 className="text-xl font-bold text-center mb-4 neon-text">📊 Attendance Overview</h3>
      <div className="flex items-center justify-center gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: COLORS[0] }} />
            <div>
              <div className="text-2xl font-bold text-success">{attended}</div>
              <div className="text-xs text-muted-foreground">Attended</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: COLORS[1] }} />
            <div>
              <div className="text-2xl font-bold text-destructive">{missed}</div>
              <div className="text-xs text-muted-foreground">Missed</div>
            </div>
          </div>
        </div>
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '12px',
                backdropFilter: 'blur(10px)',
                color: '#fff',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center mt-4">
        <div className="text-xs text-muted-foreground">
          Target: <span className="text-accent font-bold">{target}%</span>
        </div>
        <div className={`text-sm font-bold ${Number(pct) >= target ? 'text-success' : 'text-warning'}`}>
          {Number(pct) >= target ? '✅ Meeting Target' : '⚠️ Below Target'}
        </div>
      </div>
    </div>
  );
};

export default AttendanceChart;
