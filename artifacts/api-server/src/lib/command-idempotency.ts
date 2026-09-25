import { supabaseAdmin } from "./supabase";

type CachedResponse = {
  command_status: "PROCESSING" | "COMPLETED";
  response_status: number | null;
  response_body: unknown;
};

export async function findCommandResult(actorId: string, key: string) {
  const result = await supabaseAdmin
    .from("operation_idempotency")
    .select("command_status, response_status, response_body")
    .eq("actor_id", actorId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (result.error) throw new Error(`Idempotency lookup failed: ${result.error.message}`);
  return result.data as CachedResponse | null;
}

export async function claimCommand(actorId: string, key: string, endpoint: string, method: string) {
  const result = await supabaseAdmin.from("operation_idempotency").insert({
    actor_id: actorId,
    idempotency_key: key,
    endpoint,
    http_method: method,
  });
  if (!result.error) return true;
  if (result.error.code === "23505") return false;
  throw new Error(`Idempotency claim failed: ${result.error.message}`);
}

export async function completeCommand(actorId: string, key: string, status: number, body: unknown) {
  const result = await supabaseAdmin
    .from("operation_idempotency")
    .update({
      command_status: "COMPLETED",
      response_status: status,
      response_body: body,
      completed_at: new Date().toISOString(),
    })
    .eq("actor_id", actorId)
    .eq("idempotency_key", key)
    .eq("command_status", "PROCESSING");
  if (result.error) throw new Error(`Idempotency result could not be saved: ${result.error.message}`);
}