import type { MaterialRequest, MaterialRequestStatus } from "@/lib/operations/types";

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export function statusLabel(status: MaterialRequestStatus) {
  return status
    .split("_")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

export function statusClass(status: MaterialRequestStatus) {
  if (status === "FULFILLED") {
    return "bg-emerald-50 text-emerald-800";
  }
  if (status === "PARTIALLY_ISSUED") {
    return "bg-amber-50 text-amber-800";
  }

  return "bg-stone-100 text-stone-600";
}

export function isApprovedProductionRequest(request: MaterialRequest) {
  return (
    Number(request.issuedQuantity) > 0 &&
    (request.status === "FULFILLED" ||
      request.status === "PARTIALLY_ISSUED")
  );
}
