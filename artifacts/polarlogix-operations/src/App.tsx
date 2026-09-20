import { useCallback, useEffect, useMemo, useState, createContext, useContext, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyQueuedOperation, loadOperations } from '@/lib/operations-api';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { CargoItem, Emergency, Event, InventoryItem, Person, QueueOperation, Station, Status, Tone, Voyage } from '@/lib/operations-types';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  Activity, AlertOctagon, AlertTriangle, Anchor, ArrowDownRight, ArrowUpRight, Boxes,
  CalendarDays, Check, ChevronRight, CircleDot, CloudSnow, Container, Gauge, HardHat,
  Layers3, LifeBuoy, LockKeyhole, Menu, PackageCheck, PanelLeftClose, Plus, Radio,
  RefreshCw, Search, Settings2, ShieldCheck, Snowflake, Thermometer, Users,
  Wifi, WifiOff, X, Zap
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip,
  XAxis, YAxis
} from 'recharts';

const stations: Station[] = [
  { code: 'MAI', name: 'Maitri', theatre: 'Queen Maud Land', occupancy: 39, capacity: 48, weather: 'Blowing snow', coordinates: '70°45′S 11°44′E' },
  { code: 'BHA', name: 'Bharati', theatre: 'Larsemann Hills', occupancy: 42, capacity: 47, weather: 'Clear / −18°', coordinates: '69°24′S 76°11′E' },
  { code: 'HIM', name: 'Himadri', theatre: 'Ny-Ålesund', occupancy: 12, capacity: 16, weather: 'Overcast / −6°', coordinates: '78°55′N 11°56′E' },
  { code: 'SEA', name: 'Southern Ocean', theatre: 'Transit corridor', occupancy: 0, capacity: 0, weather: 'Cross swell 2.4m', coordinates: '64°12′S 41°08′E' },
];
const seedVoyages: Voyage[] = [
  { id: 'v-44', expedition: 'NCPOR-44', vessel: 'MV Vasundhara', polarClass: 'PC-6', route: 'Cape Town → Maitri', status: 'UNDERWAY', departure: '18 Jan 2025', iceEntry: '31 Jan · 14:00', delay: 0 },
  { id: 'v-45', expedition: 'NCPOR-45', vessel: 'MV Sagar Kanya', polarClass: 'PC-5', route: 'Cape Town → Bharati', status: 'READY', departure: '08 Feb 2025', iceEntry: '21 Feb · 08:30', delay: 0 },
  { id: 'v-46', expedition: 'NCPOR-46', vessel: 'RV Polarstern II', polarClass: 'PC-3', route: 'Longyearbyen → Himadri', status: 'DELAYED', departure: '02 Feb 2025', iceEntry: '09 Feb · 06:00', delay: 1 },
];
const seedCargo: CargoItem[] = [
  { tracking: 'PLX-804-19', description: 'Fresh produce / 14 day pack', destination: 'Maitri', type: 'Provision', weight: 842, temperature: -17.2, humidity: 68, shock: 0.42, status: 'NORMAL', coldChain: true },
  { tracking: 'PLX-804-23', description: 'Cryogenic sample canisters', destination: 'Bharati', type: 'Science', weight: 124, temperature: -74.8, humidity: 31, shock: 0.18, status: 'NORMAL', coldChain: true },
  { tracking: 'PLX-805-02', description: 'Hydraulic pump assembly', destination: 'Maitri', type: 'Engineering', weight: 316, temperature: -11.4, humidity: 42, shock: 1.76, status: 'CRITICAL', coldChain: false },
  { tracking: 'PLX-805-08', description: 'Medical resupply / tier 1', destination: 'Bharati', type: 'Medical', weight: 98, temperature: 4.1, humidity: 45, shock: 0.31, status: 'HOLD', coldChain: true },
  { tracking: 'PLX-805-11', description: 'Diesel additive drums', destination: 'Maitri', type: 'Fuel', weight: 1200, temperature: -14.8, humidity: 48, shock: 0.52, status: 'NORMAL', coldChain: false },
  { tracking: 'PLX-805-16', description: 'Meteorology mast spares', destination: 'Himadri', type: 'Science', weight: 205, temperature: -8.2, humidity: 39, shock: 0.26, status: 'NORMAL', coldChain: false },
];
const seedInventory: InventoryItem[] = [
  { name: 'Arctic diesel', sku: 'FUEL-D-17', category: 'Fuel', ved: 'V', quantity: 18420, unit: 'L', dailyBurn: 860, threshold: 7200, station: 'Maitri' },
  { name: 'Potable water reserve', sku: 'LIFE-W-04', category: 'Life support', ved: 'V', quantity: 9280, unit: 'L', dailyBurn: 410, threshold: 3600, station: 'Bharati' },
  { name: 'Oxygen cylinders', sku: 'LIFE-O-11', category: 'Life support', ved: 'V', quantity: 184, unit: 'cyl', dailyBurn: 4.2, threshold: 72, station: 'Maitri' },
  { name: 'Generator lube oil', sku: 'ENG-L-09', category: 'Engineering', ved: 'E', quantity: 620, unit: 'L', dailyBurn: 18, threshold: 160, station: 'Maitri' },
  { name: 'Emergency rations', sku: 'PROV-R-22', category: 'Provision', ved: 'E', quantity: 2460, unit: 'packs', dailyBurn: 48, threshold: 720, station: 'Bharati' },
  { name: 'Aviation fuel', sku: 'FUEL-A-02', category: 'Fuel', ved: 'E', quantity: 7400, unit: 'L', dailyBurn: 260, threshold: 2200, station: 'Maitri' },
];
const seedPersonnel: Person[] = [
  { id: 'p-01', name: 'Dr. Kavya Menon', role: 'Medical lead', station: 'Maitri', phase: 'Winter-over', medical: 'Valid · 94d', training: 'Current', blood: 'O+', status: 'INDOOR' },
  { id: 'p-02', name: 'Arjun Raghavan', role: 'Field engineer', station: 'Bharati', phase: 'Winter-over', medical: 'Valid · 61d', training: 'Current', blood: 'B+', status: 'FIELD' },
  { id: 'p-03', name: 'Nisha Thomas', role: 'Atmospheric scientist', station: 'Himadri', phase: 'Rotation', medical: 'Valid · 18d', training: 'Refresh due', blood: 'A+', status: 'INDOOR' },
  { id: 'p-04', name: 'Vikram Singh', role: 'Comms specialist', station: 'Maitri', phase: 'Winter-over', medical: 'Valid · 122d', training: 'Current', blood: 'AB+', status: 'INDOOR' },
  { id: 'p-05', name: 'Sana Qureshi', role: 'Heavy vehicle operator', station: 'Bharati', phase: 'Summer', medical: 'Valid · 38d', training: 'Current', blood: 'O-', status: 'FIELD' },
  { id: 'p-06', name: 'Rohan Iyer', role: 'Power systems', station: 'Maitri', phase: 'Winter-over', medical: 'Valid · 86d', training: 'Current', blood: 'B-', status: 'INDOOR' },
];
const seedEvents: Event[] = [
  { id: 'e-1', time: '05:41:18', module: 'CARGO', action: 'Cold-chain scan passed · PLX-804-19', tone: 'cyan' },
  { id: 'e-2', time: '05:37:02', module: 'PERSONNEL', action: 'Muster reconciliation complete · 93 / 96', tone: 'green' },
  { id: 'e-3', time: '05:32:44', module: 'EXPEDITION', action: 'MV Vasundhara entered ice corridor', tone: 'cyan' },
  { id: 'e-4', time: '05:18:09', module: 'INVENTORY', action: 'Generator lube oil threshold review', tone: 'amber' },
  { id: 'e-5', time: '04:56:31', module: 'WEATHER', action: 'Blizzard watch · Maitri sector', tone: 'amber' },
];

