import { useCallback, useEffect, useState, createContext, useContext, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { adjustInventory, createEmergencyCascade, createEvent, createVoyage, loadOperations, resolveEmergency, updateAssetStatus, updateCargoTelemetry, updatePersonnelStatus, updateVoyageStatus as updateVoyageStatusApi } from '@/lib/operations-api';
import type { Asset, AssetStatus, CargoItem, Emergency, Event, InventoryItem, Person, ScenarioKind, Station, Status, Tone, TrackingUnit, Voyage } from '@/lib/operations-types';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import {
  Activity, AlertOctagon, AlertTriangle, Anchor, ArrowDownRight, ArrowUpRight, Boxes,
  CalendarDays, Check, ChevronRight, CircleDot, ClipboardList, CloudSnow, Container, Download,
  FileText, Gauge, HardHat, Layers3, LifeBuoy, LockKeyhole, MapPinned, Menu, PackageCheck,
  PanelLeftClose, Plus, Radio, RadioTower, RefreshCw, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Snowflake, Thermometer, Users, Wrench,
  Wifi, WifiOff, X, Zap
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip,
  XAxis, YAxis
} from 'recharts';

type StateContext = {
  stations: Station[]; voyages: Voyage[]; cargo: CargoItem[]; inventory: InventoryItem[]; personnel: Person[];
  assets: Asset[]; trackingUnits: TrackingUnit[]; events: Event[]; emergency: Emergency; operatorRequests: OperatorRequest[]; online: boolean; queued: number; realtimeConnected: boolean;
  selectedVoyageId: string | null;
  loading: boolean;
  simulateBlizzard: () => void; clearIncident: () => void; simulateAnomaly: () => void;
  addVoyage: (v: Voyage) => void; adjustStock: (sku: string, delta: number) => void;
  setPersonStatus: (id: string, status: Person['status']) => void; setAssetStatus: (id: string, status: AssetStatus) => void;
  selectVoyage: (id: string | null) => void; updateVoyageStatus: (id: string, status: Status) => void;
  reviewOperatorRequest: (id: string, decision: 'APPROVED' | 'REJECTED') => void;
  runScenario: (scenario: ScenarioKind) => void; exportAudit: () => void; toggleOnline: () => void;
};

type OperatorRequest = {
  id: string;
  operator: string;
  role: string;
  station: string;
  stationCode: string;
  request: string;
  submitted: string;
  priority: 'ROUTINE' | 'URGENT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

const operatorRequestSeed: OperatorRequest[] = [
  { id: 'REQ-204', operator: 'Ananya Rao', role: 'Field Scientist', station: 'Bharati', stationCode: 'BHT', request: 'Access cargo telemetry and weather uplink', submitted: '08:42 UTC', priority: 'URGENT', status: 'PENDING' },
  { id: 'REQ-203', operator: 'Vikram Singh', role: 'Station Commander', station: 'Maitri', stationCode: 'MAI', request: 'Approve vehicle sortie · LSV-03', submitted: '08:17 UTC', priority: 'ROUTINE', status: 'PENDING' },
  { id: 'REQ-202', operator: 'Nisha Thomas', role: 'Science Lead', station: 'Himadri', stationCode: 'HMI', request: 'Authorize science equipment transfer', submitted: '07:56 UTC', priority: 'ROUTINE', status: 'PENDING' },
  { id: 'REQ-201', operator: 'Rohan Iyer', role: 'Logistics Crew', station: 'Maitri', stationCode: 'MAI', request: 'Request temporary fuel inventory access', submitted: '07:31 UTC', priority: 'ROUTINE', status: 'PENDING' },
];

const operatorRequestDecisionsKey = 'polarlogix-operator-request-decisions';
const StateCtx = createContext<StateContext | null>(null);
const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY.');
}

const clerkAppearance = {
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#075b66',
    colorForeground: '#172236',
    colorMutedForeground: '#64748b',
    colorDanger: '#b42318',
    colorBackground: '#fffdfa',
    colorInput: '#f8fafc',
    colorInputForeground: '#172236',
    colorNeutral: '#d7e2e7',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.65rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdfa] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#172236] font-bold',
    headerSubtitle: 'text-[#64748b]',
    socialButtonsBlockButtonText: 'text-[#172236] font-semibold',
    formFieldLabel: 'text-[#172236] font-semibold',
    footerActionLink: 'text-[#075b66] font-bold',
    footerActionText: 'text-[#64748b]',
    dividerText: 'text-[#64748b]',
    identityPreviewEditButton: 'text-[#075b66]',
    formFieldSuccessText: 'text-emerald-700',
    alertText: 'text-[#b42318]',
    logoBox: 'h-12',
    logoImage: 'h-12 w-12 object-contain',
    socialButtonsBlockButton: 'border-[#d7e2e7] bg-white hover:bg-[#f1f7f8]',
    formButtonPrimary: 'bg-[#075b66] text-white hover:bg-[#064c55]',
    formFieldInput: 'border-[#d7e2e7] bg-[#f8fafc] text-[#172236]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#d7e2e7]',
    alert: 'border-red-200 bg-red-50',
    otpCodeFieldInput: 'border-[#d7e2e7] bg-[#f8fafc] text-[#172236]',
    formFieldRow: 'text-[#172236]',
    main: 'bg-transparent',
  },
};

const useOps = () => {
  const context = useContext(StateCtx);
  if (!context) throw new Error('Operations state unavailable');
  return context;
};

