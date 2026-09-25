import type { OperationsSnapshot } from './operations-types';

// Local-only fixture for the unauthenticated, read-only development preview.
// It is never returned by the API and must not contain live operator data.
export const demoOperationsSnapshot: OperationsSnapshot = {
  stations: [
    { id: 'demo-station-maitri', code: 'MAI', name: 'Maitri', theatre: 'Antarctic', occupancy: 47, capacity: 65, weather: 'Whiteout watch', coordinates: '70.77°S 11.73°E' },
    { id: 'demo-station-bharati', code: 'BHA', name: 'Bharati', theatre: 'Antarctic', occupancy: 32, capacity: 48, weather: 'Clear · 18 kt', coordinates: '69.41°S 76.19°E' },
    { id: 'demo-station-himadri', code: 'HIM', name: 'Himadri', theatre: 'Arctic', occupancy: 18, capacity: 25, weather: 'Snow showers', coordinates: '78.92°N 11.93°E' },
    { id: 'demo-station-goa', code: 'HQ', name: 'Goa HQ', theatre: 'India', occupancy: 26, capacity: 40, weather: 'Operational', coordinates: '15.49°N 73.83°E' },
  ],
  voyages: [
    { id: 'demo-voyage-01', expedition: 'SOUTH-46', vessel: 'Polar Pioneer', polarClass: 'PC6', route: 'Cape Town → Maitri', status: 'UNDERWAY', departure: '2026-09-20', iceEntry: '2026-09-27', delay: 0 },
    { id: 'demo-voyage-02', expedition: 'SOUTH-46', vessel: 'Aurora Runner', polarClass: 'PC5', route: 'Hobart → Bharati', status: 'DELAYED', departure: '2026-09-18', iceEntry: '2026-09-26', delay: 1 },
  ],
  cargo: [
    { id: 'demo-cargo-01', tracking: 'PLX-804-19', description: 'Frozen research samples', origin: 'Cape Town', destination: 'Maitri', voyageId: 'demo-voyage-01', type: 'COLD CHAIN', weight: 840, temperature: -18.4, humidity: 32, shock: 0.6, status: 'NORMAL', coldChain: true },
    { id: 'demo-cargo-02', tracking: 'PLX-804-20', description: 'Generator service kits', origin: 'Hobart', destination: 'Bharati', voyageId: 'demo-voyage-02', type: 'ENGINEERING', weight: 1260, temperature: -7.2, humidity: 41, shock: 1.8, status: 'CRITICAL', coldChain: false },
    { id: 'demo-cargo-03', tracking: 'PLX-804-21', description: 'Medical resupply', origin: 'Goa HQ', destination: 'Maitri', type: 'MEDICAL', weight: 310, temperature: 4.1, humidity: 38, shock: 0.3, status: 'READY', coldChain: true },
  ],
  inventory: [
    { id: 'demo-inventory-01', name: 'Arctic diesel', sku: 'FUEL-D-17', category: 'FUEL', ved: 'V', quantity: 18420, unit: 'L', dailyBurn: 860, threshold: 7200, station: 'Maitri' },
    { id: 'demo-inventory-02', name: 'Emergency generator oil', sku: 'LUBE-E-03', category: 'LUBRICANTS', ved: 'E', quantity: 740, unit: 'L', dailyBurn: 24, threshold: 180, station: 'Bharati' },
    { id: 'demo-inventory-03', name: 'Food stores', sku: 'FOOD-D-11', category: 'PROVISIONS', ved: 'D', quantity: 3260, unit: 'kg', dailyBurn: 118, threshold: 900, station: 'Maitri' },
  ],
  personnel: [
    { id: 'demo-person-01', name: 'Anika Rao', role: 'Field team lead', station: 'Maitri', phase: 'Summer deployment', medical: 'CLEARED', training: 'CURRENT', blood: 'O+', status: 'FIELD' },
    { id: 'demo-person-02', name: 'Dev Menon', role: 'Communications officer', station: 'Maitri', phase: 'Summer deployment', medical: 'CLEARED', training: 'CURRENT', blood: 'B+', status: 'FIELD' },
    { id: 'demo-person-03', name: 'Mira Das', role: 'Station engineer', station: 'Bharati', phase: 'Winter-over', medical: 'CLEARED', training: 'CURRENT', blood: 'A-', status: 'INDOOR' },
    { id: 'demo-person-04', name: 'Arjun Sen', role: 'Logistics coordinator', station: 'Himadri', phase: 'Summer deployment', medical: 'REVIEW DUE', training: 'CURRENT', blood: 'AB+', status: 'INDOOR' },
  ],
  assets: [
    { id: 'demo-asset-01', name: 'Sno-Cat 07', category: 'VEHICLE', status: 'IN USE', location: 'Maitri field sector', nextMaintenance: '2026-10-08', criticality: 'V' },
    { id: 'demo-asset-02', name: 'Generator G-4', category: 'GENERATOR', status: 'READY', location: 'Bharati power plant', nextMaintenance: '2026-10-14', criticality: 'V' },
    { id: 'demo-asset-03', name: 'Ice radar array', category: 'SCIENCE INSTRUMENT', status: 'MAINTENANCE DUE', location: 'Maitri north ridge', nextMaintenance: '2026-09-29', criticality: 'E' },
  ],
  trackingUnits: [
    { id: 'demo-track-01', kind: 'VESSEL', label: 'Polar Pioneer', latitude: -58.2, longitude: 14.3, status: 'UNDERWAY', detail: 'Antarctic resupply voyage', voyageId: 'demo-voyage-01', routeKey: 'maitri', progress: 68, speedKnots: 11, eta: '2026-09-29' },
    { id: 'demo-track-02', kind: 'HELICOPTER', label: 'Helo Alpha', latitude: -70.6, longitude: 12.4, status: 'STANDBY', detail: 'Maitri station support' },
    { id: 'demo-track-03', kind: 'TUG BOAT', label: 'Harbour Tug 2', latitude: -54.8, longitude: 14.1, status: 'READY', detail: 'Cape Town departure support' },
  ],
  events: [
    { id: 'demo-event-01', time: '2026-09-25 08:42:00', module: 'SORTIE', action: 'Maitri field team check-in recorded', tone: 'cyan', user: 'Demo operator', actorRole: 'VIEWER' },
    { id: 'demo-event-02', time: '2026-09-25 08:16:00', module: 'CARGO', action: 'Shock watch raised for PLX-804-20', tone: 'amber', user: 'Demo operator', actorRole: 'VIEWER' },
    { id: 'demo-event-03', time: '2026-09-25 07:58:00', module: 'EXPEDITION', action: 'Aurora Runner arrival estimate revised +1 day', tone: 'red', user: 'Demo operator', actorRole: 'VIEWER' },
  ],
  emergency: {
    type: 'No active incidents',
    severity: 'STANDBY',
    description: 'All stations operating within command parameters.',
    active: false,
    lockdown: false,
    timestamp: '2026-09-25 08:45 UTC',
  },
  currentUser: { id: 'demo-operator', name: 'Demo operator', role: 'VIEWER' },
  operatorRequests: [
    { id: 'demo-request-01', operator: 'Tara Iyer', role: 'LOGISTICS', station: 'Maitri', stationCode: 'MAI', request: 'Request access to the upcoming resupply transfer roster.', submitted: '2026-09-25 07:30 UTC', priority: 'ROUTINE', status: 'PENDING' },
  ],
  fieldSorties: [
    {
      id: 'DEMO-SRT-004',
      stationId: 'demo-station-maitri',
      station: 'Maitri',
      destination: 'North ridge weather mast',
      leadPersonId: 'demo-person-01',
      leadPerson: 'Anika Rao',
      departureTime: '2026-09-25T07:45:00.000Z',
      expectedReturnTime: '2026-09-25T11:30:00.000Z',
      vehicle: 'Sno-Cat 07',
      commFrequency: 'VHF 156.8 MHz',
      satPhoneCallsign: 'MAI-FIELD-04',
      status: 'ACTIVE',
      assignedPersonnel: [
        { id: 'demo-person-01', name: 'Anika Rao', status: 'FIELD', beaconConfirmedAt: '2026-09-25T08:10:00.000Z' },
        { id: 'demo-person-02', name: 'Dev Menon', status: 'FIELD', beaconConfirmedAt: '2026-09-25T08:12:00.000Z' },
      ],
    },
    {
      id: 'DEMO-SRT-003',
      stationId: 'demo-station-bharati',
      station: 'Bharati',
      destination: 'Ice shelf marker 12',
      leadPersonId: 'demo-person-03',
      leadPerson: 'Mira Das',
      departureTime: '2026-09-24T09:00:00.000Z',
      expectedReturnTime: '2026-09-24T13:00:00.000Z',
      actualReturnTime: '2026-09-24T12:42:00.000Z',
      vehicle: 'Snowmobile 03',
      commFrequency: 'VHF 156.8 MHz',
      satPhoneCallsign: 'BHA-FIELD-03',
      status: 'COMPLETED',
      assignedPersonnel: [
        { id: 'demo-person-03', name: 'Mira Das', status: 'RETURNED', actualReturnTime: '2026-09-24T12:40:00.000Z' },
      ],
    },
  ],
};