type StateContext = {
  stations: Station[]; voyages: Voyage[]; cargo: CargoItem[]; inventory: InventoryItem[]; personnel: Person[];
  events: Event[]; emergency: Emergency; online: boolean; queued: number; realtimeConnected: boolean;
  loading: boolean;
  simulateBlizzard: () => void; clearIncident: () => void; simulateAnomaly: () => void;
  addVoyage: (v: Voyage) => void; adjustStock: (sku: string, delta: number) => void;
  setPersonStatus: (id: string, status: Person['status']) => void; toggleOnline: () => void;
};
const StateCtx = createContext<StateContext | null>(null);
const queryClient = new QueryClient();
const useOps = () => {
  const context = useContext(StateCtx);
  if (!context) throw new Error('Operations state unavailable');
  return context;
};

function useOperations(): StateContext & { loading: boolean } {
  const persisted = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('polarlogix-state') || 'null'); } catch { return null; }
  }, []);
  const initialQueue = useMemo<QueueOperation[]>(() => {
    try { return JSON.parse(localStorage.getItem('polarlogix-offline-queue') || '[]'); } catch { return []; }
  }, []);
  const [loading, setLoading] = useState(true);
  const [stationState, setStationState] = useState<Station[]>(stations);
  const [voyages, setVoyages] = useState<Voyage[]>(!supabaseConfigured && persisted?.voyages ? persisted.voyages : seedVoyages);
  const [cargo, setCargo] = useState<CargoItem[]>(!supabaseConfigured && persisted?.cargo ? persisted.cargo : seedCargo);
  const [inventory, setInventory] = useState<InventoryItem[]>(!supabaseConfigured && persisted?.inventory ? persisted.inventory : seedInventory);
  const [personnel, setPersonnel] = useState<Person[]>(!supabaseConfigured && persisted?.personnel ? persisted.personnel : seedPersonnel);
  const [events, setEvents] = useState<Event[]>(persisted?.events || seedEvents);
  const [emergency, setEmergency] = useState<Emergency>(!supabaseConfigured && persisted?.emergency ? persisted.emergency : { type: 'No active incidents', severity: 'STANDBY', description: 'All stations operating within command parameters.', active: false, lockdown: false, timestamp: '—' });
  const [online, setOnline] = useState<boolean>(persisted?.online ?? true);
  const [queue, setQueue] = useState<QueueOperation[]>(initialQueue);
  const [realtimeConnected, setRealtimeConnected] = useState(!supabaseConfigured);

  useEffect(() => {
    let mounted = true;
    if (!supabase) {
      const timer = window.setTimeout(() => setLoading(false), 420);
      return () => window.clearTimeout(timer);
    }
    void loadOperations().then(snapshot => {
      if (!mounted) return;
      setStationState(snapshot.stations.length ? snapshot.stations : stations);
      setVoyages(snapshot.voyages.length ? snapshot.voyages : seedVoyages);
      setCargo(snapshot.cargo.length ? snapshot.cargo : seedCargo);
      setInventory(snapshot.inventory.length ? snapshot.inventory : seedInventory);
      setPersonnel(snapshot.personnel.length ? snapshot.personnel : seedPersonnel);
      setEmergency(snapshot.emergency);
    }).catch(error => {
      console.error(error);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    localStorage.setItem('polarlogix-offline-queue', JSON.stringify(queue));
  }, [queue]);
  useEffect(() => {
    if (supabaseConfigured) return;
    localStorage.setItem('polarlogix-state', JSON.stringify({ voyages, cargo, inventory, personnel, events, emergency, online }));
  }, [voyages, cargo, inventory, personnel, events, emergency, online]);

  const enqueue = useCallback((operation: Omit<QueueOperation, 'id'>) => {
    setQueue(previous => [...previous, { ...operation, id: `q-${Date.now()}-${previous.length}` } as QueueOperation]);
  }, []);
  const flushQueue = useCallback(async () => {
    if (!supabase) {
      setQueue([]);
      return;
    }
    let pending = [...queue];
    for (const operation of pending) {
      try {
        await applyQueuedOperation(operation);
        pending = pending.filter(item => item.id !== operation.id);
        setQueue(pending);
      } catch (error) {
        console.error(error);
        setOnline(false);
        return;
      }
    }
  }, [queue]);
  const persistOrQueue = useCallback(async (operation: Omit<QueueOperation, 'id'>) => {
    if (!online) {
      enqueue(operation);
      return;
    }
    if (!supabase) {
      return;
    }
    try {
      await applyQueuedOperation({ ...operation, id: `live-${Date.now()}` } as QueueOperation);
    } catch (error) {
      console.error(error);
      enqueue(operation);
      setOnline(false);
    }
  }, [enqueue, online]);

  const register = useCallback((module: string, action: string, tone: Tone = 'cyan') => {
    setEvents(previous => [{ id: `e-${Date.now()}`, time: new Date().toISOString().slice(11, 19), module, action, tone }, ...previous].slice(0, 12));
  }, []);
  const simulateBlizzard = useCallback(() => {
    const nextEmergency: Emergency = { stationId: stationState.find(station => station.name === 'Maitri')?.id, type: 'Blizzard cascade', severity: 'CONDITION 1', description: 'Whiteout wall approaching Maitri west sector. Field movement suspended pending visibility recovery.', active: true, lockdown: true, timestamp: '05:44:12 UTC' };
    const cargoIds = cargo.filter(item => item.destination === 'Maitri' && item.id).map(item => item.id as string);
    const voyageIds = voyages.filter(voyage => voyage.status === 'UNDERWAY').map(voyage => voyage.id).filter(id => !id.startsWith('v-'));
    setEmergency(nextEmergency);
    setCargo(previous => previous.map(item => item.destination === 'Maitri' ? { ...item, status: item.status === 'CRITICAL' ? item.status : 'HOLD' } : item));
    setVoyages(previous => previous.map(voyage => voyage.status === 'UNDERWAY' ? { ...voyage, status: 'DELAYED', delay: Math.max(1, voyage.delay) } : voyage));
    void persistOrQueue({ kind: 'emergency-cascade', payload: { emergency: { stationId: nextEmergency.stationId, severity: 'LEVEL_3_LIFE_THREATENING', incidentType: 'BLIZZARD_COND_1', description: nextEmergency.description, lockdown: true }, cargoIds, voyageIds } });
    register('EMERGENCY', 'Condition 1 cascade executed · field sorties recalled', 'red');
  }, [cargo, persistOrQueue, register, stationState, voyages]);
  const clearIncident = useCallback(() => {
    setEmergency({ type: 'No active incidents', severity: 'STANDBY', description: 'All stations operating within command parameters.', active: false, lockdown: false, timestamp: '—' });
    void persistOrQueue({ kind: 'emergency-resolve', payload: { incidentId: emergency.incidentId } });
    register('EMERGENCY', 'Recovery state declared · command restrictions lifted', 'green');
  }, [emergency.incidentId, persistOrQueue, register]);
  const simulateAnomaly = useCallback(() => {
    const target = cargo.find(item => item.tracking === 'PLX-804-19');
    const nextCargo = target ? { ...target, temperature: -8.6, status: 'CRITICAL' as Status } : undefined;
    setCargo(previous => previous.map(item => item.tracking === 'PLX-804-19' ? { ...item, temperature: -8.6, status: 'CRITICAL' } : item));
    if (nextCargo) void persistOrQueue({ kind: 'cargo-anomaly', payload: { cargo: nextCargo } });
    register('CARGO', 'Anomaly injected · PLX-804-19 cold-chain excursion', 'red');
  }, [cargo, persistOrQueue, register]);
  const addVoyage = useCallback((voyage: Voyage) => {
    setVoyages(previous => [voyage, ...previous]);
    void persistOrQueue({ kind: 'voyage-create', payload: voyage });
    register('EXPEDITION', `Voyage plan created · ${voyage.expedition}`, 'green');
  }, [persistOrQueue, register]);
  const adjustStock = useCallback((sku: string, delta: number) => {
    setInventory(previous => previous.map(item => item.sku === sku ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
    const item = inventory.find(value => value.sku === sku);
    void persistOrQueue({ kind: 'inventory-adjust', payload: { sku, delta } });
    register('INVENTORY', `${item?.name || sku} adjusted ${delta > 0 ? '+' : ''}${delta}`, 'amber');
  }, [inventory, persistOrQueue, register]);
  const setPersonStatus = useCallback((id: string, status: Person['status']) => {
    setPersonnel(previous => previous.map(person => person.id === id ? { ...person, status } : person));
    const person = personnel.find(value => value.id === id);
    void persistOrQueue({ kind: 'personnel-status', payload: { id, status } });
    register('PERSONNEL', `${person?.name || id} marked ${status}`, status === 'SOS' ? 'red' : 'cyan');
  }, [personnel, persistOrQueue, register]);
  const toggleOnline = useCallback(() => {
    if (online) {
      setOnline(false);
      return;
    }
    setOnline(true);
    void flushQueue();
  }, [flushQueue, online]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel('emergency-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_incidents' }, payload => {
        const row = payload.new as Record<string, unknown>;
        setEmergency({
          incidentId: String(row.incident_id || ''),
          stationId: row.station_id ? String(row.station_id) : undefined,
          type: row.incident_type === 'BLIZZARD_COND_1' ? 'Blizzard cascade' : String(row.incident_type || 'Emergency incident').replaceAll('_', ' '),
          severity: row.incident_severity === 'LEVEL_3_LIFE_THREATENING' ? 'CONDITION 1' : String(row.incident_severity || 'LEVEL 1').replace('LEVEL_', 'LEVEL '),
          description: String(row.description || 'Emergency incident received from the station network.'),
          active: !Boolean(row.is_resolved),
          lockdown: Boolean(row.lockdown_active),
          timestamp: new Date(String(row.created_at || Date.now())).toISOString().slice(11, 19) + ' UTC',
        });
        setEvents(previous => [{ id: `realtime-${String(row.incident_id || Date.now())}`, time: new Date().toISOString().slice(11, 19), module: 'EMERGENCY', action: 'Realtime incident received from station network', tone: 'red' as const }, ...previous].slice(0, 12));
      })
      .subscribe(status => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });
    return () => { void client.removeChannel(channel); };
  }, []);

  return { stations: stationState, voyages, cargo, inventory, personnel, events, emergency, online, queued: queue.length, realtimeConnected, simulateBlizzard, clearIncident, simulateAnomaly, addVoyage, adjustStock, setPersonStatus, toggleOnline, loading };
}

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: Tone }) {
  const colors: Record<Tone, string> = { cyan: 'bg-cyan-50 text-cyan-800 border-cyan-200', amber: 'bg-amber-50 text-amber-800 border-amber-200', red: 'bg-red-50 text-red-800 border-red-200', slate: 'bg-slate-100 text-slate-700 border-slate-200', green: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
  return <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-extrabold tracking-[.09em] ${colors[tone]}`}>{children}</span>;
}
function StatusBadge({ status }: { status: Status | string }) {
  const { emergency } = useOps();
  const tone: Tone = emergency.active && status === 'FIELD' ? 'red' : ['CRITICAL', 'SOS', 'RECALLED'].includes(status) ? 'red' : ['DELAYED', 'HOLD', 'FIELD'].includes(status) ? 'amber' : ['NORMAL', 'READY', 'UNDERWAY', 'INDOOR'].includes(status) ? 'cyan' : status === 'ON STATION' ? 'green' : 'slate';
  return <Badge tone={tone}><CircleDot size={9} className={tone === 'red' ? 'pulse-dot' : ''} />{status}</Badge>;
}
function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = { primary: 'bg-[hsl(var(--primary))] text-white hover:brightness-110', secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--border))]', danger: 'bg-[hsl(var(--destructive))] text-white hover:brightness-110', ghost: 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]' };
  return <button {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold transition-colors ${styles[variant]} ${className}`}>{children}</button>;
}
function SectionTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><div className="mono mb-1 text-[10px] font-bold tracking-[.18em] text-[hsl(var(--primary))]">{eyebrow}</div><h2 className="condensed text-[28px] font-bold uppercase leading-none tracking-wide text-[hsl(var(--foreground))]">{title}</h2>{detail && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>{action}</div>;
}
function Metric({ label, value, detail, icon: Icon, tone = 'cyan', trend }: { label: string; value: string; detail: string; icon: typeof Activity; tone?: Tone; trend?: 'up' | 'down' }) {
  return <div className="panel relative overflow-hidden p-4"><div className={`absolute right-0 top-0 h-1 w-16 ${tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-400' : tone === 'green' ? 'bg-emerald-500' : 'bg-cyan-600'}`} /><div className="flex items-start justify-between"><span className="mono text-[10px] font-bold tracking-[.14em] text-[hsl(var(--muted-foreground))]">{label}</span><Icon size={16} className="text-[hsl(var(--primary))]" /></div><div data-testid={`text-metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="condensed mt-3 text-4xl font-bold tracking-wide">{value}</div><div className="mt-1 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">{trend && (trend === 'up' ? <ArrowUpRight size={13} className="text-emerald-600" /> : <ArrowDownRight size={13} className="text-amber-600" />)}{detail}</div></div>;
}
function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded bg-[hsl(var(--muted))] ${className}`} />; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="flex min-h-36 flex-col items-center justify-center border border-dashed border-[hsl(var(--border))] p-6 text-center"><PackageCheck size={24} className="mb-2 text-[hsl(var(--primary))]" /><div className="text-sm font-bold">{title}</div><div className="mt-1 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">{detail}</div></div>; }