function useOperations(): StateContext & { loading: boolean } {
  const [loading, setLoading] = useState(true);
  const [stationState, setStationState] = useState<Station[]>([]);
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [selectedVoyageId, setSelectedVoyageId] = useState<string | null>(null);
  const [cargo, setCargo] = useState<CargoItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [personnel, setPersonnel] = useState<Person[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [trackingUnits, setTrackingUnits] = useState<TrackingUnit[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [emergency, setEmergency] = useState<Emergency>({ type: 'No active incidents', severity: 'STANDBY', description: 'All stations operating within command parameters.', active: false, lockdown: false, timestamp: '—' });
  const [operatorDecisions, setOperatorDecisions] = useState<Record<string, 'APPROVED' | 'REJECTED'>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(operatorRequestDecisionsKey) || '{}') as Record<string, 'APPROVED' | 'REJECTED'>;
    } catch {
      return {};
    }
  });
  const [online, setOnline] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof loadOperations>>) => {
    setStationState(snapshot.stations);
    setVoyages(snapshot.voyages);
    setCargo(snapshot.cargo);
    setInventory(snapshot.inventory);
    setPersonnel(snapshot.personnel);
    setAssets(snapshot.assets);
    setTrackingUnits(snapshot.trackingUnits || []);
    setEvents(snapshot.events);
    setEmergency(snapshot.emergency);
    setOnline(true);
    setRealtimeConnected(true);
  }, []);
  const refresh = useCallback(async () => {
    try {
      applySnapshot(await loadOperations());
    } catch (error) {
      setOnline(false);
      setRealtimeConnected(false);
      console.error(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 10000);
    return () => window.clearInterval(interval);
  }, [refresh]);
  const commit = useCallback((write: Promise<unknown>, event?: { module: string; action: string; tone?: Tone }) => {
    void write.then(() => event ? createEvent(event) : undefined).then(() => refresh()).catch(error => console.error(error));
  }, [refresh]);
  const register = useCallback((module: string, action: string, tone: Tone = 'cyan') => {
    commit(createEvent({ module, action, tone }));
  }, [commit]);
  const simulateBlizzard = useCallback(() => {
    const stationId = stationState.find(station => station.name === 'Maitri')?.id;
    const cargoIds = cargo.filter(item => item.destination === 'Maitri' && item.id).map(item => item.id as string);
    const voyageIds = voyages.filter(voyage => voyage.status === 'UNDERWAY').map(voyage => voyage.id);
    const description = 'Whiteout wall approaching Maitri west sector. Field movement suspended pending visibility recovery.';
    commit(createEmergencyCascade({ stationId, severity: 'LEVEL_3_LIFE_THREATENING', incidentType: 'BLIZZARD_COND_1', description, lockdown: true }, cargoIds, voyageIds), { module: 'EMERGENCY', action: 'Condition 1 cascade executed · field sorties recalled', tone: 'red' });
  }, [cargo, commit, stationState, voyages]);
  const clearIncident = useCallback(() => {
    commit(resolveEmergency(emergency.incidentId), { module: 'EMERGENCY', action: 'Recovery state declared · command restrictions lifted', tone: 'green' });
  }, [commit, emergency.incidentId]);
  const simulateAnomaly = useCallback(() => {
    const target = cargo.find(item => item.tracking === 'PLX-804-19');
    if (target) commit(updateCargoTelemetry({ ...target, temperature: -8.6, status: 'CRITICAL' }), { module: 'CARGO', action: 'Anomaly injected · PLX-804-19 cold-chain excursion', tone: 'red' });
  }, [cargo, commit]);
  const addVoyage = useCallback((voyage: Voyage) => {
    commit(createVoyage(voyage), { module: 'EXPEDITION', action: `Voyage plan created · ${voyage.expedition}`, tone: 'green' });
  }, [commit]);
  const adjustStock = useCallback((sku: string, delta: number) => {
    const item = inventory.find(value => value.sku === sku);
    commit(adjustInventory(sku, delta), { module: 'INVENTORY', action: `${item?.name || sku} adjusted ${delta > 0 ? '+' : ''}${delta}`, tone: 'amber' });
  }, [commit, inventory]);
  const setPersonStatus = useCallback((id: string, status: Person['status']) => {
    const person = personnel.find(value => value.id === id);
    commit(updatePersonnelStatus(id, status), { module: 'PERSONNEL', action: `${person?.name || id} marked ${status}`, tone: status === 'SOS' ? 'red' : 'cyan' });
  }, [commit, personnel]);
  const setAssetStatus = useCallback((id: string, status: AssetStatus) => {
    const asset = assets.find(value => value.id === id);
    commit(updateAssetStatus(id, status), { module: 'ASSETS', action: `${asset?.name || id} marked ${status}`, tone: status === 'MAINTENANCE DUE' || status === 'GROUNDED' ? 'amber' : 'green' });
  }, [assets, commit]);
  const selectVoyage = useCallback((id: string | null) => {
    setSelectedVoyageId(id);
  }, []);
  const updateVoyageStatus = useCallback((id: string, status: Status) => {
    const voyage = voyages.find(value => value.id === id);
    commit(updateVoyageStatusApi(id, status), { module: 'EXPEDITION', action: `${voyage?.expedition || id} marked ${status}`, tone: status === 'DELAYED' ? 'amber' : 'cyan' });
  }, [commit, voyages]);
  const runScenario = useCallback((scenario: ScenarioKind) => {
    if (scenario === 'weather-degradation') simulateBlizzard();
    if (scenario === 'cargo-failure') simulateAnomaly();
    if (scenario === 'vessel-delay') {
      const target = voyages.find(voyage => voyage.status !== 'DELAYED');
      if (target) {
        commit(updateVoyageStatusApi(target.id, 'DELAYED'), { module: 'SCENARIO', action: `${target.expedition} delayed by one day`, tone: 'amber' });
      }
    }
  }, [commit, simulateAnomaly, simulateBlizzard, voyages]);
  const exportAudit = useCallback(() => {
    const csv = ['UTC,MODULE,COMMAND,JUSTIFICATION', ...events.map(event => [event.time, event.module, `"${event.action.replaceAll('"', '""')}"`, `"${event.justification || 'Recorded from command console.'}"`].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'polarlogix-command-audit.csv'; anchor.click(); URL.revokeObjectURL(url);
  }, [events]);
  const toggleOnline = useCallback(() => {
    void refresh();
  }, [refresh]);
  const operatorRequests = operatorRequestSeed.map(request => ({
    ...request,
    status: operatorDecisions[request.id] || request.status,
  }));
  const reviewOperatorRequest = useCallback((id: string, decision: 'APPROVED' | 'REJECTED') => {
    const request = operatorRequestSeed.find(item => item.id === id);
    if (!request) return;
    setOperatorDecisions(previous => {
      const next = { ...previous, [id]: decision };
      window.localStorage.setItem(operatorRequestDecisionsKey, JSON.stringify(next));
      return next;
    });
    void createEvent({
      module: 'AUTHORITY',
      action: `Operator access ${decision === 'APPROVED' ? 'approved' : 'rejected'} · ${request.operator} / ${request.station}`,
      tone: decision === 'APPROVED' ? 'green' : 'red',
      justification: `${request.request} · ${request.id}`,
    }).then(() => refresh()).catch(error => console.error(error));
  }, [refresh]);

  return { stations: stationState, voyages, cargo, inventory, personnel, assets, trackingUnits, events, emergency, operatorRequests, online, queued: 0, realtimeConnected, selectedVoyageId, simulateBlizzard, clearIncident, simulateAnomaly, addVoyage, adjustStock, setPersonStatus, setAssetStatus, selectVoyage, updateVoyageStatus, reviewOperatorRequest, runScenario, exportAudit, toggleOnline, loading };
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
  const links = [
    { href: '/', label: 'Operations overview', icon: Gauge },
    { href: '/expedition', label: 'Expedition control', icon: Anchor },
    { href: '/cargo', label: 'Cargo telemetry', icon: Container },
    { href: '/inventory', label: 'Inventory & burn', icon: Boxes },
    { href: '/personnel', label: 'Personnel readiness', icon: Users },
    { href: '/emergency', label: 'Emergency command', icon: AlertOctagon },
    { href: '/assets', label: 'Asset management', icon: Wrench },
    { href: '/map', label: 'Map & corridors', icon: MapPinned },
    { href: '/field', label: 'Field companion', icon: RadioTower },
    { href: '/audit', label: 'Audit & reports', icon: ClipboardList },
    { href: '/scenarios', label: 'Scenario planner', icon: SlidersHorizontal },
  ];
  return <aside className="fixed inset-y-0 left-0 z-50 hidden w-[252px] flex-col overflow-y-auto border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] md:flex">
    <div className="border-b border-[hsl(var(--sidebar-border))] px-5 py-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"><Snowflake size={21} /></div>
        <div>
          <div className="condensed text-[22px] font-bold uppercase tracking-wider text-white">Polar<span className="text-[hsl(var(--sidebar-primary))]">Logix</span></div>
          <div className="mono text-[9px] tracking-[.16em] text-slate-400">OPERATIONS / NCPOR</div>
        </div>
      </div>
    </div>
    <div className="px-3 py-5">
      <div className="mono mb-2 px-3 text-[9px] tracking-[.18em] text-slate-500">COMMAND MODULES</div>
      <nav className="space-y-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          return <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex min-h-11 items-center gap-3 rounded-md px-3 text-xs font-bold transition-colors ${active ? 'bg-[hsl(var(--sidebar-accent))] text-white shadow-sm' : 'text-slate-400 hover:bg-[hsl(var(--sidebar-accent)/.75)] hover:text-white'}`}><Icon size={17} className={active ? 'text-[hsl(var(--sidebar-primary))]' : 'text-slate-500 group-hover:text-[hsl(var(--sidebar-primary))]'} /><span>{label}</span>{active && <ChevronRight size={14} className="ml-auto text-[hsl(var(--sidebar-primary))]" />}</Link>;
        })}
      </nav>
    </div>
    <div className="mt-auto border-t border-[hsl(var(--sidebar-border))] p-4">
      <div className="mb-3 flex items-center justify-between"><span className="mono text-[9px] tracking-[.14em] text-slate-500">STATION NETWORK</span><span className="h-2 w-2 rounded-full bg-emerald-400 pulse-dot" /></div>
      <div className="space-y-2">{stationState.slice(0, 3).map(station => <div key={station.code} className="flex items-center justify-between text-[11px]"><span className="font-bold text-slate-300">{station.name}</span><span className="mono text-slate-500">{station.occupancy}/{station.capacity}</span></div>)}</div>
    </div>
  </aside>;
}

function Header() {
  const { emergency, online, queued, realtimeConnected, toggleOnline } = useOps();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [time, setTime] = useState(new Date());
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setTime(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const mobileLinks = [{ href: '/', label: 'Overview' }, { href: '/expedition', label: 'Expedition' }, { href: '/cargo', label: 'Cargo' }, { href: '/inventory', label: 'Inventory' }, { href: '/personnel', label: 'Personnel' }, { href: '/emergency', label: 'Emergency' }, { href: '/assets', label: 'Assets' }, { href: '/map', label: 'Map' }, { href: '/field', label: 'Field' }, { href: '/audit', label: 'Audit' }, { href: '/scenarios', label: 'Scenarios' }];
  return <><header className={`sticky top-0 z-40 flex min-h-[70px] items-center justify-between gap-3 border-b px-4 backdrop-blur-md transition-colors md:px-7 ${emergency.active ? 'border-red-700 bg-red-600 text-white' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.92)]'}`}><div className="flex items-center gap-3"><button data-testid="button-mobile-menu" onClick={() => setMobileOpen(value => !value)} className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--sidebar))] text-cyan-300 md:hidden">{mobileOpen ? <X size={18} /> : <Menu size={18} />}</button><div><div className={`mono text-[10px] font-bold tracking-[.16em] ${emergency.active ? 'text-red-100' : 'text-[hsl(var(--muted-foreground))]'}`}>NATIONAL CENTRE FOR POLAR & OCEAN RESEARCH</div><div className="mt-1 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${emergency.active ? 'bg-white' : 'bg-emerald-500'} pulse-dot`} /><span className="text-xs font-extrabold">LIVE OPERATIONS FEED</span>{emergency.active && <Badge tone="red"><AlertTriangle size={10} />{emergency.severity}</Badge>}</div></div></div><div className="flex items-center gap-2"><button data-testid="button-network-toggle" onClick={toggleOnline} className={`flex min-h-10 items-center gap-2 rounded-md border px-2 text-[10px] font-extrabold tracking-wide sm:px-3 ${online ? realtimeConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{online && realtimeConnected ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? queued ? `${queued} QUEUED` : realtimeConnected ? 'SYNCED' : 'LINK DEGRADED' : 'OFFLINE'}<span className="sr-only">Refresh database snapshot</span></button><div className="hidden text-right lg:block"><div className="mono text-xs font-bold">{time.toISOString().slice(11, 19)} UTC</div><div className={`text-[10px] ${emergency.active ? 'text-red-100' : 'text-[hsl(var(--muted-foreground))]'}`}>{user?.primaryEmailAddress?.emailAddress || user?.fullName || 'AUTHENTICATED OPERATOR'}</div></div><button data-testid="button-sign-out" onClick={() => void signOut({ redirectUrl: basePath || '/' })} className={`flex h-10 items-center gap-2 rounded-md border px-3 text-[10px] font-extrabold tracking-wide ${emergency.active ? 'border-red-300 text-white hover:bg-red-700' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`}>SIGN OUT</button></div></header>{mobileOpen && <nav className="border-b border-[hsl(var(--border))] bg-[hsl(var(--sidebar))] p-3 md:hidden">{mobileLinks.map(link => <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} data-testid={`link-mobile-${link.label.toLowerCase()}`} className="flex min-h-11 items-center border-b border-[hsl(var(--sidebar-border))] px-3 text-xs font-bold text-slate-200 last:border-0">{link.label}</Link>)}</nav>}</>;
}

