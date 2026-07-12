const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export class ProviderRequestError extends Error {
  constructor(provider, code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ProviderRequestError";
    this.provider = provider;
    this.code = code;
    this.status = options.status || 503;
    this.retryable = options.retryable !== false;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function readBoundedBody(provider, response, maxBytes) {
  if (!response.body?.getReader) {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > maxBytes) {
      throw new ProviderRequestError(
        provider,
        `${provider}_response_too_large`,
        `${provider} returned an oversized response.`,
      );
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    let reading = true;
    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ProviderRequestError(
          provider,
          `${provider}_response_too_large`,
          `${provider} returned an oversized response.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function fetchProviderResponse(
  provider,
  url,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    ...init
  } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`${provider}_timeout`)),
    positiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS),
  );

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const declaredSize = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      throw new ProviderRequestError(
        provider,
        `${provider}_response_too_large`,
        `${provider} returned an oversized response.`,
      );
    }
    const body = await readBoundedBody(provider, response, maxBytes);
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new ProviderRequestError(
        provider,
        `${provider}_timeout`,
        `${provider} timed out.`,
        { cause: error },
      );
    }
    throw new ProviderRequestError(
      provider,
      `${provider}_unavailable`,
      `${provider} is temporarily unavailable.`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function providerHttpError(provider, response) {
  const status = Number(response?.status) || 503;
  const retryable = status === 429 || status >= 500;
  return new ProviderRequestError(
    provider,
    status === 429 ? `${provider}_rate_limited` : `${provider}_http_error`,
    retryable
      ? `${provider} is temporarily unavailable.`
      : `${provider} rejected the request.`,
    { status: retryable ? 503 : 502, retryable },
  );
}

export async function readProviderText(
  provider,
  response,
  { maxBytes = DEFAULT_MAX_BYTES } = {},
) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ProviderRequestError(
      provider,
      `${provider}_response_too_large`,
      `${provider} returned an oversized response.`,
    );
  }
  return text;
}

export async function readProviderJson(provider, response, options = {}) {
  const text = await readProviderText(provider, response, options);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ProviderRequestError(
      provider,
      `${provider}_invalid_response`,
      `${provider} returned an invalid response.`,
      { cause: error },
    );
  }
}