function Sidebar() {
  const { stations: stationState } = useOps();
  const [location] = useLocation();
  const links = [{ href: '/', label: 'Operations overview', icon: Gauge }, { href: '/expedition', label: 'Expedition control', icon: Anchor }, { href: '/cargo', label: 'Cargo telemetry', icon: Container }, { href: '/inventory', label: 'Inventory & burn', icon: Boxes }, { href: '/personnel', label: 'Personnel readiness', icon: Users }, { href: '/emergency', label: 'Emergency command', icon: AlertOctagon }];
  return <aside className="hidden w-[252px] shrink-0 flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] md:flex"><div className="border-b border-[hsl(var(--sidebar-border))] px-5 py-5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"><Snowflake size={21} /></div><div><div className="condensed text-[22px] font-bold uppercase tracking-wider text-white">Polar<span className="text-cyan-300">Logix</span></div><div className="mono text-[9px] tracking-[.16em] text-slate-400">OPERATIONS / NCPOR</div></div></div></div><div className="px-3 py-5"><div className="mono mb-2 px-3 text-[9px] tracking-[.18em] text-slate-500">COMMAND MODULES</div><nav className="space-y-1">{links.map(({ href, label, icon: Icon }) => { const active = location === href; return <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex min-h-11 items-center gap-3 rounded-md px-3 text-xs font-bold transition-colors ${active ? 'bg-[hsl(var(--sidebar-accent))] text-white' : 'text-slate-400 hover:bg-[hsl(var(--sidebar-accent))] hover:text-white'}`}><Icon size={17} className={active ? 'text-cyan-300' : 'text-slate-500 group-hover:text-cyan-300'} /><span>{label}</span>{active && <ChevronRight size={14} className="ml-auto text-cyan-300" />}</Link>; })}</nav></div><div className="mt-auto border-t border-[hsl(var(--sidebar-border))] p-4"><div className="mb-3 flex items-center justify-between"><span className="mono text-[9px] tracking-[.14em] text-slate-500">STATION NETWORK</span><span className="h-2 w-2 rounded-full bg-emerald-400 pulse-dot" /></div><div className="space-y-2">{stationState.slice(0, 3).map(station => <div key={station.code} className="flex items-center justify-between text-[11px]"><span className="font-bold text-slate-300">{station.name}</span><span className="mono text-slate-500">{station.occupancy}/{station.capacity}</span></div>)}</div></div></aside>;
}

function Header() {
  const { emergency, online, queued, realtimeConnected, toggleOnline } = useOps();
  const [time, setTime] = useState(new Date());
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setTime(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const mobileLinks = [{ href: '/', label: 'Overview' }, { href: '/expedition', label: 'Expedition' }, { href: '/cargo', label: 'Cargo' }, { href: '/inventory', label: 'Inventory' }, { href: '/personnel', label: 'Personnel' }, { href: '/emergency', label: 'Emergency' }];
  return <><header className={`sticky top-0 z-40 flex min-h-[70px] items-center justify-between gap-3 border-b px-4 backdrop-blur-md transition-colors md:px-7 ${emergency.active ? 'border-red-700 bg-red-600 text-white' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.92)]'}`}><div className="flex items-center gap-3"><button data-testid="button-mobile-menu" onClick={() => setMobileOpen(value => !value)} className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--sidebar))] text-cyan-300 md:hidden">{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button><div><div className={`mono text-[10px] font-bold tracking-[.16em] ${emergency.active ? 'text-red-100' : 'text-[hsl(var(--muted-foreground))]'}`}>NATIONAL CENTRE FOR POLAR & OCEAN RESEARCH</div><div className="mt-1 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${emergency.active ? 'bg-white' : 'bg-emerald-500'} pulse-dot`} /><span className="text-xs font-extrabold">LIVE OPERATIONS FEED</span>{emergency.active && <Badge tone="red"><AlertTriangle size={10} />{emergency.severity}</Badge>}</div></div></div><div className="flex items-center gap-2"><button data-testid="button-network-toggle" onClick={toggleOnline} className={`flex min-h-10 items-center gap-2 rounded-md border px-2 text-[10px] font-extrabold tracking-wide sm:px-3 ${online ? realtimeConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{online && realtimeConnected ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? queued ? `${queued} QUEUED` : realtimeConnected ? 'SYNCED' : 'LINK DEGRADED' : 'OFFLINE'}<span className="sr-only">Toggle network simulation</span></button><div className="hidden text-right lg:block"><div className="mono text-xs font-bold">{time.toISOString().slice(11, 19)} UTC</div><div className={`text-[10px] ${emergency.active ? 'text-red-100' : 'text-[hsl(var(--muted-foreground))]'}`}>17 FEB 2025 · SHIFT 02</div></div><button data-testid="button-settings" onClick={() => window.alert('Command preferences are local to this prototype.')} className={`flex h-10 w-10 items-center justify-center rounded-md border ${emergency.active ? 'border-red-300 text-white hover:bg-red-700' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`}><Settings2 size={17} /></button></div></header>{mobileOpen && <nav className="border-b border-[hsl(var(--border))] bg-[hsl(var(--sidebar))] p-3 md:hidden">{mobileLinks.map(link => <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} data-testid={`link-mobile-${link.label.toLowerCase()}`} className="flex min-h-11 items-center border-b border-[hsl(var(--sidebar-border))] px-3 text-xs font-bold text-slate-200 last:border-0">{link.label}</Link>)}</nav>}</>;
}

function AppShell({ children }: { children: ReactNode }) {
  const { loading, emergency } = useOps();
  return <div className="texture flex min-h-[100dvh] bg-[hsl(var(--background))]"><Sidebar /><div className="min-w-0 flex-1"><Header />{emergency.active && <div data-testid="status-global-alert" className="flex items-center gap-3 border-b border-red-700 bg-red-500 px-4 py-2 text-xs font-extrabold text-white md:px-7"><AlertOctagon size={16} className="shrink-0" /><span>CONDITION 1 LOCKDOWN · FIELD MOVEMENT SUSPENDED · MANDATORY MUSTER ACTIVE</span><Link href="/emergency" className="ml-auto underline">COMMAND CENTER</Link></div>}<main className="mx-auto max-w-[1600px] p-4 md:p-7">{loading ? <div className="space-y-5"><Skeleton className="h-10 w-72" /><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-32" />)}</div><Skeleton className="h-80" /></div> : children}</main></div></div>;
}

function Overview() {
  const { stations: stationState, voyages, cargo, inventory, personnel, events, emergency, simulateBlizzard } = useOps();
  const field = personnel.filter(person => person.status === 'FIELD').length;
  const criticalCargo = cargo.filter(item => item.status === 'CRITICAL').length;
  return <div className="space-y-6"><div className="reveal flex flex-wrap items-end justify-between gap-4"><div><div className="mono mb-2 text-[10px] font-bold tracking-[.2em] text-[hsl(var(--primary))]">COMMAND DECK / 00</div><h1 className="condensed text-5xl font-bold uppercase leading-[.86] tracking-wide md:text-6xl">Polar operations<br /><span className="text-[hsl(var(--primary))]">at a glance.</span></h1><p className="mt-3 max-w-xl text-sm text-[hsl(var(--muted-foreground))]">A trusted operational picture across three stations, two ice corridors, and the vessels moving between them.</p></div><Button data-testid="button-simulate-blizzard" variant={emergency.active ? 'secondary' : 'danger'} onClick={simulateBlizzard}>{emergency.active ? <LockKeyhole size={15} /> : <CloudSnow size={15} />}{emergency.active ? 'CONDITION 1 ACTIVE' : 'SIMULATE CONDITION 1'}</Button></div>{emergency.active && <div data-testid="status-active-cascade" className="reveal flex flex-wrap items-center justify-between gap-3 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-red-900"><div className="flex items-center gap-3"><AlertOctagon size={20} /><div><div className="text-xs font-extrabold tracking-wide">EMERGENCY CASCADE PROPAGATED</div><div className="text-xs">Field sorties recalled · cargo handling paused · generator forecast +18%</div></div></div><Link href="/emergency" className="text-xs font-extrabold underline">OPEN COMMAND CENTER</Link></div>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{<Metric label="ACTIVE VOYAGES" value={String(voyages.filter(voyage => ['UNDERWAY', 'DELAYED'].includes(voyage.status)).length).padStart(2, '0')} detail="1 delayed in ice corridor" icon={Anchor} trend="up" />}{<Metric label="PERSONNEL ACCOUNTED" value={`${personnel.filter(person => person.status !== 'SOS').length}/${personnel.length}`} detail={`${field} currently in field`} icon={Users} tone={personnel.some(person => person.status === 'SOS') ? 'red' : 'green'} />}{<Metric label="CARGO EXCEPTIONS" value={String(criticalCargo).padStart(2, '0')} detail="1 cold-chain · 1 shock" icon={Container} tone={criticalCargo ? 'amber' : 'green'} />}{<Metric label="FUEL COVERAGE" value="21.4d" detail={emergency.active ? '18% burn uplift forecast' : 'at current burn rate'} icon={Zap} tone={emergency.active ? 'amber' : 'cyan'} trend="down" />}</div><div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]"><div className="panel p-5 reveal reveal-delay-1"><SectionTitle eyebrow="STATION PICTURE / LIVE" title="Theatre status" detail="Occupancy, weather, and readiness by node" action={<Link href="/personnel" className="text-xs font-bold text-[hsl(var(--primary))]">Muster detail <ChevronRight size={14} className="inline" /></Link>} /><div className="grid gap-3 sm:grid-cols-2">{stationState.map(station => <div key={station.code} data-testid={`card-station-${station.code.toLowerCase()}`} className="group rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 transition-colors hover:border-[hsl(var(--primary)/.45)]"><div className="flex items-start justify-between"><div><div className="mono text-[10px] font-bold tracking-[.15em] text-[hsl(var(--primary))]">{station.code} / {station.coordinates}</div><div className="mt-1 text-base font-extrabold">{station.name}</div></div><StatusBadge status={station.code === 'MAI' && emergency.active ? 'RECALLED' : 'ON STATION'} /></div><div className="mt-4 flex items-end justify-between"><div><div className="text-[11px] text-[hsl(var(--muted-foreground))]">{station.theatre}</div><div className="mt-1 flex items-center gap-2 text-xs font-bold"><CloudSnow size={13} />{station.weather}</div></div><div className="text-right"><div className="mono text-sm font-bold">{station.occupancy}<span className="text-[hsl(var(--muted-foreground))]">/{station.capacity}</span></div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">occupancy</div></div></div></div>)}</div></div><div className="panel p-5 reveal reveal-delay-2"><SectionTitle eyebrow="COMMAND LOG / UTC" title="Activity feed" action={<Activity size={18} className="text-[hsl(var(--primary))]" />} /><div className="space-y-1">{events.slice(0, 6).map(event => <div key={event.id} data-testid={`event-${event.id}`} className="flex gap-3 border-b border-[hsl(var(--border)/.75)] py-3 last:border-0"><div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.tone === 'red' ? 'bg-red-500' : event.tone === 'amber' ? 'bg-amber-400' : event.tone === 'green' ? 'bg-emerald-500' : 'bg-cyan-600'}`} /><div className="min-w-0"><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{event.time} · {event.module}</div><div className="mt-0.5 text-xs font-semibold leading-relaxed">{event.action}</div></div></div>)}</div></div></div></div>;
}

function Expedition() {
  const { voyages, addVoyage } = useOps();
  const [modal, setModal] = useState(false);
  const milestones = [{ label: 'Port departure', date: '18 JAN', state: 'complete' }, { label: 'Southern Ocean', date: '23 JAN', state: 'complete' }, { label: 'Ice entry', date: '31 JAN', state: 'active' }, { label: 'Maitri offload', date: '04 FEB', state: 'next' }, { label: 'Return window', date: '18 FEB', state: 'next' }];
 return <div className="space-y-6"><SectionTitle eyebrow="EXPEDITION CONTROL / 01" title="Voyage planning" detail="Critical path across ice corridors" action={<Button data-testid="button-create-voyage" onClick={() => setModal(true)}><Plus size={16} />CREATE VOYAGE</Button>} /><div className="grid gap-4 md:grid-cols-3"><Metric label="NEXT ICE ENTRY" value="31 JAN" detail="MV Vasundhara · 14:00 UTC" icon={CalendarDays} /><Metric label="FLEET READINESS" value="94%" detail="2 vessels ready to sail" icon={ShieldCheck} tone="green" /><Metric label="PATH RISK" value="MODERATE" detail="Maitri weather watch active" icon={CloudSnow} tone="amber" /></div><div className="panel overflow-hidden p-5"><SectionTitle eyebrow="CRITICAL PATH / NCPOR-44" title="Ice corridor timeline" detail="MV Vasundhara · PC-6 · Cape Town → Maitri" /><div className="grid-lines overflow-x-auto rounded-md border border-[hsl(var(--border))] p-6"><div className="min-w-[700px]"><div className="relative mb-10 h-1 rounded bg-[hsl(var(--border))]"><div className="absolute left-0 top-0 h-1 w-[62%] rounded bg-[hsl(var(--primary))]" />{milestones.map((milestone, index) => <div key={milestone.label} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${index * 25}%` }}><div className={`h-4 w-4 rounded-full border-4 border-[hsl(var(--card))] ${milestone.state === 'complete' ? 'bg-[hsl(var(--primary))]' : milestone.state === 'active' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted-foreground))]'}`} /></div>)}</div><div className="grid grid-cols-5 gap-3">{milestones.map(milestone => <div key={milestone.label}><div className="mono text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{milestone.date}</div><div className="mt-1 text-xs font-bold">{milestone.label}</div><div className="mt-2"><Badge tone={milestone.state === 'complete' ? 'green' : milestone.state === 'active' ? 'amber' : 'slate'}>{milestone.state}</Badge></div></div>)}</div></div></div></div><div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="FLEET BOARD" title="Mission plans" detail="Select a voyage to open its operational record" /></div><div className="divide-y divide-[hsl(var(--border))]">{voyages.length === 0 ? <EmptyState title="No mission plans" detail="Create a voyage plan to establish the first critical path." /> : voyages.map(voyage => <div key={voyage.id} data-testid={`row-voyage-${voyage.id}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1.1fr_1.2fr_1fr_1fr_auto] md:items-center"><div><div className="mono text-[10px] text-[hsl(var(--primary))]">{voyage.expedition} · {voyage.polarClass}</div><div className="mt-1 font-extrabold">{voyage.vessel}</div></div><div><div className="text-xs font-semibold">{voyage.route}</div><div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Departure {voyage.departure}</div></div><div><div className="mono text-xs">{voyage.iceEntry}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">ice entry ETA</div></div><div><StatusBadge status={voyage.status} />{voyage.delay > 0 && <span className="ml-2 text-[10px] font-bold text-red-700">+{voyage.delay}d</span>}</div><button data-testid={`button-open-voyage-${voyage.id}`} onClick={() => window.alert(`${voyage.expedition} operational record opened.`)} className="flex h-10 items-center justify-center rounded-md border border-[hsl(var(--border))] px-3 text-xs font-bold hover:bg-[hsl(var(--muted))]">OPEN <ChevronRight size={14} /></button></div>)}</div>{modal && <VoyageModal onClose={() => setModal(false)} onCreate={voyage => { addVoyage(voyage); setModal(false); }} />}</div></div>;
}

function VoyageModal({ onClose, onCreate }: { onClose: () => void; onCreate: (voyage: Voyage) => void }) {
  const [vessel, setVessel] = useState('MV Sagar Kanya');
  const [destination, setDestination] = useState('Bharati');
  const [departure, setDeparture] = useState('24 Feb 2025');
  const submit = () => onCreate({ id: `v-${Date.now()}`, expedition: `NCPOR-${47 + Math.floor(Math.random() * 3)}`, vessel, polarClass: vessel.includes('Polar') ? 'PC-3' : 'PC-5', route: `Cape Town → ${destination}`, status: 'READY', departure, iceEntry: '08 Mar · 06:00', delay: 0 });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--sidebar)/.72)] p-4"><div role="dialog" aria-modal="true" className="panel w-full max-w-lg p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="mono text-[10px] tracking-[.18em] text-[hsl(var(--primary))]">MISSION BUILDER</div><h3 className="condensed mt-1 text-3xl font-bold uppercase">Create voyage</h3></div><button data-testid="button-close-voyage-modal" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><X size={18} /></button></div><div className="mt-6 space-y-4"><label className="block text-xs font-bold">Vessel<select data-testid="select-voyage-vessel" value={vessel} onChange={event => setVessel(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm"><option>MV Sagar Kanya</option><option>RV Polarstern II</option><option>MV Vasundhara</option></select></label><label className="block text-xs font-bold">Destination<select data-testid="select-voyage-destination" value={destination} onChange={event => setDestination(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm"><option>Maitri</option><option>Bharati</option><option>Himadri</option></select></label><label className="block text-xs font-bold">Departure window<input data-testid="input-voyage-departure" value={departure} onChange={event => setDeparture(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm" /></label></div><div className="mt-7 flex justify-end gap-2"><Button data-testid="button-cancel-voyage" variant="ghost" onClick={onClose}>CANCEL</Button><Button data-testid="button-submit-voyage" onClick={submit}><Check size={15} />SAVE MISSION PLAN</Button></div></div></div>;
}

function Cargo() {
  const { cargo, simulateAnomaly } = useOps();
  const [query, setQuery] = useState('');
  const visible = cargo.filter(item => `${item.tracking} ${item.description} ${item.destination}`.toLowerCase().includes(query.toLowerCase()));
  const chart = [{ time: '00:00', temp: -16.2, limit: -12 }, { time: '02:00', temp: -16.8, limit: -12 }, { time: '04:00', temp: -17.1, limit: -12 }, { time: '06:00', temp: -15.9, limit: -12 }, { time: '08:00', temp: -17.2, limit: -12 }, { time: '10:00', temp: -16.9, limit: -12 }];
  return <div className="space-y-6"><SectionTitle eyebrow="CARGO TELEMETRY / 02" title="Cold-chain & stowage" detail="Live container telemetry · 06 tracked consignments" action={<Button data-testid="button-simulate-anomaly" variant="secondary" onClick={simulateAnomaly}><Thermometer size={16} />SIMULATE ANOMALY</Button>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="CONTAINERS TRACKED" value="06" detail="4 normal · 1 hold · 1 critical" icon={Container} /><Metric label="COLD-CHAIN PASS" value="92.4%" detail="PLX-805-08 requires review" icon={Snowflake} tone="amber" /><Metric label="TOTAL MASS" value="2.78t" detail="Across Maitri / Bharati / Himadri" icon={Boxes} /><Metric label="LIVE SENSORS" value="18/18" detail="Last heartbeat 05:42 UTC" icon={Radio} tone="green" /></div><div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><div className="panel p-5"><SectionTitle eyebrow="SENSOR SERIES / PLX-804-19" title="Temperature trace" detail="Maitri reefer bay · tolerance −20° to −12° C" /><div className="h-60"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}><defs><linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1594a3" stopOpacity=".27" /><stop offset="100%" stopColor="#1594a3" stopOpacity=".02" /></linearGradient></defs><CartesianGrid stroke="#d7e2e7" strokeDasharray="2 4" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} /><YAxis tick={{ fontSize: 10, fill: '#64748b' }} /><ChartTooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #d7e2e7' }} /><Area type="monotone" dataKey="limit" stroke="#d5a52b" strokeDasharray="4 3" fill="none" strokeWidth={1.5} /><Area type="monotone" dataKey="temp" stroke="#1594a3" fill="url(#tempFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div><div className="panel p-5"><SectionTitle eyebrow="STOWAGE VIEW / BAY 03" title="Container grid" detail="Maitri inbound · crane sequence locked" /><div className="grid grid-cols-4 gap-2 rounded-md bg-[hsl(var(--sidebar))] p-3">{cargo.map((item, index) => <div key={item.tracking} data-testid={`tile-container-${item.tracking}`} className={`flex aspect-square flex-col justify-between rounded border p-2 ${item.status === 'CRITICAL' ? 'border-red-400 bg-red-500/20' : item.status === 'HOLD' ? 'border-amber-400 bg-amber-400/20' : 'border-cyan-300/40 bg-cyan-300/10'}`}><span className="mono text-[9px] text-slate-300">0{index + 1}</span><Container size={17} className={item.status === 'CRITICAL' ? 'text-red-300' : 'text-cyan-200'} /><span className="mono text-[8px] text-slate-300">{item.tracking.slice(-2)}</span></div>)}</div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px]"><div><div className="mx-auto mb-1 h-2 w-2 rounded-full bg-cyan-400" />NORMAL</div><div><div className="mx-auto mb-1 h-2 w-2 rounded-full bg-amber-400" />HOLD</div><div><div className="mx-auto mb-1 h-2 w-2 rounded-full bg-red-400" />EXCEPTION</div></div></div></div><div className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] p-5"><div><div className="mono text-[10px] tracking-[.18em] text-[hsl(var(--primary))]">CONSIGNMENT REGISTER</div><h2 className="condensed mt-1 text-2xl font-bold uppercase">Telemetry records</h2></div><div className="relative"><Search size={15} className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-cargo-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tracking or destination" className="h-10 w-64 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] pl-9 pr-3 text-xs outline-none focus:border-[hsl(var(--primary))]" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-[hsl(var(--muted)/.55)] text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><tr><th className="px-5 py-3">Tracking</th><th className="px-3 py-3">Description</th><th className="px-3 py-3">Destination</th><th className="px-3 py-3">Temp</th><th className="px-3 py-3">Shock</th><th className="px-3 py-3">State</th></tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{visible.map(item => <tr key={item.tracking} data-testid={`row-cargo-${item.tracking}`}><td className="px-5 py-4 mono font-bold text-[hsl(var(--primary))]">{item.tracking}</td><td className="px-3 py-4 font-bold">{item.description}<div className="mt-1 text-[10px] font-normal text-[hsl(var(--muted-foreground))]">{item.type} · {item.weight} kg</div></td><td className="px-3 py-4">{item.destination}</td><td className={`px-3 py-4 mono font-bold ${item.status === 'CRITICAL' ? 'text-red-700' : ''}`}>{item.temperature.toFixed(1)}°C</td><td className="px-3 py-4 mono">{item.shock.toFixed(2)}g</td><td className="px-3 py-4"><StatusBadge status={item.status} /></td></tr>)}</tbody></table>{visible.length === 0 && <EmptyState title="No telemetry matches" detail="Try a tracking number, destination, or clear the search query." />}</div></div></div>;
}

function Inventory() {
  const { inventory, adjustStock, emergency } = useOps();
  const burnData = [{ day: 'D0', fuel: 18420 }, { day: 'D4', fuel: 14980 }, { day: 'D8', fuel: 11540 }, { day: 'D12', fuel: 8100 }, { day: 'D16', fuel: 4660 }, { day: 'D20', fuel: emergency.active ? 650 : 1220 }];
  return <div className="space-y-6"><SectionTitle eyebrow="INVENTORY & BURN / 03" title="Sustainment picture" detail="VED-class stock levels and contingency runway" action={<Badge tone={emergency.active ? 'amber' : 'green'}><Zap size={10} />{emergency.active ? 'BURN FORECAST ELEVATED' : 'BURN RATE NOMINAL'}</Badge>} /><div className="grid gap-4 md:grid-cols-3"><Metric label="CRITICAL STOCKS" value="02" detail="Generator lube · aviation fuel" icon={AlertTriangle} tone="amber" /><Metric label="FUEL RUNWAY" value={emergency.active ? '17.6d' : '21.4d'} detail={emergency.active ? '+18% contingency burn applied' : 'Maitri generator group' } icon={Zap} tone={emergency.active ? 'amber' : 'cyan'} /><Metric label="LIFE SUPPORT" value="32.8d" detail="Water + oxygen combined" icon={LifeBuoy} tone="green" /></div><div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><div className="panel p-5"><SectionTitle eyebrow="CONTINGENCY PROJECTION" title="Fuel runway" detail="Litres remaining under current generator profile" /><div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={burnData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}><defs><linearGradient id="fuelFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d5a52b" stopOpacity=".28" /><stop offset="100%" stopColor="#d5a52b" stopOpacity=".03" /></linearGradient></defs><CartesianGrid stroke="#d7e2e7" strokeDasharray="2 4" /><XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} /><YAxis tick={{ fontSize: 10, fill: '#64748b' }} /><ChartTooltip /><Area type="monotone" dataKey="fuel" stroke="#bd8d1b" fill="url(#fuelFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div><div className="panel p-5"><SectionTitle eyebrow="BURN PROFILE" title="Daily draw" /><div className="space-y-5">{[{ label: 'Generator group', value: emergency.active ? 1015 : 860, unit: 'L/day', color: 'bg-cyan-600' }, { label: 'Aviation reserve', value: 260, unit: 'L/day', color: 'bg-amber-500' }, { label: 'Water treatment', value: 410, unit: 'L/day', color: 'bg-slate-500' }].map(row => <div key={row.label}><div className="flex justify-between text-xs font-bold"><span>{row.label}</span><span className="mono">{row.value} {row.unit}</span></div><div className="mt-2 h-2 rounded-full bg-[hsl(var(--muted))]"><div className={`h-2 rounded-full ${row.color}`} style={{ width: `${Math.min(100, row.value / 11)}%` }} /></div></div>)}</div><div className="mt-7 border-t border-[hsl(var(--border))] pt-4 text-xs text-[hsl(var(--muted-foreground))]">Projection automatically absorbs emergency generator uplift and keeps a conservative 72-hour reserve.</div></div></div><div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="VED REGISTER" title="Stock adjustment controls" detail="Tap controls to record a local adjustment" /></div><div className="divide-y divide-[hsl(var(--border))]">{inventory.map(item => { const pct = Math.min(100, (item.quantity / (item.threshold * 3)) * 100); const low = item.quantity <= item.threshold * 1.25; return <div key={item.sku} data-testid={`row-inventory-${item.sku}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1.25fr_.8fr_1fr_.8fr_auto] md:items-center"><div><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-black ${item.ved === 'V' ? 'bg-red-100 text-red-700' : item.ved === 'E' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{item.ved}</span><div><div className="text-xs font-extrabold">{item.name}</div><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{item.sku} · {item.station}</div></div></div></div><div className="text-xs"><span className="text-[hsl(var(--muted-foreground))]">on hand </span><strong className="mono">{item.quantity.toLocaleString()} {item.unit}</strong></div><div><div className="mb-1 flex justify-between text-[10px]"><span>{item.category}</span><span className={low ? 'font-bold text-amber-700' : 'text-[hsl(var(--muted-foreground))]'}>{low ? 'REVIEW' : `${item.dailyBurn} / day`}</span></div><div className="h-1.5 rounded-full bg-[hsl(var(--muted))]"><div className={`h-1.5 rounded-full ${low ? 'bg-amber-500' : 'bg-[hsl(var(--primary))]'}`} style={{ width: `${pct}%` }} /></div></div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">threshold<br /><strong className="mono text-[hsl(var(--foreground))]">{item.threshold} {item.unit}</strong></div><div className="flex gap-1"><button data-testid={`button-decrease-${item.sku}`} onClick={() => adjustStock(item.sku, -10)} className="h-10 w-10 rounded-md border border-[hsl(var(--border))] text-lg font-bold hover:bg-[hsl(var(--muted))]">−</button><button data-testid={`button-increase-${item.sku}`} onClick={() => adjustStock(item.sku, 10)} className="h-10 w-10 rounded-md border border-[hsl(var(--border))] text-lg font-bold hover:bg-[hsl(var(--muted))]">+</button></div></div>; })}</div></div></div>;
}

function Personnel() {
  const { personnel, setPersonStatus } = useOps();
  const statusCounts = { indoor: personnel.filter(person => person.status === 'INDOOR').length, field: personnel.filter(person => person.status === 'FIELD').length, sos: personnel.filter(person => person.status === 'SOS').length };
  return <div className="space-y-6"><SectionTitle eyebrow="PERSONNEL READINESS / 04" title="Muster & field safety" detail="Accountability state across all polar stations" action={<Button data-testid="button-reconcile-muster" variant="secondary" onClick={() => window.alert('Muster reconciliation complete. All roster records are current.') }><RefreshCw size={15} />RECONCILE MUSTER</Button>} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="ACCOUNTED" value={`${personnel.length - statusCounts.sos}/${personnel.length}`} detail="Last reconciliation 05:37 UTC" icon={Users} tone={statusCounts.sos ? 'red' : 'green'} /><Metric label="FIELD ACTIVE" value={String(statusCounts.field).padStart(2, '0')} detail="Sorties have live beacon lock" icon={HardHat} tone="amber" /><Metric label="READINESS INDEX" value="91%" detail="Medical + training weighted" icon={ShieldCheck} tone="cyan" /></div><div className="panel p-5"><SectionTitle eyebrow="FIELD SAFETY OVERVIEW" title="Status channels" detail="Use the controls to broadcast each person’s operating state" /><div className="grid gap-3 md:grid-cols-3"><div className="rounded-md border border-cyan-200 bg-cyan-50 p-4"><div className="flex items-center justify-between"><span className="text-xs font-extrabold text-cyan-900">INDOOR / STATION</span><div className="h-2 w-2 rounded-full bg-cyan-600" /></div><div className="condensed mt-2 text-4xl font-bold text-cyan-900">{statusCounts.indoor}</div><div className="text-[11px] text-cyan-800">Sheltered and accounted</div></div><div className="rounded-md border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between"><span className="text-xs font-extrabold text-amber-900">FIELD / BEACON</span><div className="h-2 w-2 rounded-full bg-amber-500 pulse-dot" /></div><div className="condensed mt-2 text-4xl font-bold text-amber-900">{statusCounts.field}</div><div className="text-[11px] text-amber-800">Active work parties</div></div><div className="rounded-md border border-red-200 bg-red-50 p-4"><div className="flex items-center justify-between"><span className="text-xs font-extrabold text-red-900">SOS / RESPONSE</span><div className="h-2 w-2 rounded-full bg-red-500 pulse-dot" /></div><div className="condensed mt-2 text-4xl font-bold text-red-900">{statusCounts.sos}</div><div className="text-[11px] text-red-800">Immediate response required</div></div></div></div><div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="MUSTER ROLL / VERIFIED" title="Personnel register" detail="Medical clearance and mandatory training are visible at point of work" /></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-[hsl(var(--muted)/.55)] text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><tr><th className="px-5 py-3">Person</th><th className="px-3 py-3">Station / phase</th><th className="px-3 py-3">Medical</th><th className="px-3 py-3">Training</th><th className="px-3 py-3">Operating state</th><th className="px-3 py-3">Set state</th></tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{personnel.map(person => <tr key={person.id} data-testid={`row-person-${person.id}`}><td className="px-5 py-4"><div className="font-extrabold">{person.name}</div><div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{person.role} · blood {person.blood}</div></td><td className="px-3 py-4"><div className="font-bold">{person.station}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">{person.phase}</div></td><td className="px-3 py-4"><Badge tone="green"><Check size={10} />{person.medical}</Badge></td><td className="px-3 py-4"><Badge tone={person.training === 'Current' ? 'green' : 'amber'}>{person.training}</Badge></td><td className="px-3 py-4"><StatusBadge status={person.status} /></td><td className="px-3 py-4"><div className="flex gap-1"><button data-testid={`button-indoor-${person.id}`} onClick={() => setPersonStatus(person.id, 'INDOOR')} className={`h-9 rounded border px-2 text-[10px] font-bold ${person.status === 'INDOOR' ? 'border-cyan-500 bg-cyan-50 text-cyan-800' : 'border-[hsl(var(--border))]'}`}>INDOOR</button><button data-testid={`button-field-${person.id}`} onClick={() => setPersonStatus(person.id, 'FIELD')} className={`h-9 rounded border px-2 text-[10px] font-bold ${person.status === 'FIELD' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-[hsl(var(--border))]'}`}>FIELD</button><button data-testid={`button-sos-${person.id}`} onClick={() => setPersonStatus(person.id, 'SOS')} className={`h-9 rounded border px-2 text-[10px] font-bold ${person.status === 'SOS' ? 'border-red-500 bg-red-50 text-red-800' : 'border-[hsl(var(--border))]'}`}>SOS</button></div></td></tr>)}</tbody></table></div></div></div>;
}

function Emergency() {
  const { emergency, simulateBlizzard, clearIncident, events } = useOps();
  const cascade = [{ icon: Users, label: 'Personnel movement', detail: emergency.active ? 'Field sorties recalled; shelter check active' : 'Normal movement protocol', state: emergency.active ? 'ACTIONED' : 'STANDBY' }, { icon: Container, label: 'Cargo handling', detail: emergency.active ? 'Maitri offload paused at bay 03' : 'Handling windows open', state: emergency.active ? 'PAUSED' : 'OPEN' }, { icon: Zap, label: 'Generator forecast', detail: emergency.active ? '+18% burn uplift applied to runway' : 'Nominal load profile', state: emergency.active ? 'ELEVATED' : 'NOMINAL' }, { icon: Anchor, label: 'Expedition milestones', detail: emergency.active ? 'Ice corridor milestone pushed +1 day' : 'Critical path holding', state: emergency.active ? 'PUSHED' : 'ON TRACK' }]; 
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="mono mb-2 text-[10px] font-bold tracking-[.2em] text-red-700">EMERGENCY COMMAND / 05</div><h1 className="condensed text-5xl font-bold uppercase leading-[.86] tracking-wide">Command<br /><span className="text-red-700">the cascade.</span></h1><p className="mt-3 max-w-xl text-sm text-[hsl(var(--muted-foreground))]">One state change. Every module responds. Recovery is explicit.</p></div><div className="flex gap-2">{emergency.active ? <Button data-testid="button-declare-recovery" variant="secondary" onClick={clearIncident}><Check size={16} />DECLARE RECOVERY</Button> : <Button data-testid="button-trigger-condition-1" variant="danger" onClick={simulateBlizzard}><CloudSnow size={16} />TRIGGER CONDITION 1</Button>}</div></div><div data-testid="panel-emergency-status" className={`overflow-hidden border ${emergency.active ? 'border-red-300 bg-red-50' : 'border-emerald-200 bg-emerald-50'} p-5`}><div className="flex flex-wrap items-start justify-between gap-5"><div className="flex gap-4"><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${emergency.active ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>{emergency.active ? <AlertOctagon size={25} /> : <ShieldCheck size={25} />}</div><div><div className={`mono text-[10px] font-bold tracking-[.18em] ${emergency.active ? 'text-red-700' : 'text-emerald-700'}`}>{emergency.active ? emergency.severity : 'SYSTEM STANDBY'}</div><h2 className={`condensed mt-1 text-3xl font-bold uppercase ${emergency.active ? 'text-red-950' : 'text-emerald-950'}`}>{emergency.type}</h2><p className={`mt-1 max-w-2xl text-xs ${emergency.active ? 'text-red-900' : 'text-emerald-900'}`}>{emergency.description}</p></div></div><div className="text-right"><div className="mono text-xs font-bold">{emergency.timestamp}</div><div className="mt-1 text-[10px] uppercase tracking-wider">last state change</div></div></div></div><div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><div className="panel p-5"><SectionTitle eyebrow="CASCADE PROPAGATION" title="Cross-module response" detail="Dependencies are visible, ordered, and reversible" /> <div className="space-y-3">{cascade.map(({ icon: Icon, label, detail, state }) => <div key={label} data-testid={`cascade-${label.toLowerCase().replaceAll(' ', '-')}`} className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] p-3"><div className={`flex h-9 w-9 items-center justify-center rounded ${emergency.active ? 'bg-red-100 text-red-700' : 'bg-[hsl(var(--muted))] text-[hsl(var(--primary))]'}`}><Icon size={17} /></div><div className="min-w-0 flex-1"><div className="text-xs font-extrabold">{label}</div><div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{detail}</div></div><Badge tone={emergency.active ? 'red' : 'slate'}>{state}</Badge></div>)}</div></div><div className="space-y-5"><div className="panel p-5"><SectionTitle eyebrow="WEATHER CLASSIFICATION" title="Maitri sector" /><div className="flex items-center justify-between rounded-md bg-[hsl(var(--sidebar))] p-4 text-white"><div><div className="mono text-[10px] text-cyan-300">METEO / 05:40 UTC</div><div className="condensed mt-1 text-3xl font-bold">WHITEOUT</div><div className="mt-1 text-[11px] text-slate-300">Visibility &lt; 120m · wind 42 kt</div></div><CloudSnow size={39} className="text-cyan-300" /></div></div><div className="panel p-5"><div className="flex items-center justify-between"><div><div className="mono text-[10px] font-bold tracking-[.16em] text-[hsl(var(--primary))]">LOCKDOWN CONTROL</div><div className="mt-1 text-sm font-extrabold">Maitri movement lockdown</div></div><button data-testid="button-lockdown-toggle" onClick={() => emergency.active ? clearIncident() : simulateBlizzard()} className={`relative h-7 w-12 rounded-full transition-colors ${emergency.lockdown ? 'bg-red-600' : 'bg-[hsl(var(--muted-foreground))]'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${emergency.lockdown ? 'translate-x-6' : 'translate-x-1'}`} /></button></div><div className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">{emergency.lockdown ? 'Lockdown active. Badge readers require command release.' : 'No movement restriction is active.'}</div></div></div></div><div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="CASCADE EVENT LOG" title="Decision record" detail="Append-only local command history" /></div><div className="max-h-64 overflow-y-auto scrollbar-thin">{events.filter(event => event.module === 'EMERGENCY').length === 0 ? <EmptyState title="No emergency events" detail="Trigger a condition to test the cascade and generate a decision record." /> : events.filter(event => event.module === 'EMERGENCY').map(event => <div key={event.id} className="flex gap-4 border-b border-[hsl(var(--border))] px-5 py-3 last:border-0"><span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{event.time}</span><span className="text-xs font-bold">{event.action}</span></div>)}</div></div></div>;
}

function NotFound() { return <div className="panel mx-auto max-w-lg p-10 text-center"><AlertTriangle className="mx-auto text-amber-500" size={30} /><h1 className="condensed mt-4 text-4xl font-bold uppercase">Signal not found</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">This command channel does not exist.</p><Link href="/" className="mt-6 inline-flex min-h-10 items-center rounded-md bg-[hsl(var(--primary))] px-4 text-xs font-bold text-white">RETURN TO OVERVIEW</Link></div>; }

function Router() {
  return <AppShell><Switch><Route path="/" component={Overview} /><Route path="/expedition" component={Expedition} /><Route path="/cargo" component={Cargo} /><Route path="/inventory" component={Inventory} /><Route path="/personnel" component={Personnel} /><Route path="/emergency" component={Emergency} /><Route component={NotFound} /></Switch></AppShell>;
}
function App() {
  const state = useOperations();
  return <QueryClientProvider client={queryClient}><TooltipProvider><StateCtx.Provider value={state}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary resetKey={location.pathname}><Router /></ErrorBoundary></WouterRouter><Toaster /></StateCtx.Provider></TooltipProvider></QueryClientProvider>;
}
export default App;