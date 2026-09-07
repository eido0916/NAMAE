export type OperationalErrorCode = "data_load_failed" | "render_failed";

export function reportOperationalError(
  code: OperationalErrorCode,
  context: Record<string, string> = {},
) {
  const endpoint = process.env.NEXT_PUBLIC_MONITORING_ENDPOINT;
  if (!endpoint || typeof window === "undefined") return;
  const payload = JSON.stringify({
    code,
    context,
    path: window.location.pathname,
    occurredAt: new Date().toISOString(),
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  });
}