function AppShell({ children }: { children: ReactNode }) {
  const { loading, emergency } = useOps();
  return <div className="texture flex min-h-[100dvh] bg-[hsl(var(--background))]"><Sidebar /><div className="min-w-0 flex-1 md:ml-[252px]"><Header />{emergency.active && <div data-testid="status-global-alert" className="flex items-center gap-3 border-b border-red-700 bg-red-500 px-4 py-2 text-xs font-extrabold text-white md:px-7"><AlertOctagon size={16} className="shrink-0" /><span>CONDITION 1 LOCKDOWN · FIELD MOVEMENT SUSPENDED · MANDATORY MUSTER ACTIVE</span><Link href="/emergency" className="ml-auto underline">COMMAND CENTER</Link></div>}<main className="mx-auto max-w-[1600px] p-4 md:p-7">{loading ? <div className="space-y-5"><Skeleton className="h-10 w-72" /><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-32" />)}</div><Skeleton className="h-80" /></div> : children}</main></div></div>;
}

function OperatorApprovalQueue() {
  const { operatorRequests, reviewOperatorRequest } = useOps();
  const pending = operatorRequests.filter(request => request.status === 'PENDING');
  const decided = operatorRequests.filter(request => request.status !== 'PENDING');
  return <section className="panel p-5 reveal">
    <SectionTitle
      eyebrow="COMMAND AUTHORITY / ACCESS CONTROL"
      title="Operator approvals"
      detail="Station requests stay pending until central command makes the decision."
      action={<Badge tone={pending.length ? 'amber' : 'green'}><Radio size={11} />{pending.length} WAITING FOR APPROVAL</Badge>}
    />
    {pending.length ? <div className="grid gap-3 lg:grid-cols-2">{pending.map(request => <div key={request.id} data-testid={`card-operator-request-${request.id}`} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-800"><Users size={18} /></div>
          <div className="min-w-0"><div className="truncate text-sm font-extrabold">{request.operator}</div><div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{request.role}</div></div>
        </div>
        <Badge tone={request.priority === 'URGENT' ? 'red' : 'slate'}>{request.priority}</Badge>
      </div>
      <div className="mt-4 rounded-md bg-[hsl(var(--muted)/.55)] p-3">
        <div className="mono text-[9px] font-bold tracking-[.16em] text-[hsl(var(--muted-foreground))]">REQUEST / {request.id}</div>
        <div className="mt-1 text-xs font-bold leading-relaxed">{request.request}</div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]"><span className="inline-flex items-center gap-1"><MapPinned size={12} />{request.station} / {request.stationCode}</span><span>{request.submitted}</span></div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button data-testid={`button-reject-request-${request.id}`} variant="ghost" className="border border-red-200 text-red-700 hover:bg-red-50" onClick={() => reviewOperatorRequest(request.id, 'REJECTED')}><X size={14} />REJECT</Button>
        <Button data-testid={`button-approve-request-${request.id}`} onClick={() => reviewOperatorRequest(request.id, 'APPROVED')}><Check size={14} />APPROVE</Button>
      </div>
    </div>)}</div> : <EmptyState title="No pending operator requests" detail="All station access requests have a recorded command decision." />}
    {decided.length > 0 && <div className="mt-5 border-t border-[hsl(var(--border))] pt-4"><div className="mono text-[9px] font-bold tracking-[.16em] text-[hsl(var(--muted-foreground))]">RECENT COMMAND DECISIONS</div><div className="mt-2 flex flex-wrap gap-2">{decided.map(request => <Badge key={request.id} tone={request.status === 'APPROVED' ? 'green' : 'red'}><ShieldCheck size={10} />{request.operator} · {request.status}</Badge>)}</div></div>}
  </section>;
}

