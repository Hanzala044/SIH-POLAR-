import { Router, type IRouter } from "express";
import {
  adjustInventory,
  createEmergencyCascade,
  createEvent,
  createVoyage,
  ensureDatabaseReady,
  loadOperations,
  resolveEmergency,
  updateAssetStatus,
  updateCargoTelemetry,
  updatePersonnelStatus,
  updateVoyageStatus,
} from "../lib/operations-service";

const router: IRouter = Router();

function asyncRoute(handler: (req: Parameters<Parameters<IRouter["get"]>[1]>[0], res: Parameters<Parameters<IRouter["get"]>[1]>[1]) => Promise<void>) {
  return (req: Parameters<Parameters<IRouter["get"]>[1]>[0], res: Parameters<Parameters<IRouter["get"]>[1]>[1], next: Parameters<Parameters<IRouter["get"]>[1]>[2]) => {
    void handler(req, res).catch(next);
  };
}

router.get("/operations", asyncRoute(async (_req, res) => {
  const snapshot = await loadOperations();
  res.json(snapshot);
}));

router.post("/operations/voyages", asyncRoute(async (req, res) => {
  await createVoyage(req.body);
  res.status(201).json({ ok: true });
}));

router.patch("/operations/voyages/:id/status", asyncRoute(async (req, res) => {
  await updateVoyageStatus(String(req.params.id), req.body.status);
  res.json({ ok: true });
}));

router.post("/operations/inventory/adjust", asyncRoute(async (req, res) => {
  await adjustInventory(String(req.body.sku), Number(req.body.delta));
  res.json({ ok: true });
}));

router.patch("/operations/personnel/:id/status", asyncRoute(async (req, res) => {
  await updatePersonnelStatus(String(req.params.id), req.body.status);
  res.json({ ok: true });
}));

router.patch("/operations/assets/:id/status", asyncRoute(async (req, res) => {
  await updateAssetStatus(String(req.params.id), req.body.status);
  res.json({ ok: true });
}));

router.post("/operations/cargo/anomaly", asyncRoute(async (req, res) => {
  await updateCargoTelemetry(req.body.cargo);
  res.json({ ok: true });
}));

router.post("/operations/emergency/cascade", asyncRoute(async (req, res) => {
  const result = await createEmergencyCascade(req.body.emergency, req.body.cargoIds || [], req.body.voyageIds || []);
  res.status(201).json({ ok: true, incidentId: result?.incident_id });
}));

router.post("/operations/emergency/resolve", asyncRoute(async (req, res) => {
  await resolveEmergency(req.body.incidentId);
  res.json({ ok: true });
}));

router.post("/operations/events", asyncRoute(async (req, res) => {
  await createEvent(req.body);
  res.status(201).json({ ok: true });
}));

router.post("/operations/initialize", asyncRoute(async (_req, res) => {
  await ensureDatabaseReady();
  res.json({ ok: true });
}));

export default router;