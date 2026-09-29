const loopbackNames = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Header the web UI sends with every write. A page on another site cannot add it without a CORS
 * preflight, which this server never answers, while a plain form post needs no preflight at all.
 */
export const clientHeader = "x-comic-translator";

const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/**
 * Refuses what a web page on another site could make the browser send to this local server: a Host that
 * is not a loopback name (DNS rebinding), an Origin from another host, or a write without the client
 * header. Returns the refusal, or null to go on.
 */
export const refuseForeignRequest = (request: Request): Response | null => {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const foreign = host === null
    || !loopbackNames.has(hostnameOf(`http://${host}`) ?? "")
    || (origin !== null && !loopbackNames.has(hostnameOf(origin) ?? ""))
    || (request.method !== "GET" && request.method !== "HEAD" && request.headers.get(clientHeader) !== "1");
  return foreign ? Response.json({ errorZh: "拒绝来自其他网站的请求" }, { status: 403 }) : null;
};