function Overview() {
  const { stations: stationState, voyages, cargo, inventory, personnel, events, emergency, simulateBlizzard } = useOps();
  const field = personnel.filter(person => person.status === 'FIELD').length;
  const criticalCargo = cargo.filter(item => item.status === 'CRITICAL').length;
  const coldChainLoads = cargo.filter(item => item.coldChain).length;
  const shockWatch = cargo.filter(item => item.shock >= 1.5).length;
  const fuelInventory = inventory.filter(item => item.category.includes('FUEL'));
  const fuelDays = fuelInventory.reduce((total, item) => total + (item.dailyBurn ? item.quantity / item.dailyBurn : 0), 0);
  const activeVoyages = voyages.filter(voyage => ['UNDERWAY', 'DELAYED'].includes(voyage.status)).length;
  return <div className="space-y-6"><div className="reveal flex flex-wrap items-end justify-between gap-4"><div><div className="mono mb-2 text-[10px] font-bold tracking-[.2em] text-[hsl(var(--primary))]">COMMAND CENTRE / 00</div><h1 className="condensed text-5xl font-bold uppercase leading-[.86] tracking-wide md:text-6xl">Command centre<br /><span className="text-[hsl(var(--primary))]">at a glance.</span></h1><p className="mt-3 max-w-xl text-sm text-[hsl(var(--muted-foreground))]">Central authority for station access, expedition readiness, and the decisions that keep every operator moving safely.</p></div><Button data-testid="button-simulate-blizzard" variant={emergency.active ? 'secondary' : 'danger'} onClick={simulateBlizzard}>{emergency.active ? <LockKeyhole size={15} /> : <CloudSnow size={15} />}{emergency.active ? 'CONDITION 1 ACTIVE' : 'SIMULATE CONDITION 1'}</Button></div>{emergency.active && <div data-testid="status-active-cascade" className="reveal flex flex-wrap items-center justify-between gap-3 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-red-900"><div className="flex items-center gap-3"><AlertOctagon size={20} /><div><div className="text-xs font-extrabold tracking-wide">EMERGENCY CASCADE PROPAGATED</div><div className="text-xs">Field sorties recalled · cargo handling paused · generator forecast +18%</div></div></div><Link href="/emergency" className="text-xs font-extrabold underline">OPEN COMMAND CENTER</Link></div>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{<Metric label="ACTIVE VOYAGES" value={String(activeVoyages).padStart(2, '0')} detail={`${voyages.filter(voyage => voyage.status === 'DELAYED').length} delayed in ice corridor`} icon={Anchor} trend="up" />}{<Metric label="PERSONNEL ACCOUNTED" value={`${personnel.filter(person => person.status !== 'SOS').length}/${personnel.length}`} detail={`${field} currently in field`} icon={Users} tone={personnel.some(person => person.status === 'SOS') ? 'red' : 'green'} />}{<Metric label="CARGO EXCEPTIONS" value={String(criticalCargo).padStart(2, '0')} detail={`${coldChainLoads} cold-chain · ${shockWatch} shock watch`} icon={Container} tone={criticalCargo ? 'amber' : 'green'} />}{<Metric label="FUEL COVERAGE" value={`${fuelDays.toFixed(1)}d`} detail={emergency.active ? '18% burn uplift forecast' : 'at current burn rate'} icon={Zap} tone={emergency.active ? 'amber' : 'cyan'} trend="down" />}</div><OperatorApprovalQueue /><div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]"><div className="panel p-5 reveal reveal-delay-1"><SectionTitle eyebrow="STATION PICTURE / LIVE" title="Theatre status" detail="Occupancy, weather, and readiness by node" action={<Link href="/personnel" className="text-xs font-bold text-[hsl(var(--primary))]">Muster detail <ChevronRight size={14} className="inline" /></Link>} /><div className="grid gap-3 sm:grid-cols-2">{stationState.map(station => <div key={station.code} data-testid={`card-station-${station.code.toLowerCase()}`} className="group rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 transition-colors hover:border-[hsl(var(--primary)/.45)]"><div className="flex items-start justify-between"><div><div className="mono text-[10px] font-bold tracking-[.15em] text-[hsl(var(--primary))]">{station.code} / {station.coordinates}</div><div className="mt-1 text-base font-extrabold">{station.name}</div></div><StatusBadge status={station.code === 'MAI' && emergency.active ? 'RECALLED' : 'ON STATION'} /></div><div className="mt-4 flex items-end justify-between"><div><div className="text-[11px] text-[hsl(var(--muted-foreground))]">{station.theatre}</div><div className="mt-1 flex items-center gap-2 text-xs font-bold"><CloudSnow size={13} />{station.weather}</div></div><div className="text-right"><div className="mono text-sm font-bold">{station.occupancy}<span className="text-[hsl(var(--muted-foreground))]">/{station.capacity}</span></div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">occupancy</div></div></div></div>)}</div></div><div className="panel p-5 reveal reveal-delay-2"><SectionTitle eyebrow="COMMAND LOG / UTC" title="Activity feed" action={<Activity size={18} className="text-[hsl(var(--primary))]" />} /><div className="space-y-1">{events.slice(0, 6).map(event => <div key={event.id} data-testid={`event-${event.id}`} className="flex gap-3 border-b border-[hsl(var(--border)/.75)] py-3 last:border-0"><div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.tone === 'red' ? 'bg-red-500' : event.tone === 'amber' ? 'bg-amber-400' : event.tone === 'green' ? 'bg-emerald-500' : 'bg-cyan-600'}`} /><div className="min-w-0"><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{event.time} · {event.module}</div><div className="mt-0.5 text-xs font-semibold leading-relaxed">{event.action}</div></div></div>)}</div></div></div></div>;
}

function VoyageDetailModal({ voyage, onClose }: { voyage: Voyage; onClose: () => void }) {
  const { emergency, updateVoyageStatus } = useOps();
  const [actionState, setActionState] = useState('');
  const destination = voyage.route.split('→').at(-1)?.trim() || 'Maitri';
  const visualTone = voyage.id.endsWith('46') ? 'from-slate-700 to-indigo-950' : voyage.id.endsWith('45') ? 'from-cyan-700 to-slate-950' : 'from-amber-600 to-slate-950';
  const act = (label: string, status?: Status) => {
    if (status) updateVoyageStatus(voyage.id, status);
    setActionState(label);
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[hsl(var(--sidebar)/.78)] p-4">
    <div role="dialog" aria-modal="true" className="panel w-full max-w-5xl overflow-hidden shadow-2xl">
      <div className="flex items-start justify-between border-b border-[hsl(var(--border))] p-5"><div><div className="mono text-[10px] font-bold tracking-[.18em] text-[hsl(var(--primary))]">OPERATIONAL RECORD / {voyage.expedition}</div><h2 className="condensed mt-1 text-4xl font-bold uppercase">{voyage.vessel}</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{voyage.route} · {voyage.polarClass} · selected from fleet board</p></div><button data-testid="button-close-voyage-detail" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><X size={19} /></button></div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1.05fr_.95fr]">
        <div className={`relative min-h-[300px] overflow-hidden rounded-xl bg-gradient-to-br ${visualTone} p-6 text-white shadow-inner`}><div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(135deg, transparent 48%, rgba(255,255,255,.35) 49%, transparent 50%), linear-gradient(45deg, transparent 48%, rgba(255,255,255,.22) 49%, transparent 50%)', backgroundSize: '42px 42px' }} /><div className="relative z-10 flex items-start justify-between"><div><div className="mono text-[10px] tracking-[.2em] text-cyan-200">3D VESSEL PROFILE</div><div className="mt-2 text-xs text-slate-200">LIVE MODEL / {voyage.status}</div></div><Anchor className="text-amber-300" size={26} /></div><div className="ship-scene relative z-10 mt-12"><div className="ship-hull mx-auto h-20 w-[78%] skew-x-[-18deg] rounded-[35%_12%_28%_18%] border-2 border-white/40 bg-gradient-to-br from-slate-100 via-slate-400 to-slate-700 shadow-[18px_20px_0_rgba(0,0,0,.24)]"><div className="ml-[22%] mt-4 h-12 w-[45%] skew-x-[18deg] rounded-md bg-gradient-to-b from-white to-slate-300 shadow-md"><div className="mx-auto mt-2 h-2 w-16 rounded bg-cyan-700/70" /><div className="mx-auto mt-2 h-1 w-24 bg-slate-500/50" /></div><div className="absolute bottom-3 left-[16%] h-2 w-[60%] rounded bg-amber-400/90" /></div><div className="mx-auto mt-5 h-4 w-[70%] rounded-full bg-black/35 blur-sm" /></div><div className="relative z-10 mt-8 flex items-end justify-between"><div><div className="condensed text-2xl font-bold uppercase">{destination} corridor</div><div className="text-[11px] text-slate-300">Profile view adapts to the selected vessel record.</div></div><Badge tone={voyage.status === 'DELAYED' ? 'red' : 'cyan'}>{voyage.status}</Badge></div></div>
        <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['STATUS', voyage.status], ['ICE ENTRY', voyage.iceEntry], ['DEPARTURE', voyage.departure], ['DELAY', voyage.delay ? `+${voyage.delay} DAY` : 'ON PLAN']].map(([label, value]) => <div key={label} className="rounded-lg border border-[hsl(var(--border))] p-3"><div className="mono text-[9px] font-bold tracking-[.12em] text-[hsl(var(--muted-foreground))]">{label}</div><div className="mt-2 text-xs font-extrabold">{value}</div></div>)}</div><div className="rounded-lg border border-[hsl(var(--border))] p-4"><div className="mono text-[10px] font-bold tracking-[.16em] text-[hsl(var(--primary))]">MISSION TELEMETRY</div><div className="mt-3 space-y-3 text-xs"><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Navigation state</span><strong>{voyage.status === 'UNDERWAY' ? 'Ice corridor transit' : voyage.status === 'DELAYED' ? 'Holding outside ice edge' : 'Ready for departure'}</strong></div><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Destination node</span><strong>{destination} / polar logistics cell</strong></div><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Weather watch</span><strong>{emergency.active ? 'Condition 1 · restricted' : 'Nominal watch · 2.4m swell'}</strong></div></div></div><div className="rounded-lg bg-[hsl(var(--muted)/.55)] p-4"><div className="text-xs font-extrabold">Operational actions</div><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => act('Voyage marked ready', 'READY')}>MARK READY</Button><Button variant="primary" onClick={() => act('Voyage released underway', 'UNDERWAY')}>RELEASE UNDERWAY</Button><Button variant="danger" onClick={() => act('Voyage delayed by command', 'DELAYED')}>HOLD / DELAY</Button></div>{actionState && <div className="mt-3 text-[11px] font-bold text-emerald-700">{actionState} · recorded in command state.</div>}</div></div>
      </div>
    </div>
  </div>;
}

function Expedition() {
  const { voyages, addVoyage, selectedVoyageId, selectVoyage } = useOps();
  const [modal, setModal] = useState(false);
  const milestones = [{ label: 'Port departure', date: '18 JAN', state: 'complete' }, { label: 'Southern Ocean', date: '23 JAN', state: 'complete' }, { label: 'Ice entry', date: '31 JAN', state: 'active' }, { label: 'Maitri offload', date: '04 FEB', state: 'next' }, { label: 'Return window', date: '18 FEB', state: 'next' }];
 return <div className="space-y-6"><SectionTitle eyebrow="EXPEDITION CONTROL / 01" title="Voyage planning" detail="Critical path across ice corridors" action={<Button data-testid="button-create-voyage" onClick={() => setModal(true)}><Plus size={16} />CREATE VOYAGE</Button>} /><div className="grid gap-4 md:grid-cols-3"><Metric label="NEXT ICE ENTRY" value="31 JAN" detail="MV Vasundhara · 14:00 UTC" icon={CalendarDays} /><Metric label="FLEET READINESS" value="94%" detail="2 vessels ready to sail" icon={ShieldCheck} tone="green" /><Metric label="PATH RISK" value="MODERATE" detail="Maitri weather watch active" icon={CloudSnow} tone="amber" /></div><div className="panel overflow-hidden p-5"><SectionTitle eyebrow="CRITICAL PATH / NCPOR-44" title="Ice corridor timeline" detail="MV Vasundhara · PC-6 · Cape Town → Maitri" /><div className="grid-lines overflow-x-auto rounded-md border border-[hsl(var(--border))] p-6"><div className="min-w-[700px]"><div className="relative mb-10 h-1 rounded bg-[hsl(var(--border))]"><div className="absolute left-0 top-0 h-1 w-[62%] rounded bg-[hsl(var(--primary))]" />{milestones.map((milestone, index) => <div key={milestone.label} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${index * 25}%` }}><div className={`h-4 w-4 rounded-full border-4 border-[hsl(var(--card))] ${milestone.state === 'complete' ? 'bg-[hsl(var(--primary))]' : milestone.state === 'active' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted-foreground))]'}`} /></div>)}</div><div className="grid grid-cols-5 gap-3">{milestones.map(milestone => <div key={milestone.label}><div className="mono text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{milestone.date}</div><div className="mt-1 text-xs font-bold">{milestone.label}</div><div className="mt-2"><Badge tone={milestone.state === 'complete' ? 'green' : milestone.state === 'active' ? 'amber' : 'slate'}>{milestone.state}</Badge></div></div>)}</div></div></div></div><div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="FLEET BOARD" title="Mission plans" detail="Select a voyage to open its operational record" /></div><div className="divide-y divide-[hsl(var(--border))]">{voyages.length === 0 ? <EmptyState title="No mission plans" detail="Create a voyage plan to establish the first critical path." /> : voyages.map(voyage => <div key={voyage.id} data-testid={`row-voyage-${voyage.id}`} className={`grid gap-3 px-5 py-4 md:grid-cols-[1.1fr_1.2fr_1fr_1fr_auto] md:items-center ${selectedVoyageId === voyage.id ? 'bg-cyan-50/60' : ''}`}><div><div className="mono text-[10px] text-[hsl(var(--primary))]">{voyage.expedition} · {voyage.polarClass}</div><div className="mt-1 font-extrabold">{voyage.vessel}</div></div><div><div className="text-xs font-semibold">{voyage.route}</div><div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Departure {voyage.departure}</div></div><div><div className="mono text-xs">{voyage.iceEntry}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">ice entry ETA</div></div><div><StatusBadge status={voyage.status} />{voyage.delay > 0 && <span className="ml-2 text-[10px] font-bold text-red-700">+{voyage.delay}d</span>}</div><button data-testid={`button-open-voyage-${voyage.id}`} onClick={() => selectVoyage(voyage.id)} className="flex h-10 items-center justify-center rounded-md border border-[hsl(var(--border))] px-3 text-xs font-bold hover:bg-[hsl(var(--muted))]">OPEN <ChevronRight size={14} /></button></div>)}</div>{selectedVoyageId && voyages.find(item => item.id === selectedVoyageId) && <VoyageDetailModal voyage={voyages.find(item => item.id === selectedVoyageId) as Voyage} onClose={() => selectVoyage(null)} />}{modal && <VoyageModal onClose={() => setModal(false)} onCreate={voyage => { addVoyage(voyage); setModal(false); }} />}</div></div>;
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

function AssetDetailModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { emergency, setAssetStatus } = useOps();
  const nextStatus: Record<AssetStatus, AssetStatus> = { READY: 'IN USE', 'IN USE': 'READY', 'MAINTENANCE DUE': 'READY', GROUNDED: 'READY', OFFLINE: 'READY' };
  const modelClass = asset.category === 'VEHICLE' ? 'asset-model--vehicle' : asset.category === 'GENERATOR' ? 'asset-model--generator' : asset.category === 'SCIENCE INSTRUMENT' ? 'asset-model--instrument' : 'asset-model--container';
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[hsl(var(--sidebar)/.78)] p-4"><div role="dialog" aria-modal="true" className="panel w-full max-w-4xl overflow-hidden shadow-2xl">
    <div className="flex items-start justify-between border-b border-[hsl(var(--border))] p-5"><div><div className="mono text-[10px] font-bold tracking-[.18em] text-[hsl(var(--primary))]">ASSET RECORD / {asset.id}</div><h2 className="condensed mt-1 text-4xl font-bold uppercase">{asset.name}</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{asset.category} · {asset.location} · criticality {asset.criticality}</p></div><button data-testid="button-close-asset-detail" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><X size={19} /></button></div>
    <div className="grid gap-5 p-5 md:grid-cols-[.9fr_1.1fr]"><div className={`asset-model ${modelClass}`}><div className="mono relative z-10 text-[10px] font-bold tracking-[.18em] text-cyan-100">3D ASSET PROFILE</div><div className="asset-model__shape" /><div className="relative z-10 mt-auto"><div className="condensed text-2xl font-bold uppercase">{asset.category}</div><div className="text-[11px] text-slate-300">Record-specific visual / {asset.status}</div></div></div>
      <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-[hsl(var(--border))] p-3"><div className="mono text-[9px] text-[hsl(var(--muted-foreground))]">CURRENT STATE</div><div className="mt-2 text-xs font-extrabold">{asset.status}</div></div><div className="rounded-lg border border-[hsl(var(--border))] p-3"><div className="mono text-[9px] text-[hsl(var(--muted-foreground))]">NEXT SERVICE</div><div className="mt-2 text-xs font-extrabold">{asset.nextMaintenance}</div></div></div><div className="rounded-lg border border-[hsl(var(--border))] p-4"><div className="mono text-[10px] font-bold tracking-[.16em] text-[hsl(var(--primary))]">READINESS CHECK</div><div className="mt-3 space-y-3 text-xs"><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Assigned location</span><strong>{asset.location}</strong></div><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Mission criticality</span><strong>{asset.criticality === 'V' ? 'Vital' : asset.criticality === 'E' ? 'Essential' : 'Desirable'}</strong></div><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Movement control</span><strong>{emergency.active && asset.category === 'VEHICLE' ? 'Restricted' : 'Available'}</strong></div></div></div><div className="rounded-lg bg-[hsl(var(--muted)/.55)] p-4"><div className="text-xs font-extrabold">Asset actions</div><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={emergency.active && asset.category === 'VEHICLE'} onClick={() => setAssetStatus(asset.id, nextStatus[asset.status])}>{asset.status === 'IN USE' ? 'RETURN TO READY' : 'MARK IN USE'}</Button><Button variant={asset.status === 'MAINTENANCE DUE' ? 'danger' : 'ghost'} onClick={() => setAssetStatus(asset.id, 'READY')}>CLEAR SERVICE FLAG</Button></div></div></div>
    </div>
  </div></div>;
}

