function normalizeCountryCode(value: string | null) {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

export function getRequestCountryCode(request: Request) {
  return normalizeCountryCode(request.headers.get("cf-ipcountry"));
}

export function isHongKongRequest(request: Request) {
  return getRequestCountryCode(request) === "HK";
}
