import type { PlayLensState } from "../state/appState";
import type { EventId, ISODateTime, Session, SessionId, TimelineEvent } from "../data/types";

export type ApiStatus = "ok" | "error";
export type ExportFormat = "json" | "ndjson" | "markdown";

export interface ApiErrorBody {
  status: "error";
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  ok: boolean;
  status: "ok";
  service: "playlens-backend";
  storageReady: boolean;
  storageRoot: string;
  version: string;
  timestamp: ISODateTime;
  checkedAt: ISODateTime;
}

export interface StateResponse {
  status: "ok";
  state: PlayLensState;
}

export interface StateSaveResponse {
  status: "ok";
  savedAt: ISODateTime;
  snapshotPath: string;
}

export interface SessionManifest {
  version: 1;
  session: Session;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  eventCount: number;
  eventsFile: string;
  artifactsDir: string;
  lastEventId?: EventId;
}

export interface StoredSessionSummary {
  id: SessionId;
  taskId: Session["taskId"];
  title: string;
  status: Session["status"];
  browserName: Session["browser"]["name"];
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  updatedAt: ISODateTime;
  currentUrl?: string;
  eventCount: number;
  issueCount: number;
}

export interface SessionsResponse {
  status: "ok";
  sessions: StoredSessionSummary[];
}

export interface ExportResult {
  format: ExportFormat;
  contentType: string;
  fileName: string;
  filePath: string;
  content: string;
  createdAt: ISODateTime;
}

export interface SessionEventAppendResult {
  status: "ok";
  sessionId: SessionId;
  eventId: TimelineEvent["id"];
  eventCount: number;
  updatedAt: ISODateTime;
}
