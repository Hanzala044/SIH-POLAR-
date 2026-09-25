import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";

export const operationsRoles = ["COMMAND", "LOGISTICS", "SAFETY", "VIEWER"] as const;
export type OperationsRole = (typeof operationsRoles)[number];
export type OperationPermission =
  | "voyage:write"
  | "inventory:write"
  | "personnel:write"
  | "asset:write"
  | "cargo:write"
  | "emergency:write"
  | "sortie:write"
  | "approval:decide"
  | "event:write"
  | "operations:initialize";

export type OperatorIdentity = {
  userId: string;
  name: string;
  role: OperationsRole;
};

const permissions: Record<OperationsRole, readonly OperationPermission[]> = {
  COMMAND: [
    "voyage:write", "inventory:write", "personnel:write", "asset:write",
    "cargo:write", "emergency:write", "sortie:write", "approval:decide",
    "event:write", "operations:initialize",
  ],
  LOGISTICS: ["voyage:write", "inventory:write", "asset:write", "cargo:write", "event:write"],
  SAFETY: ["personnel:write", "emergency:write", "sortie:write", "approval:decide", "event:write"],
  VIEWER: [],
};

function normalizeRole(value: unknown): OperationsRole {
  if (typeof value !== "string") return "VIEWER";
  const normalized = value.trim().toUpperCase();
  if (normalized === "COMMANDER") return "COMMAND";
  return operationsRoles.includes(normalized as OperationsRole)
    ? normalized as OperationsRole
    : "VIEWER";
}

export function roleCan(role: OperationsRole, permission: OperationPermission) {
  return permissions[role].includes(permission);
}

export async function getOperatorIdentity(request: Request): Promise<OperatorIdentity> {
  const userId = getAuth(request).userId;
  if (!userId) throw new Error("Authentication required.");

  try {
    const user = await clerkClient.users.getUser(userId);
    const metadataRole = user.publicMetadata.operationsRole || user.publicMetadata.role;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ")
      || user.username
      || user.primaryEmailAddress?.emailAddress
      || "Authenticated operator";
    return { userId, name, role: normalizeRole(metadataRole) };
  } catch {
    // Role lookup failures must not accidentally grant permissions.
    return { userId, name: "Authenticated operator", role: "VIEWER" };
  }
}