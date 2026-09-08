import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { moneyARS, shortDay } from "@/lib/format";

const tooltipStyle = {
  background: "#1c1c20",
  border: "1px solid #2a2a2e",
  borderRadius: 12,
  fontSize: 12,
  color: "#f4f4f0",
};

function SafeChart({
  className,
  children,
}: {
  className: string;
  children: ReactElement;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      if (w < 16 || h < 16) return;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {size ? (
        <ResponsiveContainer width={size.w} height={size.h} debounce={250}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export function DailyArea({
  data,
}: {
  data: { date: string; spent: number }[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = data.filter((d) => d.date <= today);
  return (
    <SafeChart className="h-44 w-full">
      <AreaChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="spentFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8ccd4" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#c8ccd4" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2a2a2e" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => shortDay(v)}
          tick={{ fill: "#8c8c86", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
          tick={{ fill: "#8c8c86", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [moneyARS(Number(v)), "Gasto"]}
          labelFormatter={(l) => shortDay(String(l))}
        />
        <Area
          type="monotone"
          dataKey="spent"
          stroke="#c8ccd4"
          strokeWidth={1.5}
          fill="url(#spentFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </SafeChart>
  );
}

export function WeekdayBars({ data }: { data: { name: string; value: number }[] }) {
  return (
    <SafeChart className="h-40 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#2a2a2e" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#8c8c86", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
          tick={{ fill: "#8c8c86", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [moneyARS(Number(v)), "Promedio"]}
        />
        <Bar dataKey="value" fill="#c8ccd4" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </SafeChart>
  );
}

export function CatDonut({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) {
    return <p className="py-10 text-center text-sm text-muted">Sin gastos en el período.</p>;
  }
  return (
    <SafeChart className="h-52 w-full">
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={80}
          paddingAngle={2}
          stroke="none"
          isAnimationActive={false}
        >
          {rows.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => moneyARS(Number(v))}
        />
      </PieChart>
    </SafeChart>
  );
}
