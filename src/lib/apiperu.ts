type ApiPeruResponse<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type ApiPeruRequestOptions = {
  revalidate?: number;
};

export class ApiPeruError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ApiPeruError";
    this.status = status;
  }
}

function getApiPeruToken() {
  const token = process.env.APIPERU_API_TOKEN || process.env.APIPERU_TOKEN;
  if (!token) {
    throw new ApiPeruError("APIPERU_API_TOKEN no configurada", 500);
  }
  return token;
}

function getApiPeruBaseUrl() {
  return (process.env.APIPERU_BASE_URL || "https://apiperu.dev/api").replace(/\/$/, "");
}

export async function postApiPeru<T>(
  path: string,
  body: Record<string, unknown>,
  options: ApiPeruRequestOptions = {},
): Promise<ApiPeruResponse<T>> {
  const response = await fetch(`${getApiPeruBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiPeruToken()}`,
    },
    body: JSON.stringify(body),
    next: options.revalidate ? { revalidate: options.revalidate } : undefined,
  });

  let json: ApiPeruResponse<T> | null = null;
  try {
    json = (await response.json()) as ApiPeruResponse<T>;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new ApiPeruError(json?.message || `Error ApiPeru: ${response.status}`, response.status);
  }

  if (!json?.success) {
    throw new ApiPeruError(json?.message || "ApiPeru no devolvio una respuesta exitosa", 502);
  }

  return json;
}
