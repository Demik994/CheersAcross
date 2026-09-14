"use client";

import type { DrinkId } from "@/lib/drinks";
import type { GuestSession, RoomState } from "@/lib/rooms/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: string;
  json?: unknown;
  form?: FormData;
  session?: GuestSession;
};

async function request<T>(path: string, { method = "GET", json, form, session }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (json !== undefined) headers["content-type"] = "application/json";
  if (session) headers.authorization = `Bearer ${session.guestId}.${session.token}`;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Nema internetske veze. Pokušaj ponovno.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Nešto je pošlo po krivu.");
  return data as T;
}

const roomPath = (code: string) => `/api/rooms/${encodeURIComponent(code)}`;

export const roomApi = {
  create: (name: string, pin: string | null) =>
    request<{ code: string; session: GuestSession }>("/api/rooms", {
      method: "POST",
      json: { name, pin: pin || undefined },
    }),

  join: (code: string, name: string, pin: string | null) =>
    request<{ session: GuestSession }>(`${roomPath(code)}/join`, {
      method: "POST",
      json: { name, pin: pin || undefined },
    }),

  state: (code: string, session: GuestSession) =>
    request<{ state: RoomState; meId: string }>(`${roomPath(code)}/state`, { session }),

  setDrink: (code: string, session: GuestSession, drink: DrinkId) =>
    request<void>(`${roomPath(code)}/me`, { method: "PATCH", json: { drink }, session }),

  leave: (code: string, session: GuestSession) =>
    request<void>(`${roomPath(code)}/me`, { method: "DELETE", session }),

  uploadPhoto: (code: string, session: GuestSession, photo: Blob) => {
    const form = new FormData();
    form.append("file", photo, "photo.jpg");
    return request<{ photoUrl: string }>(`${roomPath(code)}/photo`, { method: "POST", form, session });
  },

  removePhoto: (code: string, session: GuestSession) =>
    request<void>(`${roomPath(code)}/photo`, { method: "DELETE", session }),

  ticket: (code: string, session: GuestSession) =>
    request<{ ticket: string; host: string }>(`${roomPath(code)}/ticket`, { session }),

  kick: (code: string, session: GuestSession, guestId: string) =>
    request<void>(`${roomPath(code)}/guests/${encodeURIComponent(guestId)}`, { method: "DELETE", session }),
};
