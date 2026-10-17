// Cloudflare Pages Function: Optional transparent edge proxy for /api/* to Render backend
// If configured with environment variable BACKEND_API_URL, this function forwards /api/*
// calls to your deployed Render service, enabling same-origin cookie delivery.
export async function onRequest(context: {
  request: Request;
  env: { BACKEND_API_URL?: string };
}): Promise<Response> {
  const backendUrl = context.env.BACKEND_API_URL;
  if (!backendUrl) {
    // If BACKEND_API_URL is not set, pass through or return 503
    return new Response(
      JSON.stringify({
        error: 'BACKEND_API_URL not configured in Cloudflare Pages environment variables.',
        code: 'PROXY_UNCONFIGURED',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(context.request.url);
  // Normalize base URL to avoid double /api if user specified https://host/api
  const cleanBase = backendUrl.replace(/\/$/, '').replace(/\/api$/, '');
  const targetUrl = `${cleanBase}${url.pathname}${url.search}`;

  const reqHeaders = new Headers(context.request.headers);
  reqHeaders.set('X-Forwarded-Host', url.host);
  reqHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  try {
    const response = await fetch(targetUrl, {
      method: context.request.method,
      headers: reqHeaders,
      body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
      redirect: 'follow',
    });

    const isNoBodyStatus = [204, 205, 304].includes(response.status);
    return new Response(isNoBodyStatus ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: `Failed to communicate with RailFlow backend: ${err.message || 'Upstream gateway error'}`,
        code: 'UPSTREAM_GATEWAY_ERROR',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
