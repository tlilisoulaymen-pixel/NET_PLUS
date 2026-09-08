/**
 * Thin Frappe REST/RPC client.
 * All traffic goes through the same-origin Next.js rewrites (see next.config.mjs),
 * so the Frappe `sid` cookie flows automatically once logged in.
 */

export class FrappeError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload?: unknown,
  ) {
    super(message);
    this.name = "FrappeError";
  }
}

/**
 * Thrown when the backend is completely unreachable (network error, Docker down)
 * or when the server returns HTML instead of JSON (502/503/etc).
 */
export class BackendOfflineError extends Error {
  constructor(message = "Le serveur NetPlus est en cours de démarrage. Veuillez patienter...") {
    super(message);
    this.name = "BackendOfflineError";
  }
}

/** Parse text as JSON, return raw text on failure. */
function parsed(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    // Network-level failure — Docker/backend is not running
    throw new BackendOfflineError();
  }

  if (res.status === 401 || res.status === 403) {
    throw new FrappeError("Not authorized", res.status, await res.text().catch(() => null));
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // If we got an HTML page (502 Bad Gateway, Nginx error, etc.) — backend is offline
    if (text.trimStart().startsWith("<")) {
      throw new BackendOfflineError();
    }
    let message = `Frappe error ${res.status}`;
    try {
      const p = parsed(text) as { message?: string; exception?: string };
      message = p?.message || p?.exception || message;
    } catch { /* keep default */ }
    throw new FrappeError(message, res.status, parsed(text));
  }

  // Check content-type before parsing as JSON
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    const text = await res.text().catch(() => "");
    if (text.trimStart().startsWith("<")) {
      throw new BackendOfflineError();
    }
    throw new FrappeError("Unexpected non-JSON response", res.status, text);
  }

  return res.json() as Promise<T>;
}

export const frappe = {
  /** POST /api/method/login — Frappe returns session cookie (sid). */
  login(username: string, password: string) {
    const body = new URLSearchParams({ usr: username, pwd: password });
    return fetch("/api/method/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }).then(async (r) => {
      if (!r.ok) throw new FrappeError("Login failed — check credentials", r.status);
      return r.json();
    });
  },

  logout() {
    return request("/api/method/logout", { method: "POST" }).catch(() => null);
  },

  getLoggedUser(): Promise<string> {
    return request<{ message: string }>("/api/method/frappe.auth.get_logged_user").then((r) => r.message);
  },

  /** Generic document list. */
  list<T = Record<string, unknown>>(
    doctype: string,
    opts: {
      fields?: string[];
      filters?: Record<string, unknown> | string;
      limit?: number;
      start?: number;
      orderBy?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    if (opts.fields?.length) params.set("fields", JSON.stringify(opts.fields));
    if (opts.filters) params.set("filters", typeof opts.filters === "string" ? opts.filters : JSON.stringify(opts.filters));
    params.set("limit_page_length", String(opts.limit ?? 20));
    params.set("limit_start", String(opts.start ?? 0));
    if (opts.orderBy) params.set("order_by", opts.orderBy);
    return request<{ data: T[] }>(`/api/resource/${encodeURIComponent(doctype)}?${params}`).then((r) => r.data);
  },

  /** One document, with children expanded. */
  get<T = Record<string, unknown>>(doctype: string, name: string) {
    return request<{ data: T }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`).then((r) => r.data);
  },

  /** Count for pagination. */
  count(doctype: string, filters?: Record<string, unknown> | string) {
    const params = new URLSearchParams({ doctype });
    if (filters) params.set("filters", typeof filters === "string" ? filters : JSON.stringify(filters));
    return request<{ message: number }>(`/api/method/frappe.client.get_count?${params}`).then((r) => r.message);
  },

  create(doctype: string, doc: Record<string, unknown>) {
    return request<{ data: Record<string, unknown> }>(`/api/resource/${encodeURIComponent(doctype)}`, {
      method: "POST",
      body: JSON.stringify(doc),
    }).then((r) => r.data);
  },

  update(doctype: string, name: string, doc: Record<string, unknown>) {
    return request<{ data: Record<string, unknown> }>(
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
      { method: "PUT", body: JSON.stringify(doc) },
    ).then((r) => r.data);
  },

  remove(doctype: string, name: string) {
    return request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { method: "DELETE" });
  },

  /** docstatus transitions: submit / cancel (amend happens client-side via cancel + copy). */
  setDocstatus(doctype: string, name: string, docstatus: 0 | 1 | 2) {
    return this.update(doctype, name, { docstatus });
  },

  /** DocType metadata (fields, permissions) fetched from the DocType record itself. */
  meta<T = DocTypeMeta>(doctype: string) {
    return request<{ data: T }>(`/api/resource/DocType/${encodeURIComponent(doctype)}`).then((r) => r.data);
  },

  /** Link field search (frappe.desk.search.search_link). */
  searchLink(doctype: string, txt: string) {
    const body = new URLSearchParams({ doctype, txt });
    return request<{ results: SearchResult[] }>("/api/method/frappe.desk.search.search_link", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }).then((r) => r.results ?? []);
  },

  /** Call any whitelisted @frappe.whitelist() method of your custom app. */
  call<T = unknown>(method: string, args: Record<string, unknown> = {}) {
    return request<{ message: T }>(`/api/method/${method}`, {
      method: "POST",
      body: JSON.stringify(args),
    }).then((r) => r.message);
  },

  /** Upload a file to Frappe. Returns the file URL. */
  uploadFile(file: File, doctype?: string, docname?: string): Promise<string> {
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("is_private", "0");
    if (doctype) fd.append("doctype", doctype);
    if (docname) fd.append("docname", docname);
    return fetch("/api/method/upload_file", {
      method: "POST",
      credentials: "include",
      body: fd,
    })
      .then((r) => r.json())
      .then((r) => r.message?.file_url ?? "");
  },
};

export interface SearchResult {
  value: string;
  description?: string;
}

export interface MetaField {
  fieldname: string;
  label: string;
  fieldtype: string;
  options?: string;
  reqd?: 0 | 1;
  hidden?: 0 | 1;
  read_only?: 0 | 1;
  in_list_view?: 0 | 1;
  in_standard_filter?: 0 | 1;
  default?: string;
  depends_on?: string;
  description?: string;
}

export interface DocTypeMeta {
  name: string;
  module?: string;
  istable?: number;
  issingle?: number;
  is_submittable?: number;
  naming_rule?: string;
  autoname?: string;
  title_field?: string;
  search_fields?: string;
  default_sort_field?: string;
  fields: MetaField[];
  permissions?: { role: string; read?: number; write?: number; create?: number; delete?: number; submit?: number }[];
}
