export const SUPPORTED_UPLOAD_EXTENSIONS = [
  "txt",
  "md",
  "csv",
  "json",
  "html",
  "pdf",
  "png",
  "jpg",
  "jpeg",
] as const;

export type SupportedUploadExtension = (typeof SUPPORTED_UPLOAD_EXTENSIONS)[number];

export type IngestedFileKind = "text" | "markdown" | "csv" | "json" | "html" | "pdf" | "image";

export interface IngestibleFileLike {
  name: string;
  size: number;
  type?: string;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export interface FileIngestionOptions {
  maxBytes?: number;
  includeImagePreview?: boolean;
}

export interface IngestedFile {
  id: string;
  name: string;
  extension: SupportedUploadExtension;
  mimeType: string;
  size: number;
  kind: IngestedFileKind;
  summary: string;
  text?: string;
  json?: unknown;
  dataUrl?: string;
  warnings: string[];
  createdAt: string;
}

export interface FileValidationResult {
  ok: boolean;
  extension?: SupportedUploadExtension;
  reason?: string;
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

const textKinds: Record<SupportedUploadExtension, IngestedFileKind> = {
  txt: "text",
  md: "markdown",
  csv: "csv",
  json: "json",
  html: "html",
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
};

export function getFileExtension(fileName: string): string {
  const lastSegment = fileName.trim().split(/[\\/]/).pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex >= 0 ? lastSegment.slice(dotIndex + 1).toLowerCase() : "";
}

export function isSupportedUploadExtension(extension: string): extension is SupportedUploadExtension {
  return SUPPORTED_UPLOAD_EXTENSIONS.includes(extension.toLowerCase() as SupportedUploadExtension);
}

export function validateUploadFile(file: IngestibleFileLike, options: FileIngestionOptions = {}): FileValidationResult {
  const extension = getFileExtension(file.name);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (!isSupportedUploadExtension(extension)) {
    return {
      ok: false,
      reason: `.${extension || "unknown"} is not supported. Supported files: ${SUPPORTED_UPLOAD_EXTENSIONS.map((item) => `.${item}`).join(", ")}.`,
    };
  }

  if (file.size > maxBytes) {
    return {
      ok: false,
      extension,
      reason: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB, above the ${(maxBytes / 1024 / 1024).toFixed(1)} MB limit.`,
    };
  }

  return { ok: true, extension };
}

export async function ingestFile(file: IngestibleFileLike, options: FileIngestionOptions = {}): Promise<IngestedFile> {
  const validation = validateUploadFile(file, options);
  if (!validation.ok || !validation.extension) {
    throw new Error(validation.reason ?? "Unsupported file.");
  }

  const extension = validation.extension;
  const kind = textKinds[extension];
  const warnings: string[] = [];
  const base = {
    id: createFileId(file.name),
    name: file.name,
    extension,
    mimeType: file.type || guessMimeType(extension),
    size: file.size,
    kind,
    warnings,
    createdAt: new Date().toISOString(),
  };

  if (kind === "image") {
    const dataUrl = options.includeImagePreview === false ? undefined : await readImageDataUrl(file, base.mimeType, warnings);
    return {
      ...base,
      summary: `${extension.toUpperCase()} image uploaded for visual context. MiniMax can inspect it when image access is enabled.`,
      dataUrl,
    };
  }

  if (kind === "pdf") {
    const dataUrl = options.includeImagePreview === false ? undefined : await readBinaryDataUrl(file, base.mimeType, warnings);
    return {
      ...base,
      summary: "PDF accepted. Text extraction should be handled by the server-side MiniMax ingestion pipeline or a PDF parser worker.",
      dataUrl,
      warnings: [
        ...warnings,
        "Browser-side PDF text extraction is intentionally deferred so large PDFs do not block the dashboard.",
      ],
    };
  }

  const text = await readText(file, warnings);
  if (kind === "json") {
    try {
      const json = JSON.parse(text);
      return {
        ...base,
        summary: summarizeText("JSON", text),
        text,
        json,
      };
    } catch (error) {
      warnings.push(error instanceof Error ? `JSON parse warning: ${error.message}` : "JSON parse warning: invalid JSON.");
    }
  }

  return {
    ...base,
    summary: summarizeText(kind.toUpperCase(), text),
    text,
  };
}

export async function ingestFiles(files: Iterable<IngestibleFileLike>, options: FileIngestionOptions = {}): Promise<IngestedFile[]> {
  const ingested: IngestedFile[] = [];
  for (const file of files) {
    ingested.push(await ingestFile(file, options));
  }
  return ingested;
}

function createFileId(fileName: string): string {
  const normalizedName = fileName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return `file-${normalizedName || "upload"}-${Date.now().toString(36)}-${random}`;
}

function guessMimeType(extension: SupportedUploadExtension): string {
  switch (extension) {
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "html":
      return "text/html";
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
  }
}

async function readText(file: IngestibleFileLike, warnings: string[]): Promise<string> {
  if (file.text) {
    return file.text();
  }

  if (!file.arrayBuffer) {
    warnings.push("This file object does not expose text() or arrayBuffer(); only metadata was ingested.");
    return "";
  }

  const buffer = await file.arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

async function readImageDataUrl(file: IngestibleFileLike, mimeType: string, warnings: string[]): Promise<string | undefined> {
  return readBinaryDataUrl(file, mimeType, warnings);
}

async function readBinaryDataUrl(file: IngestibleFileLike, mimeType: string, warnings: string[]): Promise<string | undefined> {
  if (!file.arrayBuffer) {
    warnings.push("This file object does not expose arrayBuffer(); preview data was skipped.");
    return undefined;
  }

  const buffer = await file.arrayBuffer();
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  const bufferCtor = (globalThis as unknown as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  return bufferCtor?.from(binary, "binary").toString("base64") ?? "";
}

function summarizeText(label: string, text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const preview = compact.length > 140 ? `${compact.slice(0, 140)}...` : compact;
  const lineCount = text ? text.split(/\r?\n/).length : 0;
  return `${label} file with ${lineCount.toLocaleString()} lines. ${preview}`;
}