function Assets() {
  const { assets, setAssetStatus, emergency } = useOps();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const maintenance = assets.filter(asset => asset.status === 'MAINTENANCE DUE' || asset.status === 'GROUNDED').length;
  const active = assets.filter(asset => asset.status === 'IN USE').length;
  const categories = ['VEHICLE', 'GENERATOR', 'SCIENCE INSTRUMENT', 'CONTAINER'] as const;
  const nextStatus: Record<AssetStatus, AssetStatus> = { READY: 'IN USE', 'IN USE': 'READY', 'MAINTENANCE DUE': 'READY', GROUNDED: 'READY', OFFLINE: 'READY' };
  return <div className="space-y-6">
    <SectionTitle eyebrow="ASSET MANAGEMENT / 06" title="Fleet & equipment" detail="Operational assets, maintenance windows, and field availability" action={<Badge tone={maintenance ? 'amber' : 'green'}><Wrench size={11} />{maintenance ? `${maintenance} NEED REVIEW` : 'ALL CLEAR'}</Badge>} />
    <div className="grid gap-4 sm:grid-cols-3"><Metric label="ASSETS REGISTERED" value={String(assets.length).padStart(2, '0')} detail="Vehicles, generators, instruments, pods" icon={Wrench} /><Metric label="IN FIELD" value={String(active).padStart(2, '0')} detail="Currently assigned to an operation" icon={RadioTower} tone="amber" /><Metric label="MAINTENANCE DUE" value={String(maintenance).padStart(2, '0')} detail="Requires service before next sortie" icon={RefreshCw} tone={maintenance ? 'red' : 'green'} /></div>
    {categories.map(category => <div key={category} className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow={category} title={category === 'SCIENCE INSTRUMENT' ? 'Science systems' : `${category.toLowerCase()} register`} detail={`${assets.filter(asset => asset.category === category).length} registered assets`} /></div><div className="divide-y divide-[hsl(var(--border))]">{assets.filter(asset => asset.category === category).map(asset => <div key={asset.id} data-testid={`row-asset-${asset.id}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_1fr_1fr_auto_auto] md:items-center"><div><div className="mono text-[10px] font-bold tracking-[.14em] text-[hsl(var(--primary))]">{asset.id} · CRITICALITY {asset.criticality}</div><div className="mt-1 font-extrabold">{asset.name}</div></div><div className="text-xs font-semibold">{asset.location}</div><div><StatusBadge status={asset.status} /><div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Service: {asset.nextMaintenance}</div></div><Button variant="ghost" data-testid={`button-open-asset-${asset.id}`} onClick={() => setSelectedAssetId(asset.id)}>OPEN RECORD</Button><Button data-testid={`button-asset-status-${asset.id}`} variant={asset.status === 'MAINTENANCE DUE' ? 'danger' : 'secondary'} disabled={emergency.active && asset.category === 'VEHICLE'} onClick={() => setAssetStatus(asset.id, nextStatus[asset.status])}>{asset.status === 'IN USE' ? 'RETURN TO READY' : asset.status === 'READY' ? 'MARK IN USE' : 'CLEAR MAINTENANCE'}</Button></div>)}</div></div>)}
    {selectedAssetId && assets.find(asset => asset.id === selectedAssetId) && <AssetDetailModal asset={assets.find(asset => asset.id === selectedAssetId) as Asset} onClose={() => setSelectedAssetId(null)} />}
  </div>;
}

const leafletStationPoints: Record<string, [number, number]> = {
  MAI: [-70.75, 11.73],
  BHA: [-69.4, 76.18],
  HIM: [78.92, 11.93],
  SEA: [-64.2, 41.13],
};
const leafletRoutes: Record<string, [number, number][]> = {
  'Cape Town → Maitri': [[-33.93, 18.42], [-43, 25], [-54, 27], [-64, 23], [-70.75, 11.73]],
  'Cape Town → Bharati': [[-33.93, 18.42], [-43, 35], [-54, 50], [-63, 64], [-69.4, 76.18]],
  'Longyearbyen → Himadri': [[78.22, 15.65], [79.2, 14], [79.3, 12.6], [78.92, 11.93]],
  'Maitri → Southern Ocean': [[-70.75, 11.73], [-68, 18], [-64.2, 41.13]],
};
const indiaCargoRoutes = [
  { id: 'IND-MAI', label: 'Chennai → Maitri', origin: 'Chennai, India', destination: 'Maitri', mode: 'SEA / PC-6', path: [[13.08, 80.27], [4, 72], [-14, 55], [-42, 32], [-70.75, 11.73]] as [number, number][], progress: 0.58, speedKnots: 6 },
  { id: 'IND-BHA', label: 'Mumbai → Bharati', origin: 'Mumbai, India', destination: 'Bharati', mode: 'SEA / PC-5', path: [[19.07, 72.87], [7, 76], [-12, 78], [-39, 78], [-69.4, 76.18]] as [number, number][], progress: 0.34, speedKnots: 5 },
  { id: 'IND-HIM', label: 'Kochi → Himadri', origin: 'Kochi, India', destination: 'Himadri', mode: 'AIR / SEA RELAY', path: [[9.93, 76.27], [20, 65], [40, 48], [65, 30], [78.92, 11.93]] as [number, number][], progress: 0.72, speedKnots: 14 },
] as const;
const leafletUnitColors: Record<TrackingUnit['kind'], string> = { VESSEL: '#f1b72e', 'TUG BOAT': '#087f8c', HELICOPTER: '#7c3aed', UAV: '#475569' };
type LeafletCoordinate = [number, number];

function LeafletViewport() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

function positionAlongRoute(path: LeafletCoordinate[], progress: number): LeafletCoordinate {
  if (path.length < 2) return path[0] || [0, 0];
  const normalized = ((progress % 1) + 1) % 1;
  const scaled = normalized * (path.length - 1);
  const segment = Math.min(Math.floor(scaled), path.length - 2);
  const ratio = scaled - segment;
  const start = path[segment];
  const end = path[segment + 1];
  return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
}

function LiveLeafletMap({ expanded = false }: { expanded?: boolean }) {
  const { stations: stationState, voyages, cargo, trackingUnits, emergency, selectVoyage } = useOps();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [animationEpoch] = useState(() => Date.now());
  const [now, setNow] = useState(animationEpoch);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 900);
    return () => window.clearInterval(timer);
  }, []);
  const vessels = trackingUnits
    .filter(unit => unit.kind === 'VESSEL')
    .map(unit => ({ ...unit, status: voyages.find(voyage => voyage.id === unit.voyageId)?.status || unit.status }));
  const supportUnits = trackingUnits.filter(unit => unit.kind !== 'VESSEL');
  const selectedUnit = trackingUnits.find(unit => unit.id === selectedUnitId);
  const selectedCargo = selectedUnit?.voyageId ? cargo.filter(item => item.voyageId === selectedUnit.voyageId) : [];
  const movingPosition = (unit: TrackingUnit): LeafletCoordinate => {
    const route = unit.routeKey ? leafletRoutes[unit.routeKey] : undefined;
    if (!route || !unit.speedKnots) return [unit.latitude, unit.longitude];
    const progress = (unit.progress || 0) + ((now - animationEpoch) / 720000) * unit.speedKnots;
    return positionAlongRoute(route, progress);
  };
  const movingCargoPosition = (route: typeof indiaCargoRoutes[number]) => positionAlongRoute(route.path, route.progress + ((now - animationEpoch) / 720000) * route.speedKnots);
  const cargoForRoute = (route: typeof indiaCargoRoutes[number]) => cargo.filter(item => item.destination === route.destination);
  const openUnit = (unit: TrackingUnit) => {
    setSelectedUnitId(unit.id);
    if (unit.voyageId) selectVoyage(unit.voyageId);
  };
  return <div className="space-y-3">
    <div className={`relative overflow-hidden rounded-xl border border-cyan-900/20 shadow-inner ${expanded ? 'h-[560px]' : 'h-[360px]'}`}>
    <MapContainer className="h-full w-full" center={[4, 22]} zoom={1.2} minZoom={1} maxZoom={6} scrollWheelZoom={expanded} worldCopyJump zoomControl={false}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ZoomControl position="bottomright" />
      <LeafletViewport />
      {Object.entries(leafletRoutes).map(([route, path]) => <Polyline key={route} positions={path} pathOptions={{ color: emergency.active ? '#dc2626' : '#d5a52b', weight: 3, dashArray: '8 8', dashOffset: `${-Math.round(now / 40) % 32}px`, opacity: .9 }} />)}
      {indiaCargoRoutes.map(route => <Polyline key={route.id} positions={route.path} pathOptions={{ color: emergency.active ? '#dc2626' : '#0e9aa7', weight: 2, dashArray: '3 9', dashOffset: `${-Math.round(now / 28) % 36}px`, opacity: .8 }} />)}
      {stationState.filter(station => leafletStationPoints[station.code]).map(station => <CircleMarker key={station.code} center={leafletStationPoints[station.code]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: station.code === 'MAI' && emergency.active ? '#dc2626' : '#087f8c', fillOpacity: 1 }}>
        <Popup><div className="leaflet-popup-card"><strong>{station.name} / {station.code}</strong><br />{station.theatre}<br />Occupancy: {station.occupancy}/{station.capacity}<br />{station.weather}</div></Popup>
      </CircleMarker>)}
      {indiaCargoRoutes.map(route => <CircleMarker key={`${route.id}-cargo`} center={movingCargoPosition(route)} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#0e9aa7', fillOpacity: 1 }}>
        <Popup><div className="leaflet-popup-card"><strong>INDIA CARGO RUN</strong><br />{route.origin} → {route.destination}<br />{route.mode} · MOVING<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><span>Loads</span><strong>{cargoForRoute(route).length}</strong><span>Speed</span><strong>{route.speedKnots} kn</strong><span>Tracking</span><strong>LIVE SIMULATION</strong></div><div className="mt-2 space-y-1 border-t border-slate-200 pt-2">{cargoForRoute(route).slice(0, 3).map(item => <div key={item.tracking} className="text-[10px]"><strong>{item.tracking}</strong> · {item.weight.toLocaleString()} kg · {item.type}</div>)}</div></div></Popup>
      </CircleMarker>)}
      {vessels.map((unit, index) => <CircleMarker key={unit.id} center={movingPosition(unit)} radius={selectedUnitId === unit.id ? 10 : 7} pathOptions={{ color: '#172236', weight: 2, fillColor: unit.status === 'DELAYED' || emergency.active && index === 0 ? '#dc2626' : leafletUnitColors.VESSEL, fillOpacity: 1 }} eventHandlers={{ click: () => openUnit(unit) }}>
        <Popup><div className="leaflet-popup-card"><strong>{unit.label}</strong><br />VESSEL · {unit.status}<br />{unit.detail}<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><span>Speed</span><strong>{unit.speedKnots ? `${unit.speedKnots} kn` : 'HOLD'}</strong><span>ETA</span><strong>{unit.eta || '—'}</strong><span>Route</span><strong>{unit.routeKey || 'Stationed'}</strong></div>{unit.voyageId && <button className="leaflet-popup-link mt-2" onClick={() => openUnit(unit)}>OPEN CARGO & VOYAGE RECORD</button>}</div></Popup>
      </CircleMarker>)}
      {supportUnits.map(unit => <CircleMarker key={unit.id} center={movingPosition(unit)} radius={selectedUnitId === unit.id ? 9 : unit.kind === 'HELICOPTER' ? 6 : unit.kind === 'UAV' ? 5 : 7} pathOptions={{ color: '#fff', weight: 2, fillColor: emergency.active && unit.kind === 'HELICOPTER' ? '#dc2626' : leafletUnitColors[unit.kind], fillOpacity: .95 }} eventHandlers={{ click: () => openUnit(unit) }}>
        <Popup><div className="leaflet-popup-card"><strong>{unit.label}</strong><br />{unit.kind} · {unit.status}<br />{unit.detail}<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><span>Speed</span><strong>{unit.speedKnots ? `${unit.speedKnots} kn` : 'HOLD'}</strong><span>ETA</span><strong>{unit.eta || '—'}</strong><span>Route</span><strong>{unit.routeKey || 'Stationed'}</strong></div><button className="leaflet-popup-link mt-2" onClick={() => openUnit(unit)}>OPEN UNIT RECORD</button></div></Popup>
      </CircleMarker>)}
    </MapContainer>
    <div className="pointer-events-none absolute left-14 top-3 z-[500] rounded-md bg-white/90 px-3 py-2 shadow"><div className="mono text-[9px] font-extrabold tracking-[.15em] text-cyan-900">LEAFLET / MULTIMODAL TRACKING</div><div className="mt-1 text-[10px] text-slate-600">India cargo lanes, vessels, tug, and air units update live. Select any marker for particulars.</div></div>
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-md bg-slate-950/85 px-3 py-2 text-[10px] font-bold text-white shadow"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400 pulse-dot" />LIVE SIMULATION · POSITION UPDATES EVERY 0.9S</div>
    </div>
    {selectedUnit && <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 reveal">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="mono text-[9px] font-bold tracking-[.16em] text-[hsl(var(--primary))]">TRACKING RECORD / {selectedUnit.id}</div><div className="mt-1 text-sm font-extrabold">{selectedUnit.label}</div><div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{selectedUnit.kind} · {selectedUnit.detail}</div></div>
        <div className="flex items-center gap-2"><Badge tone={selectedUnit.status === 'DELAYED' ? 'red' : selectedUnit.speedKnots ? 'green' : 'amber'}>{selectedUnit.speedKnots ? 'MOVING' : selectedUnit.status}</Badge><button aria-label="Close tracking record" onClick={() => setSelectedUnitId(null)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><X size={15} /></button></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4"><div><div className="mono text-[9px] text-[hsl(var(--muted-foreground))]">CURRENT POSITION</div><div className="mt-1 text-xs font-bold">{movingPosition(selectedUnit).map(value => value.toFixed(2)).join('°, ')}°</div></div><div><div className="mono text-[9px] text-[hsl(var(--muted-foreground))]">SPEED</div><div className="mt-1 text-xs font-bold">{selectedUnit.speedKnots ? `${selectedUnit.speedKnots} knots` : 'Stationary / hold'}</div></div><div><div className="mono text-[9px] text-[hsl(var(--muted-foreground))]">ROUTE / ETA</div><div className="mt-1 text-xs font-bold">{selectedUnit.routeKey || 'Local station'} · {selectedUnit.eta || '—'}</div></div><div><div className="mono text-[9px] text-[hsl(var(--muted-foreground))]">MISSION LINK</div><div className="mt-1 text-xs font-bold">{selectedUnit.voyageId || 'Support fleet'}</div></div></div>
      {selectedCargo.length > 0 && <div className="mt-4 border-t border-[hsl(var(--border))] pt-3"><div className="mono text-[9px] font-bold tracking-[.15em] text-[hsl(var(--primary))]">CARGO ONBOARD / {selectedCargo.length} LOADS</div><div className="mt-2 grid gap-2 md:grid-cols-2">{selectedCargo.map(item => <div key={item.tracking} className="rounded-md bg-[hsl(var(--muted)/.55)] p-3"><div className="flex items-start justify-between gap-2"><div className="text-xs font-extrabold">{item.tracking}</div><StatusBadge status={item.status} /></div><div className="mt-1 text-[11px]">{item.description}</div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[hsl(var(--muted-foreground))]"><span>{item.type}</span><span>{item.weight.toLocaleString()} kg</span><span>{item.origin || 'India logistics hub'} → {item.destination}</span>{item.coldChain && <span className="font-bold text-cyan-800">{item.temperature}°C cold-chain</span>}</div></div>)}</div></div>}
    </div>}
  </div>;
}

function MapLegend({ emergency }: { emergency: boolean }) {
  const items = [
    { label: 'Station node', color: '#087f8c' },
    { label: 'Vessel', color: '#f1b72e' },
    { label: 'Tug boat', color: '#087f8c' },
    { label: 'Helicopter', color: '#7c3aed' },
    { label: 'UAV', color: '#475569' },
    { label: 'India cargo lane', color: '#0e9aa7', dashed: true },
    { label: emergency ? 'Restricted route' : 'Open route', color: emergency ? '#dc2626' : '#d5a52b', dashed: true },
  ];
  return <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[hsl(var(--border))] pt-4">{items.map(item => <div key={item.label} className="flex items-center gap-2 text-[10px] font-bold text-[hsl(var(--muted-foreground))]"><span className={`h-3 w-3 rounded-full border-2 border-white shadow-sm ${item.dashed ? 'border-t-2 border-dashed bg-transparent' : ''}`} style={item.dashed ? { borderColor: item.color } : { backgroundColor: item.color }} />{item.label}</div>)}</div>;
}

function IndiaCargoLaneBoard({ cargo }: { cargo: CargoItem[] }) {
  return <div className="panel p-5"><SectionTitle eyebrow="INDIA → POLAR BASES / CARGO NETWORK" title="Cargo lanes in motion" detail="Demonstration lanes from Indian logistics hubs to active polar bases; click a cyan marker on the map for load particulars." action={<Badge tone="cyan"><Radio size={11} />LIVE MOVEMENT</Badge>} /><div className="grid gap-3 lg:grid-cols-3">{indiaCargoRoutes.map(route => {
    const loads = cargo.filter(item => item.destination === route.destination);
    const weight = loads.reduce((total, item) => total + item.weight, 0);
    return <div key={route.id} className="rounded-lg border border-cyan-200 bg-cyan-50/55 p-4"><div className="flex items-start justify-between gap-3"><div><div className="mono text-[9px] font-bold tracking-[.15em] text-cyan-800">{route.id} / CARGO CORRIDOR</div><div className="mt-1 text-sm font-extrabold">{route.origin} → {route.destination}</div></div><span className="h-3 w-3 rounded-full bg-cyan-600 pulse-dot" /></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><div className="text-slate-500">MODE</div><strong>{route.mode}</strong></div><div><div className="text-slate-500">LOADS</div><strong>{loads.length} consignments</strong></div><div><div className="text-slate-500">WEIGHT</div><strong>{weight.toLocaleString()} kg</strong></div><div><div className="text-slate-500">STATE</div><strong className="text-cyan-800">IN TRANSIT</strong></div></div><div className="mt-3 border-t border-cyan-200 pt-2 text-[10px] text-slate-600">{loads.length ? loads.map(item => <div key={item.tracking} className="flex justify-between gap-2 py-0.5"><span className="font-bold">{item.tracking}</span><span>{item.type}</span></div>) : 'Awaiting manifest assignment'}</div></div>;
  })}</div></div>;
}

function MapPage() {
  const { stations, cargo, trackingUnits, emergency } = useOps();
  const routeCount = Object.keys(leafletRoutes).length + indiaCargoRoutes.length;
  const trackedUnits = trackingUnits.length;
  return <div className="space-y-6"><SectionTitle eyebrow="MAP & CORRIDORS / 07" title="Multimodal operating picture" detail="India cargo lanes, polar stations, vessels, tug boats, helicopters, and aerial survey units" action={<Badge tone={emergency.active ? 'red' : 'green'}><MapPinned size={11} />{emergency.active ? 'CORRIDORS RESTRICTED' : 'CORRIDORS OPEN'}</Badge>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="TRACKED UNITS" value={String(trackedUnits).padStart(2, '0')} detail="Vessels, support craft, and air" icon={RadioTower} tone="cyan" /><Metric label="STATIONS ONLINE" value={String(stations.length).padStart(2, '0')} detail="Polar nodes reporting" icon={MapPinned} tone="green" /><Metric label="ACTIVE CORRIDORS" value={String(routeCount).padStart(2, '0')} detail={emergency.active ? 'All routes under restriction' : 'Open route network'} icon={Anchor} tone={emergency.active ? 'red' : 'amber'} /><Metric label="CARGO LANES" value={String(indiaCargoRoutes.length).padStart(2, '0')} detail="India-to-base consignments" icon={PackageCheck} tone="cyan" /></div>
    <div className="panel p-5"><LiveLeafletMap expanded /><div className="mt-4"><MapLegend emergency={emergency.active} /></div></div>
    <IndiaCargoLaneBoard cargo={cargo} />
    <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]"><div className="grid gap-4 sm:grid-cols-2">{stations.map(station => <div key={station.code} className="panel p-4"><div className="mono text-[10px] font-bold tracking-[.15em] text-[hsl(var(--primary))]">{station.code} / {station.coordinates}</div><div className="mt-1 flex items-center justify-between gap-3"><div className="font-extrabold">{station.name}</div><StatusBadge status={station.code === 'MAI' && emergency.active ? 'RECALLED' : 'ON STATION'} /></div><div className="mt-2 flex justify-between text-xs"><span>{station.weather}</span><span className="mono">{station.occupancy}/{station.capacity}</span></div></div>)}</div><div className="panel p-5"><SectionTitle eyebrow="SUPPORT FLEET / LIVE" title="Air & marine support" detail="Tracked units from the authenticated operations feed" /><div className="space-y-3">{trackingUnits.filter(unit => unit.kind !== 'VESSEL').map(unit => <div key={unit.id} className="flex items-center gap-3 border-b border-[hsl(var(--border)/.7)] pb-3 last:border-0 last:pb-0"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: leafletUnitColors[unit.kind] }} /><div className="min-w-0 flex-1"><div className="text-xs font-extrabold">{unit.label}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">{unit.kind} · {unit.detail}</div></div><Badge tone={unit.status === 'STANDBY' ? 'amber' : 'cyan'}>{unit.status}</Badge></div>)}</div></div></div></div>;
}

function FieldCompanion() {
  const { personnel, stations, emergency, setPersonStatus } = useOps();
  const field = personnel.filter(person => person.status === 'FIELD');
  const activeStation = stations.find(station => station.name === 'Maitri');
  return <div className="space-y-6"><SectionTitle eyebrow="FIELD COMPANION / 08" title="Work party console" detail="Field status, beacon accountability, and station guidance for the next sortie" action={<Badge tone={emergency.active ? 'red' : 'green'}><RadioTower size={11} />{emergency.active ? 'SORTIES RECALLED' : 'BEACONS NOMINAL'}</Badge>} />
    {emergency.active && <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"><AlertOctagon size={18} /><div><div className="text-xs font-extrabold">FIELD MOVEMENT SUSPENDED</div><div className="text-[11px]">Return all active work parties to shelter and confirm beacon state.</div></div></div>}
    <div className="grid gap-4 md:grid-cols-3"><Metric label="FIELD ACTIVE" value={String(field.length).padStart(2, '0')} detail="Live beacon records" icon={HardHat} tone="amber" /><Metric label="NEXT CHECK-IN" value="06:15" detail="Maitri west sector" icon={Radio} tone="green" /><Metric label="VISIBILITY" value={emergency.active ? '<120m' : '8.4km'} detail={activeStation?.weather || 'Station weather'} icon={CloudSnow} tone={emergency.active ? 'red' : 'cyan'} /></div>
    <div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="BEACON REGISTER" title="Active work parties" detail="Update each operating state as the field picture changes" /></div><div className="divide-y divide-[hsl(var(--border))]">{personnel.map(person => <div key={person.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-[220px] flex-1"><div className="font-extrabold">{person.name}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">{person.role} · {person.station} · {person.blood}</div></div><StatusBadge status={person.status} /><div className="flex gap-1"><Button variant="secondary" onClick={() => setPersonStatus(person.id, 'INDOOR')}>SHELTERED</Button><Button variant="ghost" disabled={emergency.active} onClick={() => setPersonStatus(person.id, 'FIELD')}>FIELD</Button><Button variant="danger" onClick={() => setPersonStatus(person.id, 'SOS')}>SOS</Button></div></div>)}</div></div>
  </div>;
}

function AuditReports() {
  const { events, exportAudit } = useOps();
  return <div className="space-y-6"><SectionTitle eyebrow="AUDIT & REPORTING / 09" title="Decision record" detail="Append-only command history with time, module, and operator action" action={<div className="flex gap-2"><Button variant="secondary" onClick={exportAudit}><Download size={14} />EXPORT CSV</Button><Button variant="ghost" onClick={() => window.print()}><FileText size={14} />PRINT / PDF</Button></div>} /><div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><div className="flex items-center justify-between"><div><div className="mono text-[10px] font-bold tracking-[.16em] text-[hsl(var(--primary))]">COMMAND LOG / UTC</div><div className="mt-1 text-sm font-extrabold">PolarLogix operational history</div></div><Badge tone="green"><ShieldCheck size={11} />AUDIT APPEND-ONLY</Badge></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-[hsl(var(--muted)/.55)] text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><tr><th className="px-5 py-3">UTC</th><th className="px-3 py-3">Module</th><th className="px-3 py-3">Command</th><th className="px-3 py-3">Justification</th></tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{events.map(event => <tr key={event.id}><td className="px-5 py-3 mono text-[10px]">{event.time}</td><td className="px-3 py-3"><Badge tone={event.tone}>{event.module}</Badge></td><td className="px-3 py-3 font-bold">{event.action}</td><td className="px-3 py-3 text-[10px] text-[hsl(var(--muted-foreground))]">{event.justification || 'Recorded from command console.'}</td></tr>)}</tbody></table></div></div></div>;
}

function ScenarioPlanner() {
  const { runScenario, emergency, clearIncident } = useOps();
  const scenarios: { kind: ScenarioKind; title: string; detail: string; icon: typeof CloudSnow; tone: Tone }[] = [
    { kind: 'weather-degradation', title: 'Weather degradation', detail: 'Whiteout cascade at Maitri. Recalls field sorties and pauses cargo handling.', icon: CloudSnow, tone: 'red' },
    { kind: 'vessel-delay', title: 'Vessel delay', detail: 'Push the next non-delayed voyage by one day and update the critical path.', icon: Anchor, tone: 'amber' },
    { kind: 'cargo-failure', title: 'Cargo telemetry failure', detail: 'Inject a cold-chain excursion into the selected provision consignment.', icon: Thermometer, tone: 'cyan' },
  ];
  return <div className="space-y-6"><SectionTitle eyebrow="SCENARIO PLANNER / 10" title="Test the cascade" detail="Run transparent, reversible scenarios against the local operational picture" action={emergency.active ? <Button variant="secondary" onClick={clearIncident}><Check size={14} />DECLARE RECOVERY</Button> : <Badge tone="cyan"><SlidersHorizontal size={11} />LOCAL SIMULATION</Badge>} /><div className="grid gap-5 lg:grid-cols-3">{scenarios.map(({ kind, title, detail, icon: Icon, tone }) => <div key={kind} className="panel flex flex-col p-5"><div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone === 'red' ? 'bg-red-100 text-red-700' : tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'}`}><Icon size={21} /></div><h2 className="condensed mt-5 text-2xl font-bold uppercase">{title}</h2><p className="mt-2 flex-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{detail}</p><Button className="mt-5" variant={tone === 'red' ? 'danger' : 'secondary'} onClick={() => runScenario(kind)}><SlidersHorizontal size={14} />RUN SCENARIO</Button></div>)}</div><div className="panel p-5"><SectionTitle eyebrow="SCENARIO SAFETY" title="Review before commit" detail="Scenario actions update the current local view and are recorded in the audit feed. Resolve an emergency explicitly when the branch is complete." /><div className="grid gap-3 sm:grid-cols-3"><Badge tone={emergency.active ? 'red' : 'green'}>{emergency.active ? 'CONDITION 1 ACTIVE' : 'SYSTEM STANDBY'}</Badge><Badge tone="cyan">STATE IS REVERSIBLE</Badge><Badge tone="slate">NO LIVE NAVIGATION CONTROL</Badge></div></div></div>;
}

function DemoRunbook() {
  const steps = [{ label: '01 · Establish picture', detail: 'Review the overview, station status, and current command log.', href: '/' }, { label: '02 · Detect anomaly', detail: 'Use Scenario Planner to inject a cargo failure or vessel delay.', href: '/scenarios' }, { label: '03 · Execute cascade', detail: 'Run weather degradation and inspect the cross-module response.', href: '/emergency' }, { label: '04 · Recover & report', detail: 'Declare recovery, then export the append-only audit record.', href: '/audit' }];
  return <div className="space-y-6"><SectionTitle eyebrow="DEMO RUNBOOK" title="Operations rehearsal" detail="A guided path through the restored PolarLogix command modules" /><div className="grid gap-4 md:grid-cols-2">{steps.map((step, index) => <Link key={step.label} href={step.href} className="panel flex gap-4 p-5 transition-colors hover:border-[hsl(var(--primary))]"><div className="condensed text-4xl font-bold text-[hsl(var(--primary))]">{String(index + 1).padStart(2, '0')}</div><div><div className="mono text-[10px] font-bold tracking-[.14em] text-[hsl(var(--primary))]">{step.label}</div><p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{step.detail}</p><div className="mt-3 text-xs font-extrabold">OPEN MODULE <ChevronRight size={13} className="inline" /></div></div></Link>)}</div></div>;
}

function NotFound() { return <div className="panel mx-auto max-w-lg p-10 text-center"><AlertTriangle className="mx-auto text-amber-500" size={30} /><h1 className="condensed mt-4 text-4xl font-bold uppercase">Signal not found</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">This command channel does not exist.</p><Link href="/" className="mt-6 inline-flex min-h-10 items-center rounded-md bg-[hsl(var(--primary))] px-4 text-xs font-bold text-white">RETURN TO OVERVIEW</Link></div>; }

function PublicLanding() {
  const landingMetrics = [
    { value: '04', label: 'STATION NODES', detail: 'Arctic + Antarctic theatres', icon: MapPinned },
    { value: '03', label: 'ACTIVE VOYAGES', detail: 'Ice corridors under watch', icon: Anchor },
    { value: '09', label: 'TRACKED UNITS', detail: 'Vessels, air, and support', icon: RadioTower },
    { value: '24/7', label: 'COMMAND COVERAGE', detail: 'Decisions logged centrally', icon: ShieldCheck },
  ];
  const landingFeatures = [
    { title: 'Central approvals', detail: 'Review operator requests by station and authorize access, sorties, and transfers.', icon: ShieldCheck, tone: 'bg-amber-100 text-amber-800' },
    { title: 'Multimodal tracking', detail: 'See vessels, tug boats, helicopters, routes, and station nodes in one operating picture.', icon: MapPinned, tone: 'bg-cyan-100 text-cyan-800' },
    { title: 'Readiness at a glance', detail: 'Monitor personnel, cargo exceptions, fuel coverage, and emergency state before acting.', icon: Activity, tone: 'bg-emerald-100 text-emerald-800' },
  ];
  return <div className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--sidebar))] px-5 py-10 text-white">
    <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#172236,#075b66)] shadow-2xl">
      <div className="grid gap-10 p-7 md:p-12 lg:grid-cols-[1.1fr_.9fr]">
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img src={`${basePath}/logo.svg`} alt="PolarLogix" className="h-12 w-12 rounded-xl bg-[#f1b72e] p-2" />
              <div><div className="condensed text-2xl font-bold tracking-wide">POLARLOGIX</div><div className="mono text-[10px] tracking-[.18em] text-cyan-200">OPERATIONS / NCPOR</div></div>
            </div>
            <div className="mono mt-16 text-[10px] font-bold tracking-[.2em] text-cyan-200">SECURE COMMAND CONSOLE</div>
            <h1 className="condensed mt-3 max-w-xl text-6xl font-bold uppercase leading-[.85] tracking-wide md:text-8xl">Polar operations<br /><span className="text-[#f1b72e]">at a glance.</span></h1>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-slate-200">One command picture for station approvals, expedition movement, personnel readiness, cargo safety, and emergency response across the polar theatre.</p>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/sign-in" className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#f1b72e] px-5 text-xs font-extrabold tracking-wide text-[#172236] transition hover:bg-[#ffd56b]">SIGN IN TO COMMAND</Link>
            <Link href="/sign-up" className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/30 px-5 text-xs font-extrabold tracking-wide text-white transition hover:bg-white/10">CREATE OPERATOR ACCOUNT</Link>
          </div>
        </div>
        <div className="space-y-4">
          <div className="mono text-[10px] font-bold tracking-[.2em] text-[#f1b72e]">COMMAND PICTURE / AT A GLANCE</div>
          <div className="grid grid-cols-2 gap-3">{landingMetrics.map(({ value, label, detail, icon: Icon }) => <div key={label} className="rounded-xl border border-white/10 bg-white/10 p-4 backdrop-blur"><div className="flex items-start justify-between"><div className="condensed text-3xl font-bold">{value}</div><Icon size={16} className="text-[#f1b72e]" /></div><div className="mono mt-2 text-[9px] font-bold tracking-[.13em] text-cyan-100">{label}</div><div className="mt-1 text-[10px] leading-relaxed text-slate-300">{detail}</div></div>)}</div>
          <div className="space-y-2">{landingFeatures.map(({ title, detail, icon: Icon, tone }) => <div key={title} className="flex gap-3 rounded-xl border border-white/10 bg-[#092f3c]/45 p-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone}`}><Icon size={17} /></div><div><div className="text-xs font-extrabold">{title}</div><div className="mt-1 text-[11px] leading-relaxed text-slate-300">{detail}</div></div></div>)}</div>
        </div>
      </div>
    </div>
  </div>;
}

function SignInPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-4 py-8"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-4 py-8"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function AuthenticatedApp() {
  const state = useOperations();
  return <QueryClientProvider client={queryClient}><TooltipProvider><StateCtx.Provider value={state}><ErrorBoundary resetKey={window.location.pathname}><Router /></ErrorBoundary><Toaster /></StateCtx.Provider></TooltipProvider></QueryClientProvider>;
}

function AuthBoundary() {
  return <><Show when="signed-in"><AuthenticatedApp /></Show><Show when="signed-out"><PublicLanding /></Show></>;
}

function ClerkShell() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access the PolarLogix command console' } },
      signUp: { start: { title: 'Create operator access', subtitle: 'Set up an account for the PolarLogix command console' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={AuthBoundary} />
    </Switch>
  </ClerkProvider>;
}

function Router() {
  return <AppShell><Switch>
    <Route path="/" component={Overview} />
    <Route path="/expedition" component={Expedition} />
    <Route path="/cargo" component={Cargo} />
    <Route path="/inventory" component={Inventory} />
    <Route path="/personnel" component={Personnel} />
    <Route path="/emergency" component={Emergency} />
    <Route path="/assets" component={Assets} />
    <Route path="/map" component={MapPage} />
    <Route path="/field" component={FieldCompanion} />
    <Route path="/audit" component={AuditReports} />
    <Route path="/scenarios" component={ScenarioPlanner} />
    <Route path="/runbook" component={DemoRunbook} />
    <Route component={NotFound} />
  </Switch></AppShell>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkShell /></WouterRouter>;
}
export default App;