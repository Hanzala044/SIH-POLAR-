import { Router, type Request, type RequestHandler, type Response } from "express";
import {
  adjustInventory,
  createEmergencyCascade,
  createEvent,
  createVoyage,
  dispatchFieldSortie,
  decideOperatorAccessRequest,
  ensureDatabaseReady,
  loadOperations,
  resolveEmergency,
  updateAssetStatus,
  updateCargoTelemetry,
  updatePersonnelStatus,
  updateVoyageStatus,
  transitionFieldSortie,
} from "../lib/operations-service";
import { claimCommand, completeCommand, findCommandResult } from "../lib/command-idempotency";
import { getOperatorIdentity, roleCan, type OperationPermission, type OperatorIdentity } from "../lib/operations-auth";

const router = Router();

type MutationResult = { status?: number; body: unknown };
type MutationHandler = (req: Request, identity: OperatorIdentity, idempotencyKey: string) => Promise<MutationResult>;

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

function mutation(permission: OperationPermission, handler: MutationHandler): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      const identity = await getOperatorIdentity(req);
      if (!roleCan(identity.role, permission)) {
        res.status(403).json({ error: `Role ${identity.role} is not authorized for this operation.` });
        return;
      }
      const idempotencyKey = req.get("Idempotency-Key")?.trim();
      if (!idempotencyKey || idempotencyKey.length > 128) {
        res.status(400).json({ error: "A valid Idempotency-Key header is required." });
        return;
      }

      let existing = await findCommandResult(identity.userId, idempotencyKey);
      if (existing?.command_status === "COMPLETED") {
        res.status(existing.response_status || 200).json(existing.response_body ?? { ok: true });
        return;
      }
      if (existing?.command_status === "PROCESSING") {
        res.status(409).json({ error: "This command is already being processed; it was not run again." });
        return;
      }

      const claimed = await claimCommand(identity.userId, idempotencyKey, req.originalUrl.split("?")[0], req.method);
      if (!claimed) {
        existing = await findCommandResult(identity.userId, idempotencyKey);
        if (existing?.command_status === "COMPLETED") {
          res.status(existing.response_status || 200).json(existing.response_body ?? { ok: true });
        } else {
          res.status(409).json({ error: "This command is already being processed; it was not run again." });
        }
        return;
      }

      const result = await handler(req, identity, idempotencyKey);
      const status = result.status || 200;
      await completeCommand(identity.userId, idempotencyKey, status, result.body);
      res.status(status).json(result.body);
    })().catch(next);
  };
}

router.get("/operations", asyncRoute(async (req, res) => {
  const identity = await getOperatorIdentity(req);
  const snapshot = await loadOperations(identity);
  res.json(snapshot);
}));

router.post("/operations/voyages", mutation("voyage:write", async (req, _identity, _key) => {
  const result = await createVoyage(req.body);
  return { status: 201, body: { ok: true, voyageId: result.voyageId } };
}));

router.patch("/operations/voyages/:id/status", mutation("voyage:write", async (req, _identity, _key) => {
  await updateVoyageStatus(String(req.params.id), req.body.status);
  return { body: { ok: true } };
}));

router.post("/operations/inventory/adjust", mutation("inventory:write", async (req, _identity, _key) => {
  await adjustInventory(String(req.body.sku), Number(req.body.delta));
  return { body: { ok: true } };
}));

router.patch("/operations/personnel/:id/status", mutation("personnel:write", async (req, identity, _key) => {
  await updatePersonnelStatus(String(req.params.id), req.body.status, identity);
  return { body: { ok: true } };
}));

router.patch("/operations/assets/:id/status", mutation("asset:write", async (req, _identity, _key) => {
  await updateAssetStatus(String(req.params.id), req.body.status);
  return { body: { ok: true } };
}));

router.post("/operations/cargo/anomaly", mutation("cargo:write", async (req, _identity, _key) => {
  await updateCargoTelemetry(req.body.cargo);
  return { body: { ok: true } };
}));

router.post("/operations/emergency/cascade", mutation("emergency:write", async (req, identity, _key) => {
  const result = await createEmergencyCascade(req.body.emergency, req.body.cargoIds || [], req.body.voyageIds || [], identity);
  return { status: 201, body: { ok: true, incidentId: result?.incident_id } };
}));

router.post("/operations/emergency/resolve", mutation("emergency:write", async (req, identity, _key) => {
  await resolveEmergency(req.body.incidentId ? String(req.body.incidentId) : null, identity, String(req.body.justification || ""));
  return { body: { ok: true } };
}));

router.post("/operations/events", mutation("event:write", async (req, identity, _key) => {
  await createEvent(req.body, identity);
  return { status: 201, body: { ok: true } };
}));

router.post("/operations/approvals/:id/decision", mutation("approval:decide", async (req, identity, idempotencyKey) => {
  const result = await decideOperatorAccessRequest(
    String(req.params.id),
    String(req.body.decision),
    String(req.body.justification || ""),
    identity,
    idempotencyKey,
  );
  return { body: { ok: true, decision: result } };
}));

router.post("/operations/sorties", mutation("sortie:write", async (req, identity, idempotencyKey) => {
  const body = req.body || {};
  const sortie = await dispatchFieldSortie({
    id: String(body.id || ""),
    stationId: String(body.stationId || ""),
    destination: String(body.destination || ""),
    leadPersonId: String(body.leadPersonId || ""),
    expectedReturnTime: String(body.expectedReturnTime || ""),
    vehicle: body.vehicle ? String(body.vehicle) : undefined,
    commFrequency: String(body.commFrequency || ""),
    satPhoneCallsign: body.satPhoneCallsign ? String(body.satPhoneCallsign) : undefined,
    personnelIds: Array.isArray(body.personnelIds) ? body.personnelIds.map(String) : [],
  }, identity, idempotencyKey);
  return { status: 201, body: { ok: true, sortie } };
}));

router.post("/operations/sorties/:id/beacon", mutation("sortie:write", async (req, identity) => {
  const result = await transitionFieldSortie(String(req.params.id), "BEACON", String(req.body.personnelId || ""), identity);
  return { body: { ok: true, result } };
}));

router.post("/operations/sorties/:id/return", mutation("sortie:write", async (req, identity) => {
  const result = await transitionFieldSortie(String(req.params.id), "RETURN", String(req.body.personnelId || ""), identity);
  return { body: { ok: true, result } };
}));

router.post("/operations/sorties/:id/close", mutation("sortie:write", async (req, identity) => {
  const result = await transitionFieldSortie(String(req.params.id), "CLOSE", undefined, identity);
  return { body: { ok: true, result } };
}));

router.post("/operations/initialize", mutation("operations:initialize", async (_req, _identity, _key) => {
  await ensureDatabaseReady();
  return { body: { ok: true } };
}));

export default router;