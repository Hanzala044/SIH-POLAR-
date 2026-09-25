import { useCallback, useEffect, useState, createContext, useContext, type FormEvent, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { ErrorBoundary } from '@/components/error-boundary';
import { PublicLanding } from '@/components/public-landing';
import { Button as ShadcnButton } from '@/components/ui/button';
import { Separator as ShadcnSeparator } from '@/components/ui/separator';
import {
  Sidebar as UiSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { adjustInventory, checkOperationsHealth, closeFieldSortie as closeFieldSortieApi, createEmergencyCascade, createEvent, createVoyage, decideOperatorRequest, dispatchFieldSortie as dispatchFieldSortieApi, loadOperations, recordSortieBeacon, replayQueuedCommands, resolveEmergency, returnSortiePerson as returnSortiePersonApi, setCommandQueueScope, updateAssetStatus, updateCargoTelemetry, updatePersonnelStatus, updateVoyageStatus as updateVoyageStatusApi } from '@/lib/operations-api';
import { demoOperationsSnapshot } from '@/lib/demo-snapshot';
import { listQueuedCommands, subscribeCommandQueue, type QueuedCommand } from '@/lib/offline-command-queue';
import { calculateRunwayDays, DEFAULT_EMERGENCY_UPLIFT, projectedLitresAtDayN } from '@/lib/runway-calculations';
import type { Asset, AssetStatus, CargoItem, Emergency, Event, FieldSortie, InventoryItem, OperationPermission, OperationsRole, OperatorRequest, Person, ScenarioKind, Station, Status, Tone, TrackingUnit, Voyage } from '@/lib/operations-types';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import {
  Activity, AlertOctagon, AlertTriangle, Anchor, ArrowDownRight, ArrowUpRight, Boxes,
  CalendarDays, Check, ChevronRight, CircleDot, ClipboardList, CloudSnow, Container, Download,
  FileText, Gauge, HardHat, Layers3, LifeBuoy, LockKeyhole, MapPinned, PackageCheck,
  Plus, Radio, RadioTower, RefreshCw, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Snowflake, Thermometer, Users, Wrench,
  Wifi, WifiOff, X, Zap
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip,
  XAxis, YAxis
} from 'recharts';

type StateContext = {
  stations: Station[]; voyages: Voyage[]; cargo: CargoItem[]; inventory: InventoryItem[]; personnel: Person[];
  assets: Asset[]; trackingUnits: TrackingUnit[]; events: Event[]; emergency: Emergency; operatorRequests: OperatorRequest[]; fieldSorties: FieldSortie[]; role: OperationsRole; can: (permission: OperationPermission) => boolean; online: boolean; queued: number; queueConflict: QueuedCommand | null; realtimeConnected: boolean;
  snapshotReceivedAt: string | null;
  selectedVoyageId: string | null;
  loading: boolean;
  demoMode: boolean;
  exitDemo: () => void;
  mutationError: string | null;
  clearMutationError: () => void;
  retryQueue: () => void;
  simulateBlizzard: () => void; clearIncident: () => void; simulateAnomaly: () => void;
  addVoyage: (v: Voyage) => Promise<boolean>; adjustStock: (sku: string, delta: number) => void;
  setPersonStatus: (id: string, status: Person['status']) => void; setAssetStatus: (id: string, status: AssetStatus) => void;
  selectVoyage: (id: string | null) => void; updateVoyageStatus: (id: string, status: Status) => void;
  dispatchSortie: (input: { stationId: string; destination: string; leadPersonId: string; expectedReturnTime: string; vehicle?: string; commFrequency: string; satPhoneCallsign?: string; personnelIds: string[] }) => Promise<boolean>;
  confirmSortieBeacon: (sortieId: string, personnelId: string) => void;
  returnSortiePerson: (sortieId: string, personnelId: string) => void;
  closeSortie: (sortieId: string) => void;
  reviewOperatorRequest: (id: string, decision: 'APPROVED' | 'REJECTED', justification: string) => void;
  runScenario: (scenario: ScenarioKind) => void; exportAudit: () => void; toggleOnline: () => void;
};

const StateCtx = createContext<StateContext | null>(null);
const queryClient = new QueryClient();
const rolePermissions: Record<OperationsRole, OperationPermission[]> = {
  COMMAND: ['voyage:write', 'inventory:write', 'personnel:write', 'asset:write', 'cargo:write', 'emergency:write', 'sortie:write', 'approval:decide', 'event:write', 'operations:initialize'],
  LOGISTICS: ['voyage:write', 'inventory:write', 'asset:write', 'cargo:write', 'event:write'],
  SAFETY: ['personnel:write', 'emergency:write', 'sortie:write', 'approval:decide', 'event:write'],
  VIEWER: [],
};
const operationsNavGroups = [
  {
    label: 'COMMAND DESK',
    links: [
      { href: '/', label: 'Operations overview', icon: Gauge },
      { href: '/expedition', label: 'Expedition control', icon: Anchor },
      { href: '/cargo', label: 'Cargo telemetry', icon: Container },
    ],
  },
  {
    label: 'READINESS & FIELD',
    links: [
      { href: '/inventory', label: 'Inventory & burn', icon: Boxes },
      { href: '/personnel', label: 'Personnel readiness', icon: Users },
      { href: '/field', label: 'Field sortie control', icon: RadioTower },
      { href: '/emergency', label: 'Emergency command', icon: AlertOctagon },
      { href: '/assets', label: 'Asset management', icon: Wrench },
      { href: '/map', label: 'Map & corridors', icon: MapPinned },
    ],
  },
  {
    label: 'GOVERNANCE',
    links: [
      { href: '/audit', label: 'Audit & reports', icon: ClipboardList },
      { href: '/scenarios', label: 'Scenario planner', icon: SlidersHorizontal },
    ],
  },
];

function roleDisplayName(role: OperationsRole) {
  return role === 'COMMAND' ? 'COMMANDER' : role;
}
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
    rootBox: 'w-full max-w-[440px] min-w-0 flex justify-center',
    cardBox: 'bg-[#fffdfa] rounded-2xl w-full min-w-0 max-w-full overflow-hidden',
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
  const { user } = useUser();
  const userId = user?.id || null;
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
  const [operatorRequests, setOperatorRequests] = useState<OperatorRequest[]>([]);
  const [fieldSorties, setFieldSorties] = useState<FieldSortie[]>([]);
  const [role, setRole] = useState<OperationsRole>('VIEWER');
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [queueConflict, setQueueConflict] = useState<QueuedCommand | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [snapshotReceivedAt, setSnapshotReceivedAt] = useState<string | null>(null);
  const can = useCallback((permission: OperationPermission) => rolePermissions[role].includes(permission), [role]);

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
    setOperatorRequests(snapshot.operatorRequests || []);
    setFieldSorties(snapshot.fieldSorties || []);
    setRole(snapshot.currentUser?.role || 'VIEWER');
    setSnapshotReceivedAt(new Date().toISOString());
    setOnline(typeof navigator === 'undefined' || navigator.onLine);
    // The API currently provides a polled snapshot, not a realtime subscription.
    setRealtimeConnected(false);
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
    setCommandQueueScope(userId);
    if (!userId) {
      setQueued(0);
      setQueueConflict(null);
      return;
    }
    const readQueue = () => {
      void listQueuedCommands(userId).then(commands => {
        setQueued(commands.length);
        setQueueConflict(commands.find(command => command.status === 'CONFLICT') || null);
      }).catch(error => setMutationError(error instanceof Error ? error.message : String(error)));
    };
    const unsubscribe = subscribeCommandQueue(userId, readQueue);
    readQueue();
    return unsubscribe;
  }, [userId]);
  const poll = useCallback(async () => {
    if (!userId) {
      setOnline(false);
      setRealtimeConnected(false);
      setLoading(false);
      return;
    }
    const healthy = typeof navigator === 'undefined' || navigator.onLine
      ? await checkOperationsHealth()
      : false;
    setOnline(healthy);
    if (!healthy) {
      setRealtimeConnected(false);
      setLoading(false);
      return;
    }
    if (userId) {
      const replay = await replayQueuedCommands(userId);
      if (replay.conflict) setQueueConflict(replay.conflict);
    }
    try {
      await refresh();
    } catch {
      // The stale snapshot remains visible; the next health poll retries.
    }
  }, [refresh, userId]);
  useEffect(() => {
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 10000);
    const onOnline = () => { void poll(); };
    const onOffline = () => { setOnline(false); setRealtimeConnected(false); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [poll]);
  const commit = useCallback((write: Promise<unknown>, event?: { module: string; action: string; tone?: Tone; justification?: string }, optimistic?: () => void): Promise<boolean> => {
    return write.then(async () => {
      optimistic?.();
      if (event) {
        try {
          const eventResult = await createEvent(event);
          if (eventResult.queued) {
            setEvents(previous => [{
              id: `queued-${eventResult.idempotencyKey || Date.now()}`,
              time: new Date().toISOString().replace('T', ' ').slice(0, 19),
              module: event.module,
              action: event.action,
              tone: event.tone || 'cyan',
              justification: event.justification,
              user: user?.fullName || 'Current operator',
              actorRole: role,
            }, ...previous]);
          }
        } catch (error) {
          setMutationError(`Operation saved, but its audit event failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (typeof navigator === 'undefined' || navigator.onLine) {
        try {
          await refresh();
        } catch (error) {
          setMutationError(previous => previous || `Operation saved, but the snapshot refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return true;
    }).catch(error => {
      setMutationError(error instanceof Error ? error.message : String(error));
      return false;
    });
  }, [refresh, role, user?.fullName]);
  const register = useCallback((module: string, action: string, tone: Tone = 'cyan') => {
    commit(createEvent({ module, action, tone }));
  }, [commit]);
  const simulateBlizzard = useCallback(() => {
    if (!can('emergency:write')) { setMutationError(`Role ${role} cannot change emergency state.`); return; }
    if (emergency.active) return;
    const stationId = stationState.find(station => station.name === 'Maitri')?.id;
    const cargoIds = cargo.filter(item => item.destination === 'Maitri' && item.id).map(item => item.id as string);
    const voyageIds = voyages.filter(voyage => voyage.status === 'UNDERWAY').map(voyage => voyage.id);
    const description = 'Whiteout wall approaching Maitri west sector. Field movement suspended pending visibility recovery.';
    const timestamp = new Date().toISOString();
    commit(createEmergencyCascade({ stationId, severity: 'LEVEL_3_LIFE_THREATENING', incidentType: 'BLIZZARD_COND_1', description, lockdown: true }, cargoIds, voyageIds), undefined, () => {
      setEmergency({ stationId, type: 'Blizzard cascade', severity: 'CONDITION 1', description, active: true, lockdown: true, timestamp: `${timestamp.slice(11, 19)} UTC` });
      setCargo(previous => previous.map(item => item.destination === 'Maitri' ? { ...item, status: 'HOLD' } : item));
      setVoyages(previous => previous.map(voyage => voyageIds.includes(voyage.id) ? { ...voyage, status: 'DELAYED', delay: Math.max(1, voyage.delay) } : voyage));
      setFieldSorties(previous => previous.map(sortie => sortie.status === 'COMPLETED' ? sortie : {
        ...sortie,
        status: 'RECALLED',
        recalledAt: timestamp,
        assignedPersonnel: sortie.assignedPersonnel.map(person => person.status === 'FIELD' ? { ...person, status: 'RECALLED' } : person),
      }));
      setEvents(previous => [{
        id: `local-condition1-${timestamp}`,
        time: `${timestamp.slice(11, 19)} UTC`,
        module: 'EMERGENCY',
        action: 'Condition 1 cascade executed · active field sorties recalled',
        tone: 'red',
        user: user?.fullName || 'Current operator',
        actorRole: role,
      }, ...previous]);
    });
  }, [can, cargo, commit, emergency.active, role, stationState, user?.fullName, voyages]);
  const clearIncident = useCallback(() => {
    if (!can('emergency:write')) { setMutationError(`Role ${role} cannot declare recovery.`); return; }
    const openSortie = fieldSorties.find(sortie => sortie.status !== 'COMPLETED');
    if (openSortie) {
      setMutationError(`Recovery blocked: close field sortie ${openSortie.id} after every assigned person is confirmed returned.`);
      return;
    }
    if (!window.confirm('Confirm Condition 1 recovery? This will only proceed after all assigned personnel have returned and every field sortie is closed.')) return;
    const justification = 'Recovery explicitly confirmed after all assigned personnel returned and field sorties closed.';
    const timestamp = new Date().toISOString();
    commit(resolveEmergency(emergency.incidentId, justification), undefined, () => {
      setEmergency({ ...emergency, active: false, lockdown: false, severity: 'RECOVERY DECLARED', timestamp: `${timestamp.slice(11, 19)} UTC` });
      setEvents(previous => [{
        id: `local-recovery-${timestamp}`,
        time: `${timestamp.slice(11, 19)} UTC`,
        module: 'EMERGENCY',
        action: 'Condition 1 recovery confirmed · all field sorties closed',
        tone: 'green',
        justification,
        user: user?.fullName || 'Current operator',
        actorRole: role,
      }, ...previous]);
    });
  }, [can, commit, emergency, fieldSorties, role, user?.fullName]);
  const simulateAnomaly = useCallback(() => {
    if (!can('cargo:write')) { setMutationError(`Role ${role} cannot change cargo telemetry.`); return; }
    const target = cargo.find(item => item.tracking === 'PLX-804-19');
    if (target) commit(updateCargoTelemetry({ ...target, temperature: -8.6, status: 'CRITICAL' }), { module: 'CARGO', action: 'Anomaly injected · PLX-804-19 cold-chain excursion', tone: 'red' });
  }, [can, cargo, commit, role]);
  const addVoyage = useCallback((voyage: Voyage) => {
    if (!can('voyage:write')) { setMutationError(`Role ${role} cannot create voyages.`); return Promise.resolve(false); }
    setMutationError(null);
    return commit(createVoyage(voyage), { module: 'EXPEDITION', action: `Voyage plan created · ${voyage.expedition}`, tone: 'green' }, () => {
      setVoyages(previous => previous.some(item => item.id === voyage.id) ? previous : [voyage, ...previous]);
    });
  }, [can, commit, role]);
  const adjustStock = useCallback((sku: string, delta: number) => {
    if (!can('inventory:write')) { setMutationError(`Role ${role} cannot adjust inventory.`); return; }
    const item = inventory.find(value => value.sku === sku);
    commit(adjustInventory(sku, delta), { module: 'INVENTORY', action: `${item?.name || sku} adjusted ${delta > 0 ? '+' : ''}${delta}`, tone: 'amber' }, () => {
      setInventory(previous => previous.map(value => value.sku === sku ? { ...value, quantity: Math.max(0, value.quantity + delta) } : value));
    });
  }, [can, commit, inventory, role]);
  const setPersonStatus = useCallback((id: string, status: Person['status']) => {
    if (!can('personnel:write')) { setMutationError(`Role ${role} cannot change personnel status.`); return; }
    const person = personnel.find(value => value.id === id);
    commit(updatePersonnelStatus(id, status), { module: 'PERSONNEL', action: `${person?.name || id} marked ${status}`, tone: status === 'SOS' ? 'red' : 'cyan' }, () => {
      setPersonnel(previous => previous.map(value => value.id === id ? { ...value, status, availableForSortie: status === 'INDOOR' } : value));
    });
  }, [can, commit, personnel, role]);
  const setAssetStatus = useCallback((id: string, status: AssetStatus) => {
    if (!can('asset:write')) { setMutationError(`Role ${role} cannot change asset status.`); return; }
    const asset = assets.find(value => value.id === id);
    commit(updateAssetStatus(id, status), { module: 'ASSETS', action: `${asset?.name || id} marked ${status}`, tone: status === 'MAINTENANCE DUE' || status === 'GROUNDED' ? 'amber' : 'green' }, () => {
      setAssets(previous => previous.map(value => value.id === id ? { ...value, status } : value));
    });
  }, [assets, can, commit, role]);
  const selectVoyage = useCallback((id: string | null) => {
    setSelectedVoyageId(id);
  }, []);
  const updateVoyageStatus = useCallback((id: string, status: Status) => {
    if (!can('voyage:write')) { setMutationError(`Role ${role} cannot change voyage status.`); return; }
    const voyage = voyages.find(value => value.id === id);
    commit(updateVoyageStatusApi(id, status), { module: 'EXPEDITION', action: `${voyage?.expedition || id} marked ${status}`, tone: status === 'DELAYED' ? 'amber' : 'cyan' }, () => {
      setVoyages(previous => previous.map(value => value.id === id ? { ...value, status } : value));
    });
  }, [can, commit, role, voyages]);
  const dispatchSortie = useCallback((input: { stationId: string; destination: string; leadPersonId: string; expectedReturnTime: string; vehicle?: string; commFrequency: string; satPhoneCallsign?: string; personnelIds: string[] }) => {
    if (!can('sortie:write')) { setMutationError(`Role ${role} cannot dispatch field sorties.`); return Promise.resolve(false); }
    if (emergency.active) { setMutationError('Condition 1 is active; field-sortie dispatch is blocked.'); return Promise.resolve(false); }
    setMutationError(null);
    const id = crypto.randomUUID();
    const departureTime = new Date().toISOString();
    const assignedPersonnel = input.personnelIds.map(personnelId => {
      const person = personnel.find(item => item.id === personnelId);
      return { id: personnelId, name: person?.name || 'Unknown operator', status: 'FIELD' as const };
    });
    const station = stationState.find(item => item.id === input.stationId)?.name || 'Unassigned';
    return commit(dispatchFieldSortieApi({ ...input, id }), undefined, () => {
      setFieldSorties(previous => [{
        id,
        stationId: input.stationId,
        station,
        destination: input.destination,
        leadPersonId: input.leadPersonId,
        leadPerson: personnel.find(item => item.id === input.leadPersonId)?.name || 'Unknown operator',
        departureTime,
        expectedReturnTime: input.expectedReturnTime,
        vehicle: input.vehicle,
        commFrequency: input.commFrequency,
        satPhoneCallsign: input.satPhoneCallsign,
        status: 'ACTIVE',
        assignedPersonnel,
      }, ...previous]);
      setPersonnel(previous => previous.map(person => input.personnelIds.includes(person.id) ? { ...person, status: 'FIELD', availableForSortie: false } : person));
    });
  }, [can, commit, emergency.active, personnel, role, stationState]);
  const confirmSortieBeacon = useCallback((sortieId: string, personnelId: string) => {
    if (!can('sortie:write')) { setMutationError(`Role ${role} cannot update field sorties.`); return; }
    const confirmedAt = new Date().toISOString();
    commit(recordSortieBeacon(sortieId, personnelId), undefined, () => setFieldSorties(previous => previous.map(sortie => sortie.id !== sortieId ? sortie : {
      ...sortie,
      assignedPersonnel: sortie.assignedPersonnel.map(person => person.id === personnelId ? { ...person, beaconConfirmedAt: confirmedAt } : person),
    })));
  }, [can, commit, role]);
  const returnSortiePerson = useCallback((sortieId: string, personnelId: string) => {
    if (!can('sortie:write')) { setMutationError(`Role ${role} cannot update field sorties.`); return; }
    const actualReturnTime = new Date().toISOString();
    commit(returnSortiePersonApi(sortieId, personnelId), undefined, () => {
      setFieldSorties(previous => previous.map(sortie => sortie.id !== sortieId ? sortie : {
        ...sortie,
        assignedPersonnel: sortie.assignedPersonnel.map(person => person.id === personnelId ? { ...person, status: 'RETURNED', actualReturnTime } : person),
      }));
      setPersonnel(previous => previous.map(person => person.id === personnelId ? { ...person, status: 'INDOOR', availableForSortie: true } : person));
    });
  }, [can, commit, role]);
  const closeSortie = useCallback((sortieId: string) => {
    if (!can('sortie:write')) { setMutationError(`Role ${role} cannot close field sorties.`); return; }
    const sortie = fieldSorties.find(item => item.id === sortieId);
    if (sortie?.assignedPersonnel.some(person => person.status !== 'RETURNED')) {
      setMutationError('Every assigned person must be confirmed returned before a sortie can be closed.');
      return;
    }
    const actualReturnTime = new Date().toISOString();
    commit(closeFieldSortieApi(sortieId), undefined, () => setFieldSorties(previous => previous.map(item => item.id === sortieId ? { ...item, status: 'COMPLETED', actualReturnTime } : item)));
  }, [can, commit, fieldSorties, role]);
  const runScenario = useCallback((scenario: ScenarioKind) => {
    if (scenario === 'weather-degradation') simulateBlizzard();
    if (scenario === 'cargo-failure') simulateAnomaly();
    if (scenario === 'vessel-delay') {
      if (!can('voyage:write')) { setMutationError(`Role ${role} cannot change voyage status.`); return; }
      const target = voyages.find(voyage => voyage.status !== 'DELAYED');
      if (target) {
        commit(updateVoyageStatusApi(target.id, 'DELAYED'), { module: 'SCENARIO', action: `${target.expedition} delayed by one day`, tone: 'amber' });
      }
    }
  }, [can, commit, role, setMutationError, simulateAnomaly, simulateBlizzard, voyages]);
  const exportAudit = useCallback(() => {
    const csv = ['UTC,MODULE,COMMAND,JUSTIFICATION', ...events.map(event => [event.time, event.module, `"${event.action.replaceAll('"', '""')}"`, `"${event.justification || 'Recorded from command console.'}"`].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'polarlogix-command-audit.csv'; anchor.click(); URL.revokeObjectURL(url);
  }, [events]);
  const toggleOnline = useCallback(() => {
    void poll();
  }, [poll]);
  const retryQueue = useCallback(() => {
    if (!userId) return;
    void replayQueuedCommands(userId, true).then(async result => {
      if (result.conflict) {
        setQueueConflict(result.conflict);
        setMutationError(`Queued command remains blocked: ${result.conflict.conflict || 'server rejected the replay.'}`);
      } else {
        setMutationError(null);
        await refresh();
      }
    }).catch(error => setMutationError(error instanceof Error ? error.message : String(error)));
  }, [refresh, userId]);
  const reviewOperatorRequest = useCallback((id: string, decision: 'APPROVED' | 'REJECTED', justification: string) => {
    const request = operatorRequests.find(item => item.id === id);
    if (!request) return;
    const decidedAt = new Date().toISOString();
    if (!can('approval:decide')) {
      setMutationError(`Role ${role} cannot approve or reject operator requests.`);
      return;
    }
    if (justification.trim().length < 3) {
      setMutationError('Enter a justification of at least 3 characters.');
      return;
    }
    commit(decideOperatorRequest(id, decision, justification), undefined, () => {
      setOperatorRequests(previous => previous.map(item => item.id === id ? {
        ...item,
        status: decision,
        decisionRole: role,
        decisionActor: user?.fullName || 'Current operator',
        decidedAt,
        decisionJustification: justification.trim(),
      } : item));
      setEvents(previous => [{
        id: `local-decision-${id}-${decidedAt}`,
        time: decidedAt.replace('T', ' ').slice(0, 19),
        module: 'AUTHORITY',
        action: `Operator access ${decision === 'APPROVED' ? 'approved' : 'rejected'} · ${request.operator} / ${request.station}`,
        tone: decision === 'APPROVED' ? 'green' : 'red',
        justification: justification.trim(),
        user: user?.fullName || 'Current operator',
        actorRole: role,
      }, ...previous]);
    });
  }, [can, commit, operatorRequests, role, user?.fullName]);
  const clearMutationError = useCallback(() => setMutationError(null), []);

  return { stations: stationState, voyages, cargo, inventory, personnel, assets, trackingUnits, events, emergency, operatorRequests, fieldSorties, role, can, online, queued, queueConflict, realtimeConnected, snapshotReceivedAt, selectedVoyageId, loading, demoMode: false, exitDemo: () => {}, mutationError, clearMutationError, retryQueue, simulateBlizzard, clearIncident, simulateAnomaly, addVoyage, adjustStock, setPersonStatus, setAssetStatus, selectVoyage, updateVoyageStatus, dispatchSortie, confirmSortieBeacon, returnSortiePerson, closeSortie, reviewOperatorRequest, runScenario, exportAudit, toggleOnline };
}

function useDemoOperations(exitDemo: () => void): StateContext {
  const [selectedVoyageId, selectVoyage] = useState<string | null>(null);
  const noAction = () => {};
  const role: OperationsRole = 'VIEWER';
  return {
    ...demoOperationsSnapshot,
    role,
    can: () => false,
    online: true,
    queued: 0,
    queueConflict: null,
    realtimeConnected: false,
    snapshotReceivedAt: new Date().toISOString(),
    selectedVoyageId,
    loading: false,
    demoMode: true,
    exitDemo,
    mutationError: null,
    clearMutationError: noAction,
    retryQueue: noAction,
    simulateBlizzard: noAction,
    clearIncident: noAction,
    simulateAnomaly: noAction,
    addVoyage: async () => false,
    adjustStock: noAction,
    setPersonStatus: noAction,
    setAssetStatus: noAction,
    selectVoyage,
    updateVoyageStatus: noAction,
    dispatchSortie: async () => false,
    confirmSortieBeacon: noAction,
    returnSortiePerson: noAction,
    closeSortie: noAction,
    reviewOperatorRequest: noAction,
    runScenario: noAction,
    exportAudit: noAction,
    toggleOnline: noAction,
  };
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
  const demoMode = useContext(StateCtx)?.demoMode || false;
  const styles = { primary: 'bg-[hsl(var(--primary))] text-white hover:brightness-110', secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--border))]', danger: 'bg-[hsl(var(--destructive))] text-white hover:brightness-110', ghost: 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]' };
  return <button {...props} disabled={props.disabled || demoMode} title={demoMode ? 'Command actions are disabled in the read-only demo' : props.title} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>{children}</button>;
}
function SectionTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><div className="mono mb-1 text-[10px] font-bold tracking-[.18em] text-[hsl(var(--primary))]">{eyebrow}</div><h2 className="condensed text-[28px] font-bold uppercase leading-none tracking-wide text-[hsl(var(--foreground))]">{title}</h2>{detail && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>{action}</div>;
}
type MetricProvenance = {
  kind: 'CALCULATED' | 'DEMO DATA' | 'SIMULATED';
  source: string;
  formula: string;
  inputs: string;
  assumptions: string;
  updatedAt?: string | null;
};

const demoProvenance: MetricProvenance = {
  kind: 'DEMO DATA',
  source: 'Demo/fixture value or demo-seeded API record; no live sensor timestamp is asserted.',
  formula: 'Not declared for this panel; the value may be illustrative or derived from demo-seeded records.',
  inputs: 'The displayed example value or demo-seeded record shown by this panel.',
  assumptions: 'Do not treat as a live operational measurement without a verified source.',
};

function calculatedProvenance(formula: string, inputs: string, assumptions = 'Calculated from the most recently received operations snapshot; underlying records may be seeded demo data.'): MetricProvenance {
  return {
    kind: 'CALCULATED',
    source: 'Authenticated operations API snapshot backed by Supabase',
    formula,
    inputs,
    assumptions,
  };
}

function ProvenanceDisclosure({ provenance = demoProvenance }: { provenance?: MetricProvenance }) {
  const { snapshotReceivedAt } = useOps();
  const badgeTone: Tone = provenance.kind === 'CALCULATED' ? 'green' : provenance.kind === 'SIMULATED' ? 'amber' : 'slate';
  const timestamp = provenance.updatedAt
    ? new Date(provenance.updatedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : provenance.kind === 'CALCULATED' && snapshotReceivedAt
      ? `Snapshot received ${new Date(snapshotReceivedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC`
      : 'No source timestamp supplied';
  return <details className="mt-2 border-t border-[hsl(var(--border)/.7)] pt-2 text-[10px] text-[hsl(var(--muted-foreground))]">
    <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
      <Badge tone={badgeTone}>{provenance.kind}</Badge><span>Source & calculation</span>
    </summary>
    <dl className="mt-2 grid gap-x-2 gap-y-1.5 sm:grid-cols-[84px_1fr]">
      <dt className="font-bold text-[hsl(var(--foreground))]">Source</dt><dd>{provenance.source}</dd>
      <dt className="font-bold text-[hsl(var(--foreground))]">Formula</dt><dd className="break-words">{provenance.formula}</dd>
      <dt className="font-bold text-[hsl(var(--foreground))]">Inputs</dt><dd>{provenance.inputs}</dd>
      <dt className="font-bold text-[hsl(var(--foreground))]">Assumptions</dt><dd>{provenance.assumptions}</dd>
      <dt className="font-bold text-[hsl(var(--foreground))]">Updated</dt><dd>{timestamp}</dd>
    </dl>
  </details>;
}

function Metric({ label, value, detail, icon: Icon, tone = 'cyan', trend, provenance }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: Tone;
  trend?: 'up' | 'down';
  provenance?: MetricProvenance;
}) {
  return <div className="panel relative overflow-hidden p-4"><div className={`absolute right-0 top-0 h-1 w-16 ${tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-400' : tone === 'green' ? 'bg-emerald-500' : 'bg-cyan-600'}`} /><div className="flex items-start justify-between"><span className="mono text-[10px] font-bold tracking-[.14em] text-[hsl(var(--muted-foreground))]">{label}</span><Icon size={16} className="text-[hsl(var(--primary))]" /></div><div data-testid={`text-metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="condensed mt-3 text-4xl font-bold tracking-wide">{value}</div><div className="mt-1 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">{trend && (trend === 'up' ? <ArrowUpRight size={13} className="text-emerald-600" /> : <ArrowDownRight size={13} className="text-amber-600" />)}{detail}</div><ProvenanceDisclosure provenance={provenance} /></div>;
}
function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded bg-[hsl(var(--muted))] ${className}`} />; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="flex min-h-36 flex-col items-center justify-center border border-dashed border-[hsl(var(--border))] p-6 text-center"><PackageCheck size={24} className="mb-2 text-[hsl(var(--primary))]" /><div className="text-sm font-bold">{title}</div><div className="mt-1 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">{detail}</div></div>; }

function Sidebar() {
  const { stations: stationState, demoMode, online, role } = useOps();
  const [location] = useLocation();
  return <UiSidebar collapsible="offcanvas" className="operations-sidebar border-r border-sidebar-border shadow-[8px_0_34px_rgba(4,15,28,.22)]">
    <SidebarHeader className="px-4 pb-4 pt-5">
      <Link href="/" data-testid="link-sidebar-home" className="group flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-white/[.035]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_24px_hsl(var(--sidebar-primary)/.24)] transition-shadow group-hover:shadow-[0_0_30px_hsl(var(--sidebar-primary)/.38)]"><Snowflake size={21} /></span>
        <span className="min-w-0">
          <span className="block text-lg font-extrabold tracking-[.08em] text-white">POLAR<span className="text-sidebar-primary">LOGIX</span></span>
          <span className="mt-0.5 block font-mono text-[9px] tracking-[.17em] text-sidebar-foreground/65">OPERATIONS / NCPOR</span>
        </span>
      </Link>
      <div className="relative isolate mt-4 overflow-hidden rounded-2xl border border-sidebar-primary/20 bg-sidebar-accent/55 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-7 -top-8 -z-10 h-24 w-24 rounded-full bg-sidebar-primary/10 blur-2xl" />
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px] font-bold tracking-[.15em] text-sidebar-primary/80">WORKSPACE STATUS</span>
          <span className={`h-2 w-2 rounded-full ring-4 ring-white/[.035] ${demoMode ? 'bg-amber-400' : online ? 'bg-emerald-400 pulse-dot' : 'bg-amber-400'}`} />
        </div>
        <div className="mt-1.5 text-xs font-bold text-white">{demoMode ? 'Local preview' : online ? 'Snapshot connected' : 'Connection unavailable'}</div>
        <div className="mt-1 text-[10px] leading-4 text-sidebar-foreground/65">{demoMode ? 'Illustrative data · read only' : 'API snapshot · polled every 10 seconds'}</div>
        <div className="mt-3 flex items-center gap-2 border-t border-white/[.08] pt-2 font-mono text-[8px] font-medium tracking-[.11em] text-sidebar-foreground/55">
          <Activity size={11} className={online && !demoMode ? 'text-emerald-400' : 'text-sidebar-primary'} />
          {demoMode ? 'LOCAL FIXTURE' : online ? 'SYNC INTERVAL · 10 SEC' : 'AWAITING API RESPONSE'}
        </div>
      </div>
    </SidebarHeader>

    <SidebarContent className="scrollbar-thin px-3">
      {operationsNavGroups.map(group => (
        <SidebarGroup key={group.label} className="px-0 py-2">
          <SidebarGroupLabel className="px-3 text-[9px] font-extrabold tracking-[.18em] text-sidebar-primary/65">{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.links.map(({ href, label, icon: Icon }) => {
                const active = location === href;
                return <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={label}
                    className={`group relative h-11 rounded-xl border px-3 text-xs font-semibold transition-all duration-200 ${active ? 'border-sidebar-primary/25 bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_0_22px_hsl(var(--sidebar-primary)/.08)]' : 'border-transparent text-sidebar-foreground/75 hover:border-sidebar-border hover:bg-white/[.045] hover:text-white'}`}
                  >
                    <Link href={href} aria-current={active ? 'page' : undefined} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
                      {active && <span aria-hidden="true" className="absolute left-0 top-2.5 h-5 w-[2px] rounded-r-full bg-sidebar-primary shadow-[0_0_10px_hsl(var(--sidebar-primary)/.8)]" />}
                      <Icon size={17} className={active ? 'text-sidebar-primary drop-shadow-[0_0_6px_hsl(var(--sidebar-primary)/.45)]' : 'text-sidebar-foreground/60 transition-colors group-hover:text-sidebar-primary'} />
                      <span>{label}</span>
                      {active && <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary shadow-[0_0_8px_hsl(var(--sidebar-primary)/.75)]" />}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>;
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>

    <SidebarFooter className="gap-0 px-3 pb-3 pt-1">
      <SidebarSeparator className="mx-0 mb-3" />
      <div className="rounded-2xl border border-sidebar-border/90 bg-white/[.035] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] font-bold tracking-[.14em] text-sidebar-primary/75">{demoMode ? 'DEMO STATIONS' : 'STATION NETWORK'}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${demoMode ? 'bg-amber-400' : online ? 'bg-emerald-400 pulse-dot' : 'bg-amber-400'}`} />
        </div>
        <div className="mt-3 space-y-2.5">
          {stationState.slice(0, 3).map(station => (
            <div key={station.code} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate font-semibold text-sidebar-foreground/85">{station.name}</span>
               <span className="shrink-0 font-mono text-sidebar-primary/75">{station.occupancy}/{station.capacity}</span>
            </div>
          ))}
          {stationState.length === 0 && <div className="py-1 text-[10px] leading-4 text-sidebar-foreground/55">Station nodes are not available.</div>}
          {stationState.length > 3 && <div className="pt-0.5 font-mono text-[9px] text-sidebar-foreground/45">+{stationState.length - 3} additional nodes</div>}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-sidebar-border/70 bg-white/[.025] px-3 py-2">
        <span className="font-mono text-[9px] font-bold tracking-[.14em] text-sidebar-foreground/60">ACCESS PROFILE</span>
        <span className="rounded-md border border-sidebar-primary/25 bg-sidebar-primary/10 px-2 py-1 font-mono text-[9px] font-bold tracking-[.08em] text-sidebar-primary">{demoMode ? 'READ ONLY' : roleDisplayName(role)}</span>
      </div>
    </SidebarFooter>
  </UiSidebar>;
}

function Header() {
  const { emergency, online, queued, role, snapshotReceivedAt, toggleOnline, demoMode, exitDemo } = useOps();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [time, setTime] = useState(new Date());
  const [location] = useLocation();
  useEffect(() => { const timer = window.setInterval(() => setTime(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const currentPage = operationsNavGroups.flatMap(group => group.links).find(link => link.href === location)?.label || 'Operations workspace';
  const refreshedAt = snapshotReceivedAt
    ? new Date(snapshotReceivedAt).toISOString().slice(11, 19) + ' UTC'
    : 'No successful snapshot yet';
  return <>
    <header className={`sticky top-0 z-40 flex min-h-[76px] items-center justify-between gap-3 border-b px-3 backdrop-blur-xl transition-colors sm:px-5 lg:px-7 ${emergency.active ? 'border-red-700 bg-red-700 text-white' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.94)]'}`}>
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger data-testid="button-toggle-sidebar" aria-label="Toggle navigation" className={`h-10 w-10 shrink-0 rounded-xl border ${emergency.active ? 'border-red-300/40 text-white hover:bg-red-600' : 'border-[hsl(var(--border))] bg-white/60 text-[hsl(var(--foreground))]'}`} />
        <ShadcnSeparator orientation="vertical" className={`hidden h-9 sm:block ${emergency.active ? 'bg-red-300/40' : ''}`} />
        <div className="min-w-0">
          <div className={`hidden font-mono text-[9px] font-bold tracking-[.17em] sm:block ${emergency.active ? 'text-red-100' : 'text-[hsl(var(--muted-foreground))]'}`}>POLARLOGIX / NCPOR OPERATIONS</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="truncate text-sm font-extrabold tracking-tight sm:text-base">{currentPage}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[8px] font-bold tracking-[.1em] ${emergency.active ? 'bg-white/15 text-white' : demoMode ? 'bg-amber-100 text-amber-900' : online ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${emergency.active ? 'bg-white pulse-dot' : demoMode ? 'bg-amber-500' : online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {demoMode ? 'READ-ONLY PREVIEW' : queued ? `${queued} QUEUED` : online ? 'SNAPSHOT OK' : 'OFFLINE'}
            </span>
            {emergency.active && <Badge tone="red"><AlertTriangle size={10} />{emergency.severity}</Badge>}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ShadcnButton
          data-testid="button-network-toggle"
          title={demoMode ? 'This local demo does not connect to the operations API' : `Refresh snapshot · last successful snapshot: ${refreshedAt}`}
          disabled={demoMode}
          onClick={toggleOnline}
          size="sm"
          variant={demoMode ? 'secondary' : 'outline'}
          className={`h-10 rounded-xl px-2.5 text-[9px] font-extrabold tracking-[.08em] sm:px-3 ${emergency.active ? 'border-red-300/50 bg-transparent text-white hover:bg-red-600' : ''}`}
        >
          {demoMode ? <ShieldCheck size={14} /> : online ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="hidden sm:inline">{demoMode ? 'LOCAL DEMO' : online ? 'REFRESH' : 'RETRY'}</span>
          <span className="sr-only">Refresh database snapshot. Last successful snapshot: {refreshedAt}</span>
        </ShadcnButton>
        <div className="hidden min-w-[118px] text-right lg:block">
          <div className="font-mono text-xs font-bold tabular-nums">{time.toISOString().slice(11, 19)} UTC</div>
          <div className={`mt-1 max-w-[180px] truncate text-[10px] ${emergency.active ? 'text-red-100' : 'text-[hsl(var(--muted-foreground))]'}`}>{demoMode ? 'LOCAL DEMO OPERATOR' : user?.fullName || user?.username || 'AUTHENTICATED OPERATOR'} · {demoMode ? 'READ ONLY' : roleDisplayName(role)}</div>
        </div>
        <ShadcnButton
          data-testid="button-sign-out"
          onClick={() => demoMode ? exitDemo() : void signOut({ redirectUrl: basePath || '/' })}
          size="sm"
          variant={emergency.active ? 'outline' : 'outline'}
          className={`h-10 rounded-xl px-3 text-[9px] font-extrabold tracking-[.08em] ${emergency.active ? 'border-red-300/50 bg-transparent text-white hover:bg-red-600' : ''}`}
        >
          {demoMode ? 'EXIT PREVIEW' : 'SIGN OUT'}
        </ShadcnButton>
      </div>
    </header>
  </>;
}

function AppShell({ children }: { children: ReactNode }) {
  const { loading, emergency, online, queued, queueConflict, snapshotReceivedAt, retryQueue, mutationError, clearMutationError, demoMode, role } = useOps();
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  const lastSnapshot = snapshotReceivedAt
    ? new Date(snapshotReceivedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : 'none received yet';
  const ageMs = snapshotReceivedAt ? Math.max(0, clock - new Date(snapshotReceivedAt).getTime()) : Number.POSITIVE_INFINITY;
  const stale = !demoMode && (!online || ageMs > 90000 || !snapshotReceivedAt);
  const minutesSinceSync = Number.isFinite(ageMs) ? Math.floor(ageMs / 60000) : '—';
  return <SidebarProvider className="texture min-h-[100dvh] bg-[hsl(var(--background))]">
    <Sidebar />
    <div className="min-w-0 flex-1">
      <Header />
      {demoMode && <div role="status" data-testid="status-read-only-demo" className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-extrabold text-amber-950 md:px-7">READ-ONLY DEMO · ILLUSTRATIVE LOCAL DATA · NO AUTHENTICATED SESSION OR SERVER COMMANDS</div>}
      {!demoMode && role === 'VIEWER' && <div role="status" data-testid="status-viewer-role-help" className="flex flex-wrap items-start gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 md:px-7">
        <LockKeyhole size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-extrabold">Viewer access is active for this account.</div>
          <div className="mt-1 leading-5">Sign-in confirms identity but does not grant command permissions. An administrator can assign this user in external Clerk with <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px]">publicMetadata.operationsRole = "COMMAND"</code>.</div>
        </div>
      </div>}
      {stale && <div role="alert" aria-live="polite" data-testid="status-stale-snapshot" className="flex flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-950 md:px-7">
        <WifiOff size={15} /><span>STALE DATA – last successful sync {minutesSinceSync} min ago</span><span className="font-normal">Showing the last received snapshot from {lastSnapshot}.{queued > 0 ? ` ${queued} command${queued === 1 ? '' : 's'} queued.` : ''}</span>
      </div>}
      {queueConflict && <div role="alert" aria-live="assertive" data-testid="status-queue-conflict" className="flex flex-wrap items-center gap-2 border-b border-red-300 bg-red-50 px-4 py-2 text-xs text-red-950 md:px-7">
        <AlertTriangle size={15} /><span className="font-extrabold">COMMAND QUEUE BLOCKED</span><span>{queueConflict.method} {queueConflict.endpoint}: {queueConflict.conflict || 'server rejected the replay'}</span><Button disabled={!online} variant="secondary" className="ml-auto min-h-8" onClick={retryQueue}>RETRY QUEUE</Button>
      </div>}
      {mutationError && <div role="alert" data-testid="status-mutation-error" className="flex flex-wrap items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900 md:px-7">
        <AlertTriangle size={15} /><span className="flex-1">{mutationError}</span><button aria-label="Dismiss error" onClick={clearMutationError}><X size={15} /></button>
      </div>}
      {emergency.active && <div data-testid="status-global-alert" className="flex items-center gap-3 border-b border-red-700 bg-red-500 px-4 py-2 text-xs font-extrabold text-white md:px-7"><AlertOctagon size={16} className="shrink-0" /><span>CONDITION 1 LOCKDOWN · FIELD MOVEMENT SUSPENDED · MANDATORY MUSTER ACTIVE</span><Link href="/emergency" className="ml-auto underline">COMMAND CENTER</Link></div>}
      <main className="mx-auto w-full max-w-[1600px] p-4 md:p-7">{loading ? <div className="space-y-5"><Skeleton className="h-10 w-72" /><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-32" />)}</div><Skeleton className="h-80" /></div> : children}</main>
    </div>
  </SidebarProvider>;
}

function OperatorApprovalQueue() {
  const { operatorRequests, reviewOperatorRequest, can, role } = useOps();
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const pending = operatorRequests.filter(request => request.status === 'PENDING');
  const decided = operatorRequests.filter(request => request.status !== 'PENDING');
  return <section className="panel p-5 reveal">
    <SectionTitle
      eyebrow="COMMAND AUTHORITY / ACCESS CONTROL"
      title="Operator approvals"
      detail="COMMAND and SAFETY decisions are server-recorded with actor, role, justification, and UTC time."
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
      <label className="mt-3 block text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Decision justification
        <textarea data-testid={`input-approval-justification-${request.id}`} value={justifications[request.id] || ''} onChange={event => setJustifications(previous => ({ ...previous, [request.id]: event.target.value }))} rows={2} maxLength={500} placeholder="Required reason for approving or rejecting" className="mt-1 w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] p-2 text-xs text-[hsl(var(--foreground))]" />
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <Button data-testid={`button-reject-request-${request.id}`} disabled={!can('approval:decide') || (justifications[request.id] || '').trim().length < 3} title={!can('approval:decide') ? `Role ${role} cannot decide approvals` : undefined} variant="ghost" className="border border-red-200 text-red-700 hover:bg-red-50" onClick={() => reviewOperatorRequest(request.id, 'REJECTED', justifications[request.id] || '')}><X size={14} />REJECT</Button>
        <Button data-testid={`button-approve-request-${request.id}`} disabled={!can('approval:decide') || (justifications[request.id] || '').trim().length < 3} title={!can('approval:decide') ? `Role ${role} cannot decide approvals` : undefined} onClick={() => reviewOperatorRequest(request.id, 'APPROVED', justifications[request.id] || '')}><Check size={14} />APPROVE</Button>
      </div>
      {!can('approval:decide') && <p className="mt-2 text-right text-[10px] text-[hsl(var(--muted-foreground))]">Current role: {role}. Only COMMAND or SAFETY may decide.</p>}
    </div>)}</div> : <EmptyState title="No pending operator requests" detail="All station access requests have a recorded command decision." />}
    {decided.length > 0 && <div className="mt-5 border-t border-[hsl(var(--border))] pt-4"><div className="mono text-[9px] font-bold tracking-[.16em] text-[hsl(var(--muted-foreground))]">RECENT COMMAND DECISIONS · UTC</div><div className="mt-2 space-y-2">{decided.map(request => <div key={request.id} data-testid={`decision-operator-request-${request.id}`} className="rounded-md border border-[hsl(var(--border))] p-3"><div className="flex flex-wrap items-center gap-2"><Badge tone={request.status === 'APPROVED' ? 'green' : 'red'}><ShieldCheck size={10} />{request.operator} · {request.status}</Badge><span className="text-[10px] text-[hsl(var(--muted-foreground))]">{request.decisionActor || 'Operator'} · {request.decisionRole || '—'} · {request.decidedAt ? new Date(request.decidedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'pending server sync'}</span></div>{request.decisionJustification && <div className="mt-1 text-[11px]">{request.decisionJustification}</div>}</div>)}</div></div>}
  </section>;
}

function Overview() {
  const { stations: stationState, voyages, cargo, inventory, personnel, events, emergency, fieldSorties, simulateBlizzard, can, role } = useOps();
  const field = personnel.filter(person => person.status === 'FIELD').length;
  const openSorties = fieldSorties.filter(sortie => sortie.status !== 'COMPLETED').length;
  const criticalCargo = cargo.filter(item => item.status === 'CRITICAL').length;
  const coldChainLoads = cargo.filter(item => item.coldChain).length;
  const shockWatch = cargo.filter(item => item.shock >= 1.5).length;
  const generatorFuel = inventory.find(item => item.sku === 'FUEL-D-17');
  const fuelUplift = emergency.active ? DEFAULT_EMERGENCY_UPLIFT : 0;
  const fuelRunway = generatorFuel && generatorFuel.dailyBurn > 0
    ? calculateRunwayDays(generatorFuel.quantity, generatorFuel.dailyBurn, fuelUplift)
    : null;
  const activeVoyages = voyages.filter(voyage => ['UNDERWAY', 'DELAYED'].includes(voyage.status)).length;
  const accounted = personnel.filter(person => person.status !== 'SOS').length;
  const delayedVoyages = voyages.filter(voyage => voyage.status === 'DELAYED').length;
  const fuelInputs = generatorFuel
    ? `${generatorFuel.quantity.toLocaleString()} ${generatorFuel.unit} on hand; ${generatorFuel.dailyBurn} ${generatorFuel.unit}/day; Condition 1 uplift ${Math.round(fuelUplift * 100)}%.`
    : 'Required source row FUEL-D-17 is not present.';
  return <div className="space-y-6">
    <div className="reveal flex flex-wrap items-end justify-between gap-4">
      <div><div className="mono mb-2 text-[10px] font-bold tracking-[.2em] text-[hsl(var(--primary))]">COMMAND CENTRE / 00</div><h1 className="condensed text-5xl font-bold uppercase leading-[.86] tracking-wide md:text-6xl">Command centre<br /><span className="text-[hsl(var(--primary))]">at a glance.</span></h1><p className="mt-3 max-w-xl text-sm text-[hsl(var(--muted-foreground))]">Central authority for station access, expedition readiness, and the decisions that keep every operator moving safely.</p></div>
      <Button data-testid="button-simulate-blizzard" disabled={!can('emergency:write')} title={!can('emergency:write') ? `Role ${role} cannot change emergency state` : undefined} variant={emergency.active ? 'secondary' : 'danger'} onClick={simulateBlizzard}>{emergency.active ? <LockKeyhole size={15} /> : <CloudSnow size={15} />}{emergency.active ? 'CONDITION 1 ACTIVE' : 'SIMULATE CONDITION 1'}</Button>
    </div>
    {emergency.active && <div data-testid="status-active-cascade" className="reveal flex flex-wrap items-center justify-between gap-3 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-red-900"><div className="flex items-center gap-3"><AlertOctagon size={20} /><div><div className="text-xs font-extrabold tracking-wide">EMERGENCY CASCADE PROPAGATED</div><div className="text-xs">Field movement restricted · cargo handling paused · generator runway recalculated at +18% uplift.</div></div></div><Link href="/emergency" className="text-xs font-extrabold underline">OPEN COMMAND CENTER</Link></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="ACTIVE VOYAGES" value={String(activeVoyages).padStart(2, '0')} detail={`${delayedVoyages} delayed in ice corridor`} icon={Anchor} trend="up" provenance={calculatedProvenance('count(voyage where status is UNDERWAY or DELAYED)', `${activeVoyages} active; ${delayedVoyages} delayed`, 'Voyages are counted from the latest API snapshot; route status is not a live navigation feed.')} />
      <Metric label="PERSONNEL ACCOUNTED" value={`${accounted}/${personnel.length}`} detail={`${field} currently in field`} icon={Users} tone={personnel.some(person => person.status === 'SOS') ? 'red' : 'green'} provenance={calculatedProvenance('count(status != SOS) / count(personnel)', `${accounted} not marked SOS out of ${personnel.length}`, 'Roster status is taken from the latest API snapshot; it is not independent beacon confirmation.')} />
      <Metric label="CARGO EXCEPTIONS" value={String(criticalCargo).padStart(2, '0')} detail={`${coldChainLoads} cold-chain · ${shockWatch} shock watch`} icon={Container} tone={criticalCargo ? 'amber' : 'green'} provenance={calculatedProvenance('count(status = CRITICAL)', `${criticalCargo} critical; ${coldChainLoads} cold-chain; ${shockWatch} shock >= 1.5g`, 'Status and sensor fields are values in the current API snapshot; demo-seeded readings are not live telemetry.')} />
      <Metric label="FUEL COVERAGE" value={fuelRunway == null ? '—' : `${fuelRunway}d`} detail={generatorFuel ? emergency.active ? 'Condition 1 runway adjustment active' : 'Current generator-group stock' : 'FUEL-D-17 snapshot row unavailable'} icon={Zap} tone={emergency.active ? 'amber' : 'cyan'} trend="down" provenance={calculatedProvenance('Math.floor(onHand / dailyBurn * (1 - emergencyUplift))', fuelInputs, 'Uses only FUEL-D-17. emergencyUplift is 0.18 during Condition 1 and 0 otherwise; this is the requested runway estimate, distinct from the burn projection.')} />
    </div>
    <section aria-label="Advanced command modules" className="grid gap-4 md:grid-cols-2">
      <Link href="/field" data-testid="card-field-sortie-control" className="panel flex items-start gap-4 p-5 transition-colors hover:border-[hsl(var(--primary))]">
        <div className="rounded-md bg-cyan-50 p-3 text-cyan-800"><RadioTower size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-extrabold">FIELD SORTIE CONTROL</h2><Badge tone={openSorties ? 'amber' : 'green'}>{openSorties} OPEN</Badge></div>
          <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Dispatch crews, record manual check-ins and returns, escalate overdue sorties, and close assignments.</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[hsl(var(--primary))]">OPEN SORTIE CONSOLE <ChevronRight size={14} /></span>
        </div>
      </Link>
      <Link href="/emergency" data-testid="card-emergency-command" className="panel flex items-start gap-4 p-5 transition-colors hover:border-[hsl(var(--primary))]">
        <div className={`rounded-md p-3 ${emergency.active ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700'}`}><AlertOctagon size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-extrabold">CONDITION 1 & RECOVERY</h2><Badge tone={emergency.active ? 'red' : 'cyan'}>{emergency.active ? 'ACTIVE' : 'STANDBY'}</Badge></div>
          <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Review cascade status, recall state, and the recovery checklist. Dispatch stays blocked until recovery is confirmed.</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[hsl(var(--primary))]">OPEN EMERGENCY CONTROL <ChevronRight size={14} /></span>
        </div>
      </Link>
    </section>
    <OperatorApprovalQueue />
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <div className="panel p-5 reveal reveal-delay-1"><SectionTitle eyebrow="STATION PICTURE / SNAPSHOT" title="Theatre status" detail="Occupancy, weather, and readiness from the latest operations snapshot" action={<Link href="/personnel" className="text-xs font-bold text-[hsl(var(--primary))]">Muster detail <ChevronRight size={14} className="inline" /></Link>} /><div className="grid gap-3 sm:grid-cols-2">{stationState.map(station => <div key={station.code} data-testid={`card-station-${station.code.toLowerCase()}`} className="group rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 transition-colors hover:border-[hsl(var(--primary)/.45)]"><div className="flex items-start justify-between"><div><div className="mono text-[10px] font-bold tracking-[.15em] text-[hsl(var(--primary))]">{station.code} / {station.coordinates}</div><div className="mt-1 text-base font-extrabold">{station.name}</div></div><StatusBadge status={station.code === 'MAI' && emergency.active ? 'RECALLED' : 'ON STATION'} /></div><div className="mt-4 flex items-end justify-between"><div><div className="text-[11px] text-[hsl(var(--muted-foreground))]">{station.theatre}</div><div className="mt-1 flex items-center gap-2 text-xs font-bold"><CloudSnow size={13} />{station.weather}</div></div><div className="text-right"><div className="mono text-sm font-bold">{station.occupancy}<span className="text-[hsl(var(--muted-foreground))]">/{station.capacity}</span></div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">occupancy</div></div></div></div>)}</div></div>
      <div className="panel p-5 reveal reveal-delay-2"><SectionTitle eyebrow="COMMAND LOG / UTC" title="Activity feed" action={<Activity size={18} className="text-[hsl(var(--primary))]" />} /><div className="space-y-1">{events.slice(0, 6).map(event => <div key={event.id} data-testid={`event-${event.id}`} className="flex gap-3 border-b border-[hsl(var(--border)/.75)] py-3 last:border-0"><div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.tone === 'red' ? 'bg-red-500' : event.tone === 'amber' ? 'bg-amber-400' : event.tone === 'green' ? 'bg-emerald-500' : 'bg-cyan-600'}`} /><div className="min-w-0"><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{event.time} · {event.module}</div><div className="mt-0.5 text-xs font-semibold leading-relaxed">{event.action}</div></div></div>)}</div></div>
    </div>
  </div>;
}

function VoyageDetailModal({ voyage, onClose }: { voyage: Voyage; onClose: () => void }) {
  const { emergency, updateVoyageStatus, can, role } = useOps();
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
        <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['STATUS', voyage.status], ['ICE ENTRY', voyage.iceEntry], ['DEPARTURE', voyage.departure], ['DELAY', voyage.delay ? `+${voyage.delay} DAY` : 'ON PLAN']].map(([label, value]) => <div key={label} className="rounded-lg border border-[hsl(var(--border))] p-3"><div className="mono text-[9px] font-bold tracking-[.12em] text-[hsl(var(--muted-foreground))]">{label}</div><div className="mt-2 text-xs font-extrabold">{value}</div></div>)}</div><div className="rounded-lg border border-[hsl(var(--border))] p-4"><div className="mono text-[10px] font-bold tracking-[.16em] text-[hsl(var(--primary))]">MISSION TELEMETRY</div><div className="mt-3 space-y-3 text-xs"><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Navigation state</span><strong>{voyage.status === 'UNDERWAY' ? 'Ice corridor transit' : voyage.status === 'DELAYED' ? 'Holding outside ice edge' : 'Ready for departure'}</strong></div><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Destination node</span><strong>{destination} / polar logistics cell</strong></div><div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Weather watch</span><strong>{emergency.active ? 'Condition 1 · restricted' : 'Nominal watch · 2.4m swell'}</strong></div></div></div><div className="rounded-lg bg-[hsl(var(--muted)/.55)] p-4"><div className="text-xs font-extrabold">Operational actions</div><div className="mt-3 flex flex-wrap gap-2"><Button disabled={!can('voyage:write')} variant="secondary" onClick={() => act('Voyage marked ready', 'READY')}>MARK READY</Button><Button disabled={!can('voyage:write')} variant="primary" onClick={() => act('Voyage released underway', 'UNDERWAY')}>RELEASE UNDERWAY</Button><Button disabled={!can('voyage:write')} variant="danger" onClick={() => act('Voyage delayed by command', 'DELAYED')}>HOLD / DELAY</Button></div>{!can('voyage:write') && <div className="mt-3 text-[10px] text-muted-foreground">Role {role} cannot change voyage status.</div>}{actionState && <div className="mt-3 text-[11px] font-bold text-emerald-700">{actionState} · recorded in command state.</div>}</div></div>
      </div>
    </div>
  </div>;
}

function Expedition() {
  const { voyages, addVoyage, selectedVoyageId, selectVoyage, can, role } = useOps();
  const [modal, setModal] = useState(false);
  const expeditionNumbers = voyages.map(voyage => Number(voyage.expedition.match(/\d+$/)?.[0])).filter(Number.isFinite);
  const defaultExpedition = `NCPOR-${Math.max(46, ...expeditionNumbers) + 1}`;
  const milestones = [{ label: 'Port departure', date: '18 JAN', state: 'complete' }, { label: 'Southern Ocean', date: '23 JAN', state: 'complete' }, { label: 'Ice entry', date: '31 JAN', state: 'active' }, { label: 'Maitri offload', date: '04 FEB', state: 'next' }, { label: 'Return window', date: '18 FEB', state: 'next' }];
  return <div className="space-y-6">
    <SectionTitle
      eyebrow="EXPEDITION CONTROL / 01"
      title="Voyage planning"
      detail="Critical path across ice corridors"
      action={<Button data-testid="button-create-voyage" disabled={!can('voyage:write')} title={!can('voyage:write') ? `Role ${role} cannot create voyages` : undefined} onClick={() => setModal(true)}><Plus size={16} />CREATE VOYAGE</Button>}
    />
    {!can('voyage:write') && <p className="text-xs text-muted-foreground">Voyage creation and updates require LOGISTICS or COMMAND. COMMAND has access to every operation.</p>}
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="NEXT ICE ENTRY" value="31 JAN" detail="MV Vasundhara · 14:00 UTC" icon={CalendarDays} />
      <Metric label="FLEET READINESS" value="94%" detail="2 vessels ready to sail" icon={ShieldCheck} tone="green" />
      <Metric label="PATH RISK" value="MODERATE" detail="Maitri weather watch active" icon={CloudSnow} tone="amber" />
    </div>
    <div className="panel overflow-hidden p-5">
      <SectionTitle eyebrow="CRITICAL PATH / NCPOR-44" title="Ice corridor timeline" detail="MV Vasundhara · PC-6 · Cape Town → Maitri" />
      <div className="grid-lines overflow-x-auto rounded-md border border-[hsl(var(--border))] p-6">
        <div className="min-w-[700px]">
          <div className="relative mb-10 h-1 rounded bg-[hsl(var(--border))]">
            <div className="absolute left-0 top-0 h-1 w-[62%] rounded bg-[hsl(var(--primary))]" />
            {milestones.map((milestone, index) => <div key={milestone.label} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${index * 25}%` }}><div className={`h-4 w-4 rounded-full border-4 border-[hsl(var(--card))] ${milestone.state === 'complete' ? 'bg-[hsl(var(--primary))]' : milestone.state === 'active' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted-foreground))]'}`} /></div>)}
          </div>
          <div className="grid grid-cols-5 gap-3">
            {milestones.map(milestone => <div key={milestone.label}><div className="mono text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{milestone.date}</div><div className="mt-1 text-xs font-bold">{milestone.label}</div><div className="mt-2"><Badge tone={milestone.state === 'complete' ? 'green' : milestone.state === 'active' ? 'amber' : 'slate'}>{milestone.state}</Badge></div></div>)}
          </div>
        </div>
      </div>
    </div>
    <div className="panel overflow-hidden">
      <div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="FLEET BOARD" title="Mission plans" detail="Select a voyage to open its operational record" /></div>
      <div className="divide-y divide-[hsl(var(--border))]">
        {voyages.length === 0 ? <EmptyState title="No mission plans" detail="Create a voyage plan to establish the first critical path." /> : voyages.map(voyage => <div key={voyage.id} data-testid={`row-voyage-${voyage.id}`} className={`grid gap-3 px-5 py-4 md:grid-cols-[1.1fr_1.2fr_1fr_1fr_auto] md:items-center ${selectedVoyageId === voyage.id ? 'bg-cyan-50/60' : ''}`}>
          <div><div className="mono text-[10px] text-[hsl(var(--primary))]">{voyage.expedition} · {voyage.polarClass}</div><div className="mt-1 font-extrabold">{voyage.vessel}</div>{voyage.vesselImo && <div className="mt-1 text-[10px] text-muted-foreground">Registry / IMO · {voyage.vesselImo}</div>}</div>
          <div><div className="text-xs font-semibold">{voyage.route}</div><div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Departure {voyage.departure}</div></div>
          <div><div className="mono text-xs">{voyage.iceEntry}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">ice entry ETA</div></div>
          <div><StatusBadge status={voyage.status} />{voyage.delay > 0 && <span className="ml-2 text-[10px] font-bold text-red-700">+{voyage.delay}d</span>}</div>
          <button data-testid={`button-open-voyage-${voyage.id}`} onClick={() => selectVoyage(voyage.id)} className="flex h-10 items-center justify-center rounded-md border border-[hsl(var(--border))] px-3 text-xs font-bold hover:bg-[hsl(var(--muted))]">OPEN <ChevronRight size={14} /></button>
        </div>)}
      </div>
      {selectedVoyageId && voyages.find(item => item.id === selectedVoyageId) && <VoyageDetailModal voyage={voyages.find(item => item.id === selectedVoyageId) as Voyage} onClose={() => selectVoyage(null)} />}
      {modal && <VoyageModal defaultExpedition={defaultExpedition} onClose={() => setModal(false)} onCreate={addVoyage} />}
    </div>
  </div>;
}

function dateInputAfter(daysAhead: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function VoyageModal({ defaultExpedition, onClose, onCreate }: { defaultExpedition: string; onClose: () => void; onCreate: (voyage: Voyage) => Promise<boolean> }) {
  const [expedition, setExpedition] = useState(defaultExpedition);
  const [vessel, setVessel] = useState('MV Sagar Kanya');
  const [vesselImo, setVesselImo] = useState('');
  const [polarClass, setPolarClass] = useState('PC-5');
  const [departurePort, setDeparturePort] = useState('Cape Town');
  const [destination, setDestination] = useState('Bharati');
  const [departure, setDeparture] = useState(() => dateInputAfter(14));
  const [iceEntry, setIceEntry] = useState(() => dateInputAfter(24));
  const [status, setStatus] = useState<Status>('READY');
  const [saving, setSaving] = useState(false);
  const dateRangeValid = Boolean(departure && iceEntry && iceEntry >= departure);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dateRangeValid || saving) return;
    setSaving(true);
    try {
      const saved = await onCreate({
        id: crypto.randomUUID(),
        expedition: expedition.trim(),
        vessel: vessel.trim(),
        vesselImo: vesselImo.trim() || undefined,
        polarClass: polarClass.trim(),
        route: `${departurePort.trim()} → ${destination.trim()}`,
        status,
        departure,
        iceEntry,
        delay: 0,
      });
      if (saved) onClose();
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[hsl(var(--sidebar)/.72)] p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="voyage-modal-title" className="panel my-auto w-full max-w-3xl p-6 shadow-2xl">
      <div className="flex items-start justify-between">
        <div><div className="mono text-[10px] tracking-[.18em] text-[hsl(var(--primary))]">MISSION BUILDER</div><h3 id="voyage-modal-title" className="condensed mt-1 text-3xl font-bold uppercase">Create voyage</h3><p className="mt-1 text-xs text-muted-foreground">Enter the route and schedule details. Saved plans appear in the Fleet Board.</p></div>
        <button type="button" data-testid="button-close-voyage-modal" disabled={saving} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><X size={18} /></button>
      </div>
      <form onSubmit={submit} className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-bold">Expedition number<input required maxLength={20} value={expedition} onChange={event => setExpedition(event.target.value)} placeholder="NCPOR-47" className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="block text-xs font-bold">Vessel name<input required maxLength={100} value={vessel} onChange={event => setVessel(event.target.value)} placeholder="Vessel name" className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="block text-xs font-bold">Vessel IMO / registry reference <span className="font-normal text-muted-foreground">(optional)</span><input maxLength={20} value={vesselImo} onChange={event => setVesselImo(event.target.value)} placeholder="Leave blank to generate a registry reference" className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="block text-xs font-bold">Polar class<input required maxLength={10} value={polarClass} onChange={event => setPolarClass(event.target.value)} placeholder="PC-5" className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="block text-xs font-bold">Departure port<input required maxLength={50} value={departurePort} onChange={event => setDeparturePort(event.target.value)} placeholder="Cape Town" className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="block text-xs font-bold">Destination / intermediate port<input required maxLength={50} value={destination} onChange={event => setDestination(event.target.value)} placeholder="Maitri" className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="block text-xs font-bold">Planned departure date<input required type="date" min={dateInputAfter(0)} value={departure} onChange={event => setDeparture(event.target.value)} className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="block text-xs font-bold">Estimated ice-entry date<input required type="date" min={departure || dateInputAfter(0)} value={iceEntry} onChange={event => setIceEntry(event.target.value)} className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="block text-xs font-bold">Initial voyage status<select value={status} onChange={event => setStatus(event.target.value as Status)} className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="READY">PLANNED / READY</option><option value="UNDERWAY">UNDERWAY</option><option value="DELAYED">DELAYED</option></select></label>
        </div>
        {!dateRangeValid && <p role="alert" className="mt-3 text-xs font-semibold text-red-700">Ice-entry date must be the same day as or later than planned departure.</p>}
        <div className="mt-7 flex justify-end gap-2">
          <Button type="button" data-testid="button-cancel-voyage" variant="ghost" disabled={saving} onClick={onClose}>CANCEL</Button>
          <Button type="submit" data-testid="button-submit-voyage" disabled={saving || !dateRangeValid}><Check size={15} />{saving ? 'SAVING…' : 'SAVE MISSION PLAN'}</Button>
        </div>
      </form>
    </div>
  </div>;
}

function Cargo() {
  const { cargo, simulateAnomaly, can, role } = useOps();
  const [query, setQuery] = useState('');
  const visible = cargo.filter(item => `${item.tracking} ${item.description} ${item.destination}`.toLowerCase().includes(query.toLowerCase()));
  const chart = [{ time: '00:00', temp: -16.2, limit: -12 }, { time: '02:00', temp: -16.8, limit: -12 }, { time: '04:00', temp: -17.1, limit: -12 }, { time: '06:00', temp: -15.9, limit: -12 }, { time: '08:00', temp: -17.2, limit: -12 }, { time: '10:00', temp: -16.9, limit: -12 }];
  const critical = cargo.filter(item => item.status === 'CRITICAL').length;
  const held = cargo.filter(item => item.status === 'HOLD').length;
  const totalMassKg = cargo.reduce((total, item) => total + item.weight, 0);
  return <div className="space-y-6">
    <SectionTitle eyebrow="CARGO TELEMETRY / 02" title="Cold-chain & stowage" detail="Consignment records are snapshot-backed; the plotted temperature trace is an illustrative fixture, not live telemetry." action={<Button disabled={!can('cargo:write')} title={!can('cargo:write') ? `Role ${role} cannot change cargo` : undefined} data-testid="button-simulate-anomaly" variant="secondary" onClick={simulateAnomaly}><Thermometer size={16} />SIMULATE ANOMALY</Button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="CONTAINERS TRACKED" value={String(cargo.length).padStart(2, '0')} detail={`${Math.max(0, cargo.length - critical - held)} not held or critical · ${held} hold · ${critical} critical`} icon={Container} provenance={calculatedProvenance('count(cargo records)', `${cargo.length} consignment records in the latest snapshot`, 'Snapshot records may be seeded demo data; status is not independent confirmation.')} />
      <Metric label="COLD-CHAIN PASS" value="92.4%" detail="Illustrative score · not calculated from telemetry" icon={Snowflake} tone="amber" />
      <Metric label="TOTAL MASS" value={`${(totalMassKg / 1000).toFixed(2)}t`} detail={`Across ${new Set(cargo.map(item => item.destination)).size} destinations in the snapshot`} icon={Boxes} provenance={calculatedProvenance('sum(cargo.weight) / 1000', `${totalMassKg.toLocaleString()} kg across ${cargo.length} records`, 'The manifest weights are snapshot values; no packaging or tare adjustment is applied.')} />
      <Metric label="SENSOR CHANNELS" value="18/18" detail="Illustrative channel count · source heartbeat unavailable" icon={Radio} tone="green" />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <div className="panel p-5">
        <SectionTitle eyebrow="DEMO SERIES / PLX-804-19" title="Temperature trace" detail="Illustrative Maitri reefer trace · tolerance −20° to −12° C" />
        <ProvenanceDisclosure provenance={{ kind: 'SIMULATED', source: 'Static temperature-series fixture in the web client; it is not read from cargo_telemetry.', formula: 'No calculation; six example points are plotted as supplied.', inputs: '00:00–10:00 example temperatures and a fixed −12°C limit.', assumptions: 'This chart does not update when the API cargo record changes and is not a live cold-chain alarm source.' }} />
        <div className="h-60"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}><defs><linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1594a3" stopOpacity=".27" /><stop offset="100%" stopColor="#1594a3" stopOpacity=".02" /></linearGradient></defs><CartesianGrid stroke="#d7e2e7" strokeDasharray="2 4" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} /><YAxis tick={{ fontSize: 10, fill: '#64748b' }} /><ChartTooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #d7e2e7' }} /><Area type="monotone" dataKey="limit" name="Illustrative limit" stroke="#d5a52b" strokeDasharray="4 3" fill="none" strokeWidth={1.5} /><Area type="monotone" dataKey="temp" name="Example temperature" stroke="#1594a3" fill="url(#tempFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
      </div>
      <div className="panel p-5">
        <SectionTitle eyebrow="SNAPSHOT STOWAGE / BAY 03" title="Container grid" detail="Status tiles from the latest cargo snapshot; no crane-control link is connected." />
        <div className="grid grid-cols-4 gap-2 rounded-md bg-[hsl(var(--sidebar))] p-3">{cargo.map((item, index) => <div key={item.tracking} data-testid={`tile-container-${item.tracking}`} className={`flex aspect-square flex-col justify-between rounded border p-2 ${item.status === 'CRITICAL' ? 'border-red-400 bg-red-500/20' : item.status === 'HOLD' ? 'border-amber-400 bg-amber-400/20' : 'border-cyan-300/40 bg-cyan-300/10'}`}><span className="mono text-[9px] text-slate-300">0{index + 1}</span><Container size={17} className={item.status === 'CRITICAL' ? 'text-red-300' : 'text-cyan-200'} /><span className="mono text-[8px] text-slate-300">{item.tracking.slice(-2)}</span></div>)}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px]"><div><div className="mx-auto mb-1 h-2 w-2 rounded-full bg-cyan-400" />NORMAL</div><div><div className="mx-auto mb-1 h-2 w-2 rounded-full bg-amber-400" />HOLD</div><div><div className="mx-auto mb-1 h-2 w-2 rounded-full bg-red-400" />EXCEPTION</div></div>
      </div>
    </div>
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] p-5"><div><div className="mono text-[10px] tracking-[.18em] text-[hsl(var(--primary))]">CONSIGNMENT REGISTER</div><h2 className="condensed mt-1 text-2xl font-bold uppercase">Snapshot records</h2></div><div className="relative"><Search size={15} className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]" /><input data-testid="input-cargo-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tracking or destination" className="h-10 w-64 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] pl-9 pr-3 text-xs outline-none focus:border-[hsl(var(--primary))]" /></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-[hsl(var(--muted)/.55)] text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><tr><th className="px-5 py-3">Tracking</th><th className="px-3 py-3">Description</th><th className="px-3 py-3">Destination</th><th className="px-3 py-3">Temp</th><th className="px-3 py-3">Shock</th><th className="px-3 py-3">State</th></tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{visible.map(item => <tr key={item.tracking} data-testid={`row-cargo-${item.tracking}`}><td className="px-5 py-4 mono font-bold text-[hsl(var(--primary))]">{item.tracking}</td><td className="px-3 py-4 font-bold">{item.description}<div className="mt-1 text-[10px] font-normal text-[hsl(var(--muted-foreground))]">{item.type} · {item.weight} kg</div></td><td className="px-3 py-4">{item.destination}</td><td className={`px-3 py-4 mono font-bold ${item.status === 'CRITICAL' ? 'text-red-700' : ''}`}>{item.temperature.toFixed(1)}°C</td><td className="px-3 py-4 mono">{item.shock.toFixed(2)}g</td><td className="px-3 py-4"><StatusBadge status={item.status} /></td></tr>)}</tbody></table>{visible.length === 0 && <EmptyState title="No telemetry matches" detail="Try a tracking number, destination, or clear the search query." />}</div>
    </div>
  </div>;
}

function Inventory() {
  const { inventory, adjustStock, emergency, can, role } = useOps();
  const [whatIfUpliftPercent, setWhatIfUpliftPercent] = useState(Math.round(DEFAULT_EMERGENCY_UPLIFT * 100));
  const [projectionDay, setProjectionDay] = useState(10);
  const fuelItem = inventory.find(item => item.sku === 'FUEL-D-17');
  const waterItem = inventory.find(item => item.sku === 'LIFE-W-04');
  const oxygenItem = inventory.find(item => item.sku === 'LIFE-O-11');
  const activeUplift = emergency.active ? DEFAULT_EMERGENCY_UPLIFT : 0;
  const whatIfUplift = whatIfUpliftPercent / 100;
  const getRunway = (item: InventoryItem | undefined, uplift: number) =>
    item && item.dailyBurn > 0 ? calculateRunwayDays(item.quantity, item.dailyBurn, uplift) : null;
  const fuelRunway = getRunway(fuelItem, activeUplift);
  const scenarioRunway = getRunway(fuelItem, whatIfUplift);
  const lifeSupportStocks = [waterItem, oxygenItem].filter((item): item is InventoryItem => Boolean(item));
  const lifeSupportRunways = lifeSupportStocks.map(item => getRunway(item, 0));
  const lifeSupportRunway = lifeSupportRunways.length === 2 && lifeSupportRunways.every((days): days is number => days !== null)
    ? Math.min(...lifeSupportRunways)
    : null;
  const criticalStocks = inventory.filter(item => item.quantity <= item.threshold * 1.25).length;
  const burnData = fuelItem && fuelItem.dailyBurn > 0
    ? Array.from({ length: 25 }, (_, day) => ({
        day: `D${day}`,
        nominal: projectedLitresAtDayN(fuelItem.quantity, fuelItem.dailyBurn, day, 0),
        currentCondition: projectedLitresAtDayN(fuelItem.quantity, fuelItem.dailyBurn, day, activeUplift),
        whatIf: projectedLitresAtDayN(fuelItem.quantity, fuelItem.dailyBurn, day, whatIfUplift),
      }))
    : [];
  const projectionAtSelectedDay = fuelItem && fuelItem.dailyBurn > 0
    ? projectedLitresAtDayN(fuelItem.quantity, fuelItem.dailyBurn, projectionDay, whatIfUplift)
    : null;
  const drawProfiles = [
    { label: 'Generator group', sku: 'FUEL-D-17', color: 'bg-cyan-600', upliftSensitive: true },
    { label: 'Aviation reserve', sku: 'FUEL-A-02', color: 'bg-amber-500', upliftSensitive: false },
    { label: 'Water treatment', sku: 'LIFE-W-04', color: 'bg-slate-500', upliftSensitive: false },
  ].flatMap(profile => {
    const item = inventory.find(candidate => candidate.sku === profile.sku);
    return item ? [{ ...profile, item }] : [];
  });
  const effectiveDraws = drawProfiles.map(profile => profile.item.dailyBurn * (profile.upliftSensitive ? 1 + activeUplift : 1));
  const maxDraw = Math.max(1, ...effectiveDraws);
  const generatorInputs = fuelItem
    ? `${fuelItem.sku}: ${fuelItem.quantity.toLocaleString()} ${fuelItem.unit} on hand; ${fuelItem.dailyBurn} ${fuelItem.unit}/day; active uplift ${Math.round(activeUplift * 100)}%.`
    : 'Required inventory row FUEL-D-17 is missing from the snapshot.';
  const lifeSupportInputs = lifeSupportStocks.map(item => `${item.name}: ${item.quantity} ${item.unit} / ${item.dailyBurn} ${item.unit}/day`).join('; ');
  return <div className="space-y-6">
    <SectionTitle eyebrow="INVENTORY & BURN / 03" title="Sustainment picture" detail="Stock runway is calculated from the current inventory snapshot and each item’s recorded burn rate." action={<Badge tone={emergency.active ? 'amber' : 'green'}><Zap size={10} />{emergency.active ? 'CONDITION 1 UPLIFT ACTIVE' : 'NOMINAL BURN PROFILE'}</Badge>} />
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="CRITICAL STOCKS" value={String(criticalStocks).padStart(2, '0')} detail="At or below 125% of safety threshold" icon={AlertTriangle} tone={criticalStocks ? 'amber' : 'green'} provenance={calculatedProvenance('count(quantity <= safetyThreshold * 1.25)', `${criticalStocks} of ${inventory.length} inventory records`, 'The 125% review trigger is a display threshold; it is not a procurement decision.')} />
      <Metric label="FUEL RUNWAY" value={fuelRunway == null ? '—' : `${fuelRunway}d`} detail={fuelItem ? emergency.active ? `${fuelItem.name} · Condition 1 runway adjustment` : `${fuelItem.name} · nominal scenario` : 'FUEL-D-17 missing or burn rate unavailable'} icon={Zap} tone={emergency.active ? 'amber' : 'cyan'} provenance={calculatedProvenance('Math.floor(onHand / dailyBurn * (1 - emergencyUplift))', `${generatorInputs} Result: ${fuelRunway == null ? 'not available' : `${fuelRunway} days`}.`, 'Uses only FUEL-D-17. During Condition 1, emergencyUplift is 0.18; otherwise it is 0.')} />
      <Metric label="LIFE SUPPORT" value={lifeSupportRunway == null ? '—' : `${lifeSupportRunway}d`} detail={lifeSupportRunway == null ? 'Water and oxygen records required' : `Limiting stock: ${lifeSupportRunways[0]! <= lifeSupportRunways[1]! ? 'water' : 'oxygen'}`} icon={LifeBuoy} tone="green" provenance={calculatedProvenance('min(water runway, oxygen runway)', `${lifeSupportInputs || 'Water and/or oxygen inventory records are missing.'}`, 'Uses each item’s recorded daily burn with emergencyUplift = 0; the generator uplift is not applied to water or oxygen.')} />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
      <div className="panel p-5">
        <SectionTitle eyebrow="CONTINGENCY PROJECTION" title="Fuel runway & what-if" detail={fuelItem ? `${fuelItem.name} · ${fuelItem.quantity.toLocaleString()} ${fuelItem.unit} on hand · ${fuelItem.dailyBurn} ${fuelItem.unit}/day baseline` : 'FUEL-D-17 is missing; projection is unavailable.'} />
        {burnData.length ? <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={burnData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
              <defs><linearGradient id="fuelFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d5a52b" stopOpacity=".28" /><stop offset="100%" stopColor="#d5a52b" stopOpacity=".03" /></linearGradient></defs>
              <CartesianGrid stroke="#d7e2e7" strokeDasharray="2 4" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <ChartTooltip />
              <Area type="monotone" dataKey="nominal" name="Nominal projection" stroke="#64748b" strokeDasharray="4 3" fill="none" strokeWidth={1.5} />
              <Area type="monotone" dataKey="currentCondition" name="Current Condition 1 projection" stroke="#bd8d1b" fill="url(#fuelFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="whatIf" name="Selected what-if projection" stroke="#087f8c" strokeDasharray="6 3" fill="none" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div> : <EmptyState title="Fuel projection unavailable" detail="The snapshot must contain FUEL-D-17 with a positive daily burn rate." />}
        <div className="mt-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4">
          <div className="mono text-[10px] font-bold tracking-[.14em] text-[hsl(var(--primary))]">WHAT-IF INPUTS</div>
          <label className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold" htmlFor="input-emergency-uplift">
            <span>Emergency uplift</span><span className="mono">{whatIfUpliftPercent}%</span>
          </label>
          <input id="input-emergency-uplift" data-testid="input-emergency-uplift" type="range" min="0" max="50" step="1" value={whatIfUpliftPercent} onChange={event => setWhatIfUpliftPercent(Number(event.target.value))} className="mt-2 w-full accent-cyan-700" />
          <label className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-bold" htmlFor="input-projection-day">
            <span>Projection horizon</span><span className="mono">Day {projectionDay}</span>
          </label>
          <input id="input-projection-day" data-testid="input-projection-day" type="range" min="0" max="24" step="1" value={projectionDay} onChange={event => setProjectionDay(Number(event.target.value))} className="mt-2 w-full accent-cyan-700" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-[hsl(var(--border))] bg-white/70 p-3"><div className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">WHAT-IF RUNWAY</div><div className="condensed mt-1 text-3xl font-bold">{scenarioRunway == null ? '—' : `${scenarioRunway}d`}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))">requested runway formula</div></div>
            <div className="rounded border border-[hsl(var(--border))] bg-white/70 p-3"><div className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">PROJECTED STOCK AT DAY {projectionDay}</div><div className="condensed mt-1 text-3xl font-bold">{projectionAtSelectedDay == null ? '—' : `${projectionAtSelectedDay.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${fuelItem?.unit || 'L'}`}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">negative means modeled demand exceeds stock</div></div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))]">The two approved expressions use uplift differently: runway multiplies by (1 − uplift), while the projection multiplies burn by (1 + uplift). They are shown separately and are not expected to reconcile. No 72-hour reserve deduction is included.</p>
          <ProvenanceDisclosure provenance={calculatedProvenance('Runway: Math.floor(onHand / dailyBurn * (1 - uplift)); projection: onHand - (dailyBurn * N * (1 + uplift))', `${generatorInputs} Selected scenario: ${whatIfUpliftPercent}% uplift at day ${projectionDay}.`, 'Projection values remain negative after modeled stock-out to show the demand shortfall; the two supplied formulas intentionally have different uplift assumptions.')} />
        </div>
      </div>
      <div className="panel p-5">
        <SectionTitle eyebrow="BURN PROFILE" title="Daily draw" detail="Draws are read from inventory rows; only generator diesel receives the Condition 1 uplift." />
        {drawProfiles.length ? <div className="space-y-5">{drawProfiles.map(profile => {
          const value = profile.item.dailyBurn * (profile.upliftSensitive ? 1 + activeUplift : 1);
          return <div key={profile.sku}>
            <div className="flex justify-between gap-3 text-xs font-bold"><span>{profile.label}</span><span className="mono">{value.toLocaleString(undefined, { maximumFractionDigits: 1 })} {profile.item.unit}/day</span></div>
            <div className="mt-2 h-2 rounded-full bg-[hsl(var(--muted))]"><div className={`h-2 rounded-full ${profile.color}`} style={{ width: `${Math.min(100, Math.max(4, (value / maxDraw) * 100))}%` }} /></div>
            {profile.upliftSensitive && emergency.active && <div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Baseline: {profile.item.dailyBurn} {profile.item.unit}/day × 1.18.</div>}
          </div>;
        })}</div> : <EmptyState title="No burn data" detail="Daily draw rates are unavailable in the current inventory snapshot." />}
        <div className="mt-7 border-t border-[hsl(var(--border))] pt-4 text-xs text-[hsl(var(--muted-foreground))]">Water and oxygen estimates use their recorded draw rates without the generator-only emergency uplift.</div>
      </div>
    </div>
    <div className="panel overflow-hidden">
      <div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="VED REGISTER" title="Stock adjustment controls" detail="Adjustments are sent to the authenticated operations API and committed to Supabase." /></div>
      <div className="divide-y divide-[hsl(var(--border))]">{inventory.map(item => {
        const pct = Math.min(100, (item.quantity / (item.threshold * 3)) * 100);
        const low = item.quantity <= item.threshold * 1.25;
        const itemUplift = emergency.active && item.category.includes('FUEL') ? DEFAULT_EMERGENCY_UPLIFT : 0;
        const itemRunway = getRunway(item, itemUplift);
        return <div key={item.sku} data-testid={`row-inventory-${item.sku}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1.25fr_.8fr_1fr_.8fr_auto] md:items-center">
          <div><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-black ${item.ved === 'V' ? 'bg-red-100 text-red-700' : item.ved === 'E' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{item.ved}</span><div><div className="text-xs font-extrabold">{item.name}</div><div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{item.sku} · {item.station}</div></div></div></div>
          <div className="text-xs"><span className="text-[hsl(var(--muted-foreground))]">on hand </span><strong className="mono">{item.quantity.toLocaleString()} {item.unit}</strong></div>
          <div><div className="mb-1 flex justify-between gap-2 text-[10px]"><span>{item.category}</span><span className={low ? 'font-bold text-amber-700' : 'text-[hsl(var(--muted-foreground))]'}>{low ? 'REVIEW' : item.dailyBurn > 0 ? `${item.dailyBurn} / day · ${itemRunway}d runway` : 'burn rate unavailable'}</span></div><div className="h-1.5 rounded-full bg-[hsl(var(--muted))]"><div className={`h-1.5 rounded-full ${low ? 'bg-amber-500' : 'bg-[hsl(var(--primary))]'}`} style={{ width: `${pct}%` }} /></div></div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))]">threshold<br /><strong className="mono text-[hsl(var(--foreground))]">{item.threshold} {item.unit}</strong></div>
          <div className="flex gap-1"><button disabled={!can('inventory:write')} title={!can('inventory:write') ? `Role ${role} cannot adjust stock` : undefined} data-testid={`button-decrease-${item.sku}`} onClick={() => adjustStock(item.sku, -10)} className="h-10 w-10 rounded-md border border-[hsl(var(--border))] text-lg font-bold hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-40">−</button><button disabled={!can('inventory:write')} title={!can('inventory:write') ? `Role ${role} cannot adjust stock` : undefined} data-testid={`button-increase-${item.sku}`} onClick={() => adjustStock(item.sku, 10)} className="h-10 w-10 rounded-md border border-[hsl(var(--border))] text-lg font-bold hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-40">+</button></div>
        </div>;
      })}</div>
    </div>
  </div>;
}

function Personnel() {
  const { personnel, setPersonStatus, toggleOnline, emergency, fieldSorties, can } = useOps();
  const openAssignmentIds = new Set(fieldSorties.filter(sortie => sortie.status !== 'COMPLETED').flatMap(sortie => sortie.assignedPersonnel.filter(person => person.status !== 'RETURNED').map(person => person.id)));
  const statusCounts = { indoor: personnel.filter(person => person.status === 'INDOOR').length, field: personnel.filter(person => person.status === 'FIELD').length, sos: personnel.filter(person => person.status === 'SOS').length };
  const accounted = personnel.length - statusCounts.sos;
  return <div className="space-y-6">
    <SectionTitle eyebrow="PERSONNEL READINESS / 04" title="Muster & field safety" detail="Roster status from the operations snapshot; refresh does not independently verify beacon hardware." action={<Button data-testid="button-reconcile-muster" variant="secondary" onClick={toggleOnline}><RefreshCw size={15} />REFRESH ROSTER SNAPSHOT</Button>} />
    <div className="grid gap-4 sm:grid-cols-3">
      <Metric label="ACCOUNTED" value={`${accounted}/${personnel.length}`} detail="Roster rows not marked SOS; not independent confirmation" icon={Users} tone={statusCounts.sos ? 'red' : 'green'} provenance={calculatedProvenance('count(status != SOS) / count(personnel)', `${accounted} not marked SOS out of ${personnel.length}`, 'A roster status is not equivalent to a verified muster or beacon signal.')} />
      <Metric label="FIELD ACTIVE" value={String(statusCounts.field).padStart(2, '0')} detail="Roster rows marked FIELD; no live beacon link" icon={HardHat} tone="amber" provenance={calculatedProvenance('count(person.status = FIELD)', `${statusCounts.field} personnel records`, 'This counts status fields in the snapshot, not active beacon transmissions.')} />
      <Metric label="READINESS INDEX" value="91%" detail="Illustrative score; scoring formula and source are unavailable" icon={ShieldCheck} tone="cyan" />
    </div>
    <div className="panel p-5">
      <SectionTitle eyebrow="FIELD SAFETY OVERVIEW" title="Status channels" detail="Use the controls to update each person’s recorded operating state" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-cyan-200 bg-cyan-50 p-4"><div className="flex items-center justify-between"><span className="text-xs font-extrabold text-cyan-900">INDOOR / STATION</span><div className="h-2 w-2 rounded-full bg-cyan-600" /></div><div className="condensed mt-2 text-4xl font-bold text-cyan-900">{statusCounts.indoor}</div><div className="text-[11px] text-cyan-800">Roster status marked indoors</div></div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between"><span className="text-xs font-extrabold text-amber-900">FIELD / ROSTER</span><div className="h-2 w-2 rounded-full bg-amber-500 pulse-dot" /></div><div className="condensed mt-2 text-4xl font-bold text-amber-900">{statusCounts.field}</div><div className="text-[11px] text-amber-800">No live beacon hardware connection</div></div>
        <div className="rounded-md border border-red-200 bg-red-50 p-4"><div className="flex items-center justify-between"><span className="text-xs font-extrabold text-red-900">SOS / RESPONSE</span><div className="h-2 w-2 rounded-full bg-red-500 pulse-dot" /></div><div className="condensed mt-2 text-4xl font-bold text-red-900">{statusCounts.sos}</div><div className="text-[11px] text-red-800">Roster records marked SOS</div></div>
      </div>
    </div>
    <div className="panel overflow-hidden">
      <div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="ROSTER / SNAPSHOT" title="Personnel register" detail="Medical and training fields are present in the snapshot; verify with the responsible station before operational use." /></div>
       <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-[hsl(var(--muted)/.55)] text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><tr><th className="px-5 py-3">Person</th><th className="px-3 py-3">Station / phase</th><th className="px-3 py-3">Medical</th><th className="px-3 py-3">Training</th><th className="px-3 py-3">Operating state</th><th className="px-3 py-3">Set state</th></tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{personnel.map(person => <tr key={person.id} data-testid={`row-person-${person.id}`}><td className="px-5 py-4"><div className="font-extrabold">{person.name}</div><div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{person.role} · blood {person.blood}</div></td><td className="px-3 py-4"><div className="font-bold">{person.station}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">{person.phase}</div></td><td className="px-3 py-4"><Badge tone="green"><Check size={10} />{person.medical}</Badge></td><td className="px-3 py-4"><Badge tone={person.training === 'Current' ? 'green' : 'amber'}>{person.training}</Badge></td><td className="px-3 py-4"><StatusBadge status={person.status} /></td><td className="px-3 py-4"><div className="flex gap-1"><button data-testid={`button-indoor-${person.id}`} disabled={!can('personnel:write') || openAssignmentIds.has(person.id)} title={openAssignmentIds.has(person.id) ? 'Confirm return through the linked field sortie first' : undefined} onClick={() => setPersonStatus(person.id, 'INDOOR')} className={`h-9 rounded border px-2 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${person.status === 'INDOOR' ? 'border-cyan-500 bg-cyan-50 text-cyan-800' : 'border-[hsl(var(--border))]'}`}>INDOOR</button><button data-testid={`button-field-${person.id}`} disabled title="Dispatch through the field sortie console to record FIELD status" onClick={() => setPersonStatus(person.id, 'FIELD')} className={`h-9 rounded border px-2 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${person.status === 'FIELD' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-[hsl(var(--border))]'}`}>FIELD</button><button data-testid={`button-sos-${person.id}`} disabled={!can('personnel:write')} onClick={() => setPersonStatus(person.id, 'SOS')} className={`h-9 rounded border px-2 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${person.status === 'SOS' ? 'border-red-500 bg-red-50 text-red-800' : 'border-[hsl(var(--border))]'}`}>SOS</button></div></td></tr>)}</tbody></table></div>
    </div>
  </div>;
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
        <Popup><div className="leaflet-popup-card"><strong>DEMO INDIA CARGO RUN</strong><br />{route.origin} → {route.destination}<br />{route.mode} · SIMULATED MOVEMENT<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><span>Loads</span><strong>{cargoForRoute(route).length}</strong><span>Speed</span><strong>{route.speedKnots} kn · demo</strong><span>Tracking</span><strong>SIMULATED</strong></div><div className="mt-2 space-y-1 border-t border-slate-200 pt-2">{cargoForRoute(route).slice(0, 3).map(item => <div key={item.tracking} className="text-[10px]"><strong>{item.tracking}</strong> · {item.weight.toLocaleString()} kg · {item.type}</div>)}</div></div></Popup>
      </CircleMarker>)}
      {vessels.map((unit, index) => <CircleMarker key={unit.id} center={movingPosition(unit)} radius={selectedUnitId === unit.id ? 10 : 7} pathOptions={{ color: '#172236', weight: 2, fillColor: unit.status === 'DELAYED' || emergency.active && index === 0 ? '#dc2626' : leafletUnitColors.VESSEL, fillOpacity: 1 }} eventHandlers={{ click: () => openUnit(unit) }}>
        <Popup><div className="leaflet-popup-card"><strong>{unit.label}</strong><br />VESSEL · {unit.status}<br />{unit.detail}<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><span>Speed</span><strong>{unit.speedKnots ? `${unit.speedKnots} kn` : 'HOLD'}</strong><span>ETA</span><strong>{unit.eta || '—'}</strong><span>Route</span><strong>{unit.routeKey || 'Stationed'}</strong></div>{unit.voyageId && <button className="leaflet-popup-link mt-2" onClick={() => openUnit(unit)}>OPEN CARGO & VOYAGE RECORD</button>}</div></Popup>
      </CircleMarker>)}
      {supportUnits.map(unit => <CircleMarker key={unit.id} center={movingPosition(unit)} radius={selectedUnitId === unit.id ? 9 : unit.kind === 'HELICOPTER' ? 6 : unit.kind === 'UAV' ? 5 : 7} pathOptions={{ color: '#fff', weight: 2, fillColor: emergency.active && unit.kind === 'HELICOPTER' ? '#dc2626' : leafletUnitColors[unit.kind], fillOpacity: .95 }} eventHandlers={{ click: () => openUnit(unit) }}>
        <Popup><div className="leaflet-popup-card"><strong>{unit.label}</strong><br />{unit.kind} · {unit.status}<br />{unit.detail}<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><span>Speed</span><strong>{unit.speedKnots ? `${unit.speedKnots} kn` : 'HOLD'}</strong><span>ETA</span><strong>{unit.eta || '—'}</strong><span>Route</span><strong>{unit.routeKey || 'Stationed'}</strong></div><button className="leaflet-popup-link mt-2" onClick={() => openUnit(unit)}>OPEN UNIT RECORD</button></div></Popup>
      </CircleMarker>)}
    </MapContainer>
    <div className="pointer-events-none absolute left-14 top-3 z-[500] rounded-md bg-white/90 px-3 py-2 shadow"><div className="mono text-[9px] font-extrabold tracking-[.15em] text-cyan-900">SIMULATED MULTIMODAL MAP</div><div className="mt-1 text-[10px] text-slate-600">Demo route geometry and positions animate for presentation; select a marker for snapshot details.</div></div>
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-md bg-slate-950/85 px-3 py-2 text-[10px] font-bold text-white shadow"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-400" />SIMULATED POSITION ANIMATION · NO LIVE NAVIGATION CONTROL</div>
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
  return <div className="panel p-5">
    <SectionTitle eyebrow="INDIA → POLAR BASES / CARGO NETWORK" title="Cargo lanes in motion" detail="Illustrative route geometry. Manifest counts and weights use the API snapshot; position and transit state are not live." action={<Badge tone="amber"><Radio size={11} />DEMO ROUTE DATA</Badge>} />
    <div className="grid gap-3 lg:grid-cols-3">{indiaCargoRoutes.map(route => {
      const loads = cargo.filter(item => item.destination === route.destination);
      const weight = loads.reduce((total, item) => total + item.weight, 0);
      return <div key={route.id} className="rounded-lg border border-cyan-200 bg-cyan-50/55 p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="mono text-[9px] font-bold tracking-[.15em] text-cyan-800">{route.id} / CARGO CORRIDOR</div><div className="mt-1 text-sm font-extrabold">{route.origin} → {route.destination}</div></div><span className="h-3 w-3 rounded-full bg-cyan-600" /></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div><div className="text-slate-500">MODE</div><strong>{route.mode}</strong></div>
          <div><div className="text-slate-500">LOADS</div><strong>{loads.length} consignments</strong></div>
          <div><div className="text-slate-500">WEIGHT</div><strong>{weight.toLocaleString()} kg</strong></div>
          <div><div className="text-slate-500">STATE</div><strong className="text-amber-800">SIMULATED LANE</strong></div>
        </div>
        <div className="mt-3 border-t border-cyan-200 pt-2 text-[10px] text-slate-600">{loads.length ? loads.map(item => <div key={item.tracking} className="flex justify-between gap-2 py-0.5"><span className="font-bold">{item.tracking}</span><span>{item.type}</span></div>) : 'Awaiting manifest assignment'}</div>
      </div>;
    })}</div>
  </div>;
}

function MapPage() {
  const { stations, cargo, trackingUnits, emergency } = useOps();
  const routeCount = Object.keys(leafletRoutes).length + indiaCargoRoutes.length;
  const trackedUnits = trackingUnits.length;
  return <div className="space-y-6">
    <SectionTitle eyebrow="MAP & CORRIDORS / 07" title="Multimodal operating picture" detail="Demonstration vessel, tug, helicopter and UAV positions over illustrative route geometry." action={<Badge tone={emergency.active ? 'red' : 'amber'}><MapPinned size={11} />{emergency.active ? 'CONDITION 1 · SIMULATED' : 'SIMULATED POSITIONS'}</Badge>} />
    <div role="note" data-testid="note-simulated-map" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-950">
      <AlertTriangle size={15} /><span>DEMONSTRATION TRACKING DATA · NO LIVE NAVIGATION CONTROL</span><span className="font-normal">Coordinates are not a vessel-control or safety source.</span>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="TRACKED UNITS" value={String(trackedUnits).padStart(2, '0')} detail="Snapshot units; positions are simulated" icon={RadioTower} tone="cyan" provenance={calculatedProvenance('count(trackingUnits)', `${trackedUnits} tracking records`, 'Records may be demo-seeded and their positions are not live beacons.')} />
      <Metric label="STATIONS IN SNAPSHOT" value={String(stations.length).padStart(2, '0')} detail="Station records received; not a connectivity check" icon={MapPinned} tone="green" provenance={calculatedProvenance('count(stations)', `${stations.length} station records`, 'Presence in the snapshot does not establish that a station is online.')} />
      <Metric label="CORRIDOR FIXTURES" value={String(routeCount).padStart(2, '0')} detail={emergency.active ? 'Illustrative routes under simulated Condition 1 overlay' : 'Illustrative route geometry'} icon={Anchor} tone={emergency.active ? 'red' : 'amber'} />
      <Metric label="CARGO LANES" value={String(indiaCargoRoutes.length).padStart(2, '0')} detail="Demonstration India-to-base corridors" icon={PackageCheck} tone="cyan" />
    </div>
    <div className="panel p-5"><LiveLeafletMap expanded /><div className="mt-4"><MapLegend emergency={emergency.active} /></div></div>
    <IndiaCargoLaneBoard cargo={cargo} />
    <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <div className="grid gap-4 sm:grid-cols-2">{stations.map(station => <div key={station.code} className="panel p-4"><div className="mono text-[10px] font-bold tracking-[.15em] text-[hsl(var(--primary))]">{station.code} / {station.coordinates}</div><div className="mt-1 flex items-center justify-between gap-3"><div className="font-extrabold">{station.name}</div><StatusBadge status={station.code === 'MAI' && emergency.active ? 'RECALLED' : 'ON STATION'} /></div><div className="mt-2 flex justify-between text-xs"><span>{station.weather}</span><span className="mono">{station.occupancy}/{station.capacity}</span></div></div>)}</div>
      <div className="panel p-5"><SectionTitle eyebrow="SUPPORT FLEET / DEMO TRACKING" title="Air & marine support" detail="Seeded positions from the authenticated operations snapshot; not live beacon positions." /><div className="space-y-3">{trackingUnits.filter(unit => unit.kind !== 'VESSEL').map(unit => <div key={unit.id} className="flex items-center gap-3 border-b border-[hsl(var(--border)/.7)] pb-3 last:border-0 last:pb-0"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: leafletUnitColors[unit.kind] }} /><div className="min-w-0 flex-1"><div className="text-xs font-extrabold">{unit.label}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">{unit.kind} · {unit.detail}</div></div><Badge tone={unit.status === 'STANDBY' ? 'amber' : 'cyan'}>{unit.status}</Badge></div>)}</div></div>
    </div>
  </div>;
}

function FieldCompanion() {
  const { personnel, stations, emergency, setPersonStatus } = useOps();
  const field = personnel.filter(person => person.status === 'FIELD');
  const activeStation = stations.find(station => station.name === 'Maitri');
  return <div className="space-y-6"><SectionTitle eyebrow="FIELD COMPANION / 08" title="Work party console" detail="Roster-only status and illustrative check-in guidance; no beacon hardware or sortie dispatch is connected." action={<Badge tone={emergency.active ? 'red' : 'slate'}><RadioTower size={11} />{emergency.active ? 'SIMULATED RECALL' : 'ROSTER ONLY'}</Badge>} />
    {emergency.active && <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"><AlertOctagon size={18} /><div><div className="text-xs font-extrabold">SIMULATED CONDITION 1 · FIELD ACTIONS SUSPENDED</div><div className="text-[11px]">The demo disables FIELD status changes. It does not send a recall, contact work parties, or confirm shelter.</div></div></div>}
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="FIELD ACTIVE" value={String(field.length).padStart(2, '0')} detail="Roster rows marked FIELD; no live beacon link" icon={HardHat} tone="amber" provenance={calculatedProvenance('count(person.status = FIELD)', `${field.length} personnel records in the latest snapshot`, 'A FIELD roster status is not a live location or safety signal.')} />
      <Metric label="NEXT CHECK-IN" value="06:15" detail="Illustrative schedule fixture · Maitri west sector" icon={Radio} tone="green" />
      <Metric label="VISIBILITY" value={emergency.active ? '<120m · SIM' : '8.4km · SIM'} detail={`${activeStation?.weather || 'Station weather'} · illustrative, not current meteo`} icon={CloudSnow} tone={emergency.active ? 'red' : 'cyan'} />
    </div>
    <div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><SectionTitle eyebrow="FIELD STATUS REGISTER" title="Personnel status" detail="Status controls update roster records only. Confirm actual location and safety through the station's approved procedures." /></div><div className="divide-y divide-[hsl(var(--border))]">{personnel.map(person => <div key={person.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-[220px] flex-1"><div className="font-extrabold">{person.name}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">{person.role} · {person.station} · {person.blood}</div></div><StatusBadge status={person.status} /><div className="flex gap-1"><Button variant="secondary" onClick={() => setPersonStatus(person.id, 'INDOOR')}>SHELTERED</Button><Button variant="ghost" disabled={emergency.active} onClick={() => setPersonStatus(person.id, 'FIELD')}>FIELD</Button><Button variant="danger" onClick={() => setPersonStatus(person.id, 'SOS')}>SOS</Button></div></div>)}</div></div>
  </div>;
}

function EmergencyControl() {
  const { emergency, simulateBlizzard, clearIncident, events, fieldSorties, can, role } = useOps();
  const canResolve = can('emergency:write');
  const unresolved = fieldSorties.filter(sortie => sortie.status !== 'COMPLETED');
  return <div className="space-y-6">
    <SectionTitle eyebrow="EMERGENCY COMMAND / 05" title="Condition 1 control" detail="Server-enforced recall, dispatch lock, and explicit recovery confirmation." action={<Badge tone="slate">NO LIVE NAVIGATION CONTROL</Badge>} />
    <div className={`rounded-lg border p-5 ${emergency.active ? 'border-red-300 bg-red-50 text-red-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mono text-[10px] font-bold tracking-[.16em]">{emergency.active ? emergency.severity : 'SYSTEM STANDBY'}</div><h2 className="condensed mt-1 text-3xl font-bold uppercase">{emergency.type}</h2><p className="mt-2 max-w-2xl text-xs">{emergency.description}</p><p className="mt-2 mono text-[10px]">{emergency.timestamp}</p></div>
        {emergency.active
          ? <Button data-testid="button-declare-recovery" variant="secondary" disabled={!canResolve || unresolved.length > 0} title={unresolved.length ? 'Close all field sorties first' : !canResolve ? `Role ${role} cannot confirm recovery` : undefined} onClick={clearIncident}><Check size={15} />CONFIRM RECOVERY</Button>
          : <Button data-testid="button-trigger-condition-1" variant="danger" disabled={!canResolve} title={!canResolve ? `Role ${role} cannot activate Condition 1` : undefined} onClick={simulateBlizzard}><CloudSnow size={15} />ACTIVATE CONDITION 1</Button>}
      </div>
      {emergency.active && <div className="mt-4 border-t border-red-200 pt-4 text-xs">
        <div className="font-extrabold">Recovery checklist · {unresolved.length} field sortie(s) remain open</div>
        {unresolved.length > 0
          ? <ul className="mt-2 list-inside list-disc">{unresolved.map(sortie => <li key={sortie.id}>{sortie.destination} · {sortie.status} · {sortie.assignedPersonnel.filter(person => person.status !== 'RETURNED').length} personnel not confirmed returned</li>)}</ul>
          : <p className="mt-2">All assigned personnel have returned and every field sortie is closed. COMMAND or SAFETY must confirm recovery.</p>}
      </div>}
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="MOVEMENT" value={emergency.active ? 'RECALLED' : 'STANDBY'} detail="Field movement is not live-tracked" icon={Users} tone={emergency.active ? 'red' : 'green'} />
      <Metric label="DISPATCH" value={emergency.active ? 'BLOCKED' : 'AVAILABLE'} detail={`${unresolved.length} open sortie(s)`} icon={Radio} tone={emergency.active ? 'red' : 'cyan'} />
      <Metric label="CARGO / VOYAGES" value={emergency.active ? 'PAUSED' : 'NOMINAL'} detail="Operational state from latest snapshot" icon={Anchor} tone={emergency.active ? 'amber' : 'green'} />
    </div>
    <section className="panel overflow-hidden"><div className="border-b p-5"><SectionTitle eyebrow="EMERGENCY EVENT LOG / UTC" title="Decision record" detail="Actor, server role, time, and recovery justification" /></div>
      {events.filter(event => event.module === 'EMERGENCY').length === 0 ? <div className="p-5 text-sm text-muted-foreground">No emergency events recorded.</div> : events.filter(event => event.module === 'EMERGENCY').map(event => <div key={event.id} className="grid gap-2 border-b p-4 text-xs last:border-0 md:grid-cols-[120px_1fr_160px]"><span className="mono text-[10px] text-muted-foreground">{event.time} UTC</span><div><div className="font-bold">{event.action}</div>{event.justification && <div className="mt-1 text-[10px] text-muted-foreground">{event.justification}</div>}</div><div className="text-[10px]">{event.user || '—'} · {event.actorRole || '—'}</div></div>)}
    </section>
  </div>;
}

function FieldSortieConsole() {
  const { personnel, stations, emergency, fieldSorties, dispatchSortie, confirmSortieBeacon, returnSortiePerson, closeSortie, can, role } = useOps();
  const [stationId, setStationId] = useState('');
  const [destination, setDestination] = useState('');
  const [leadId, setLeadId] = useState('');
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [returnAt, setReturnAt] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [frequency, setFrequency] = useState('VHF CH-16');
  const [callsign, setCallsign] = useState('');
  const [dispatching, setDispatching] = useState(false);
  useEffect(() => {
    if (stationId) return;
    const availableStation = stations.find(item => personnel.some(person => (person.availableForSortie ?? person.status === 'INDOOR') && person.station === item.name));
    if (availableStation?.id) setStationId(availableStation.id);
  }, [personnel, stationId, stations]);
  const station = stations.find(item => item.id === stationId);
  const eligible = personnel.filter(person => (person.availableForSortie ?? person.status === 'INDOOR') && person.station === station?.name);
  const open = fieldSorties.filter(sortie => sortie.status !== 'COMPLETED');
  const utc = (value?: string) => value ? `${new Date(value).toISOString().slice(0, 19).replace('T', ' ')} UTC` : '—';

  return <div className="space-y-6">
    <SectionTitle eyebrow="FIELD SORTIE CONTROL / 08" title="Dispatch & recovery" detail="Manual operational records only. No live beacon hardware or navigation control is connected." action={<Badge tone={emergency.active ? 'red' : 'slate'}>{emergency.active ? 'CONDITION 1 · RECALL' : 'NO LIVE NAVIGATION CONTROL'}</Badge>} />
    {emergency.active && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-900">Condition 1 active. New dispatch is blocked; confirm each assigned person’s return and close every sortie before recovery.</div>}
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="OPEN SORTIES" value={String(open.length).padStart(2, '0')} detail={`${fieldSorties.filter(item => item.status === 'OVERDUE').length} overdue`} icon={Radio} tone={open.length ? 'amber' : 'green'} />
      <Metric label="FIELD ROSTER" value={String(personnel.filter(item => item.status === 'FIELD').length).padStart(2, '0')} detail="Record count, not a live beacon signal" icon={HardHat} tone="amber" />
      <Metric label="RECALL STATE" value={emergency.active ? 'ACTIVE' : 'STANDBY'} detail="Recovery requires all sorties closed" icon={ShieldCheck} tone={emergency.active ? 'red' : 'green'} />
    </div>

    <form className="panel p-5" onSubmit={async event => {
      event.preventDefault();
      if (!can('sortie:write') || emergency.active || dispatching || !stationId || !destination.trim() || !leadId || !assignedIds.includes(leadId) || !assignedIds.length || new Date(returnAt).getTime() <= Date.now()) return;
      setDispatching(true);
      try {
        const dispatched = await dispatchSortie({
          stationId, destination: destination.trim(), leadPersonId: leadId,
          expectedReturnTime: new Date(returnAt).toISOString(), vehicle: vehicle.trim() || undefined,
          commFrequency: frequency.trim(), satPhoneCallsign: callsign.trim() || undefined,
          personnelIds: assignedIds,
        });
        if (!dispatched) return;
        setDestination(''); setLeadId(''); setAssignedIds([]); setReturnAt(''); setVehicle(''); setCallsign('');
      } finally {
        setDispatching(false);
      }
    }}>
      <SectionTitle eyebrow="SORTIE LIFECYCLE / DISPATCH" title="Create field sortie" detail="The server validates role, station assignment, personnel availability, return window, and Condition 1 state." />
      <fieldset disabled={!can('sortie:write') || emergency.active || dispatching} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-[10px] font-bold">Station<select required value={stationId} onChange={event => { setStationId(event.target.value); setLeadId(''); setAssignedIds([]); }} className="mt-1 h-10 w-full rounded border bg-background px-3 text-xs"><option value="">Select station</option>{stations.filter(item => item.id && item.name !== 'Southern Ocean').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-[10px] font-bold">Destination<input required minLength={2} value={destination} onChange={event => setDestination(event.target.value)} placeholder="Sector / destination" className="mt-1 h-10 w-full rounded border bg-background px-3 text-xs" /></label>
        <label className="text-[10px] font-bold">Expected return · local time<input required type="datetime-local" value={returnAt} onChange={event => setReturnAt(event.target.value)} className="mt-1 h-10 w-full rounded border bg-background px-3 text-xs" /></label>
        <label className="text-[10px] font-bold">VHF frequency<input required minLength={2} value={frequency} onChange={event => setFrequency(event.target.value)} className="mt-1 h-10 w-full rounded border bg-background px-3 text-xs" /></label>
        <label className="text-[10px] font-bold">Sortie lead<select required value={leadId} onChange={event => { setLeadId(event.target.value); setAssignedIds(ids => [...new Set([...ids, event.target.value].filter(Boolean))]); }} className="mt-1 h-10 w-full rounded border bg-background px-3 text-xs"><option value="">Select lead</option>{eligible.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="text-[10px] font-bold">Vehicle / identifier<input value={vehicle} onChange={event => setVehicle(event.target.value)} className="mt-1 h-10 w-full rounded border bg-background px-3 text-xs" /></label>
        <label className="text-[10px] font-bold">Satellite callsign<input value={callsign} onChange={event => setCallsign(event.target.value)} className="mt-1 h-10 w-full rounded border bg-background px-3 text-xs" /></label>
        <div className="rounded border p-3"><div className="text-[10px] font-bold">ASSIGNED PERSONNEL</div><div className="mt-2 max-h-28 space-y-1 overflow-y-auto">{eligible.map(person => <label key={person.id} className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={assignedIds.includes(person.id)} onChange={event => setAssignedIds(ids => event.target.checked ? [...new Set([...ids, person.id])] : ids.filter(id => id !== person.id))} />{person.name}{person.id === leadId ? ' · LEAD' : ''}</label>)}{!eligible.length && <span className="text-[10px] text-muted-foreground">{station ? 'No indoor personnel at this station. Select a station with available indoor staff.' : 'Select a station to see eligible indoor staff.'}</span>}</div></div>
      </fieldset>
      <div className="mt-4 flex items-center justify-between gap-3"><span className="text-[10px] text-muted-foreground">{!can('sortie:write') ? `Role ${role} cannot dispatch; COMMAND or SAFETY required.` : emergency.active ? 'Condition 1 is active; dispatch is blocked.' : 'Check-ins and returns are manual confirmations, not hardware signals.'}</span><Button type="submit" disabled={!can('sortie:write') || emergency.active || dispatching || !stationId || !destination.trim() || !leadId || !assignedIds.includes(leadId) || !assignedIds.length || !returnAt || new Date(returnAt).getTime() <= Date.now() || !frequency.trim()}>{dispatching ? 'DISPATCHING…' : 'DISPATCH SORTIE'}</Button></div>
    </form>

    <section className="panel overflow-hidden">
      <div className="border-b p-5"><SectionTitle eyebrow="SORTIE LIFECYCLE / ROSTER" title="Field sorties" detail="Overdue sorties escalate on the server. Every assigned person must be confirmed returned before closure." /></div>
      {!fieldSorties.length ? <div className="p-6 text-sm text-muted-foreground">No field sorties recorded.</div> : <div className="divide-y">{fieldSorties.map(sortie => {
        const allReturned = sortie.assignedPersonnel.length > 0 && sortie.assignedPersonnel.every(person => person.status === 'RETURNED');
        return <article key={sortie.id} data-testid={`row-sortie-${sortie.id}`} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mono text-[10px] text-primary">{sortie.id} · {sortie.station}</div><div className="mt-1 font-extrabold">{sortie.destination}</div><div className="mt-1 text-[10px] text-muted-foreground">Lead {sortie.leadPerson} · {sortie.vehicle || 'No vehicle'} · VHF {sortie.commFrequency}{sortie.satPhoneCallsign ? ` · SAT ${sortie.satPhoneCallsign}` : ''}</div></div><Badge tone={sortie.status === 'OVERDUE' || sortie.status === 'SOS_TRIGGERED' ? 'red' : sortie.status === 'COMPLETED' ? 'green' : sortie.status === 'RECALLED' ? 'amber' : 'cyan'}>{sortie.status}</Badge></div>
          <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-3"><div>DEPARTED · {utc(sortie.departureTime)}</div><div>EXPECTED RETURN · {utc(sortie.expectedReturnTime)}</div><div>{sortie.actualReturnTime ? `CLOSED / RETURNED · ${utc(sortie.actualReturnTime)}` : `OVERDUE ESCALATION · ${utc(sortie.overdueEscalatedAt)}`}</div></div>
          <div className="mt-4 space-y-2">{sortie.assignedPersonnel.map(person => <div key={person.id} className="flex flex-wrap items-center gap-2 rounded bg-muted/40 p-3"><div className="min-w-[160px] flex-1"><div className="text-xs font-bold">{person.name}</div><div className="text-[10px] text-muted-foreground">{person.beaconConfirmedAt ? `Manual check-in · ${utc(person.beaconConfirmedAt)}` : 'No manual check-in recorded'}{person.actualReturnTime ? ` · Returned ${utc(person.actualReturnTime)}` : ''}</div></div><Badge tone={person.status === 'SOS' ? 'red' : person.status === 'RETURNED' ? 'green' : person.status === 'RECALLED' ? 'amber' : 'slate'}>{person.status}</Badge>{person.status !== 'RETURNED' && <Button variant="secondary" disabled={!can('sortie:write')} onClick={() => confirmSortieBeacon(sortie.id, person.id)}>RECORD MANUAL CHECK-IN</Button>}{person.status !== 'RETURNED' && <Button variant="ghost" disabled={!can('sortie:write')} onClick={() => { if (window.confirm(`Confirm ${person.name} has physically returned to ${sortie.station}?`)) returnSortiePerson(sortie.id, person.id); }}>CONFIRM RETURN</Button>}</div>)}</div>
          {sortie.status !== 'COMPLETED' && <div className="mt-3 flex justify-end"><Button disabled={!can('sortie:write') || !allReturned} onClick={() => { if (window.confirm(`Close sortie ${sortie.id}?`)) closeSortie(sortie.id); }}>CLOSE SORTIE</Button></div>}
        </article>;
      })}</div>}
    </section>
  </div>;
}

function AuditReports() {
  const { events, exportAudit } = useOps();
  return <div className="space-y-6"><SectionTitle eyebrow="AUDIT & REPORTING / 09" title="Decision record" detail="Append-only command history with actor, role, UTC time, and justification" action={<div className="flex gap-2"><Button variant="secondary" onClick={exportAudit}><Download size={14} />EXPORT CSV</Button><Button variant="ghost" onClick={() => window.print()}><FileText size={14} />PRINT / PDF</Button></div>} /><div className="panel overflow-hidden"><div className="border-b border-[hsl(var(--border))] p-5"><div className="flex items-center justify-between"><div><div className="mono text-[10px] font-bold tracking-[.16em] text-[hsl(var(--primary))]">COMMAND LOG / UTC</div><div className="mt-1 text-sm font-extrabold">PolarLogix operational history</div></div><Badge tone="green"><ShieldCheck size={11} />AUDIT APPEND-ONLY</Badge></div></div><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-xs"><thead className="bg-[hsl(var(--muted)/.55)] text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><tr><th className="px-5 py-3">UTC</th><th className="px-3 py-3">Module</th><th className="px-3 py-3">Operator / role</th><th className="px-3 py-3">Command</th><th className="px-3 py-3">Justification</th></tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{events.map(event => <tr key={event.id}><td className="px-5 py-3 mono text-[10px]">{event.time}</td><td className="px-3 py-3"><Badge tone={event.tone}>{event.module}</Badge></td><td className="px-3 py-3 text-[10px]">{event.user || '—'}<div className="text-muted-foreground">{event.actorRole || '—'}</div></td><td className="px-3 py-3 font-bold">{event.action}</td><td className="px-3 py-3 text-[10px] text-[hsl(var(--muted-foreground))]">{event.justification || 'Recorded from command console.'}</td></tr>)}</tbody></table></div></div></div>;
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

function SignInPage() {
  return <div className="grid min-h-[100dvh] w-full min-w-0 place-items-center overflow-x-hidden bg-[hsl(var(--background))] px-4 py-8"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="grid min-h-[100dvh] w-full min-w-0 place-items-center overflow-x-hidden bg-[hsl(var(--background))] px-4 py-8"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function OperationsConsole({ state }: { state: StateContext }) {
  return <QueryClientProvider client={queryClient}><TooltipProvider><StateCtx.Provider value={state}><ErrorBoundary resetKey={window.location.pathname}><Router /></ErrorBoundary><Toaster /></StateCtx.Provider></TooltipProvider></QueryClientProvider>;
}

function AuthenticatedApp() {
  return <OperationsConsole state={useOperations()} />;
}

function DemoAuthenticatedApp({ onExitDemo }: { onExitDemo: () => void }) {
  return <OperationsConsole state={useDemoOperations(onExitDemo)} />;
}

function AuthBoundary() {
  const [, setLocation] = useLocation();
  const [demoMode, setDemoMode] = useState(() => {
    if (!import.meta.env.DEV) return false;
    try {
      return sessionStorage.getItem('polarlogix-read-only-demo') === '1'
        || new URLSearchParams(window.location.search).get('demo') === '1';
    } catch {
      return false;
    }
  });
  const enterDemo = () => {
    try { sessionStorage.setItem('polarlogix-read-only-demo', '1'); } catch {}
    setDemoMode(true);
  };
  const exitDemo = () => {
    try { sessionStorage.removeItem('polarlogix-read-only-demo'); } catch {}
    setDemoMode(false);
    setLocation('/');
  };
  return <><Show when="signed-in"><AuthenticatedApp /></Show><Show when="signed-out">{demoMode ? <DemoAuthenticatedApp onExitDemo={exitDemo} /> : <PublicLanding onStartDemo={enterDemo} />}</Show></>;
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
    <Route path="/emergency" component={EmergencyControl} />
    <Route path="/assets" component={Assets} />
    <Route path="/map" component={MapPage} />
    <Route path="/field" component={FieldSortieConsole} />
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