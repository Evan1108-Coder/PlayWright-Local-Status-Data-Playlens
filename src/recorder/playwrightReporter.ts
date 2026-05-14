import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type TestLike = {
  title?: string;
  titlePath?: () => string[];
  location?: { file?: string; line?: number; column?: number };
  outcome?: () => string;
};

type ResultLike = {
  status?: string;
  duration?: number;
  retry?: number;
  error?: { message?: string; stack?: string };
  errors?: Array<{ message?: string; stack?: string }>;
};

type SuiteLike = {
  allTests?: () => TestLike[];
};

interface ReporterEvent {
  kind: string;
  timestamp: string;
  title: string;
  message: string;
  severity: "trace" | "info" | "warning" | "error" | "critical";
  data: Record<string, unknown>;
}

export default class PlayLensReporter {
  private readonly eventFile = process.env.PLAYLENS_REPORTER_EVENT_FILE || process.env.PLAYLENS_EVENT_FILE;

  onBegin(_config: unknown, suite: SuiteLike): void {
    this.write({
      kind: "playwright.test.begin",
      severity: "info",
      title: "Playwright test run began",
      message: `${suite.allTests?.().length ?? 0} tests discovered`,
      data: { testCount: suite.allTests?.().length ?? 0 }
    });
  }

  onTestBegin(test: TestLike, result: ResultLike): void {
    this.write({
      kind: "playwright.test.started",
      severity: "info",
      title: testTitle(test),
      message: `Started ${testTitle(test)}`,
      data: { test: serializeTest(test), retry: result.retry ?? 0 }
    });
  }

  onStdOut(chunk: string | Buffer, test?: TestLike, result?: ResultLike): void {
    this.writeOutput("stdout", chunk, test, result);
  }

  onStdErr(chunk: string | Buffer, test?: TestLike, result?: ResultLike): void {
    this.writeOutput("stderr", chunk, test, result);
  }

  onTestEnd(test: TestLike, result: ResultLike): void {
    const failed = result.status && !["passed", "skipped"].includes(result.status);
    this.write({
      kind: "playwright.test.ended",
      severity: failed ? "error" : "info",
      title: testTitle(test),
      message: `${testTitle(test)} ${result.status ?? "finished"}`,
      data: {
        test: serializeTest(test),
        result: {
          status: result.status,
          duration: result.duration,
          retry: result.retry,
          error: result.error,
          errors: result.errors
        }
      }
    });
  }

  onError(error: Error): void {
    this.write({
      kind: "playwright.test.error",
      severity: "critical",
      title: "Playwright reporter error",
      message: error.message,
      data: { stack: error.stack }
    });
  }

  onEnd(result: ResultLike): void {
    this.write({
      kind: "playwright.test.runEnded",
      severity: result.status === "passed" ? "info" : "error",
      title: "Playwright test run ended",
      message: `Run ${result.status ?? "ended"}`,
      data: { status: result.status, duration: result.duration }
    });
  }

  private writeOutput(stream: "stdout" | "stderr", chunk: string | Buffer, test?: TestLike, result?: ResultLike): void {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    this.write({
      kind: `playwright.test.${stream}`,
      severity: stream === "stderr" ? "warning" : "trace",
      title: stream,
      message: text.replace(/\s+$/g, "").slice(0, 500),
      data: { stream, text, test: test ? serializeTest(test) : undefined, retry: result?.retry }
    });
  }

  private write(input: Omit<ReporterEvent, "timestamp">): void {
    const event: ReporterEvent = { ...input, timestamp: new Date().toISOString() };
    if (this.eventFile) {
      mkdirSync(dirname(this.eventFile), { recursive: true });
      appendFileSync(this.eventFile, `${JSON.stringify(event)}\n`, "utf8");
      return;
    }
    process.stdout.write(`[PlayLens] ${JSON.stringify(event)}\n`);
  }
}

function testTitle(test: TestLike): string {
  return test.titlePath?.().join(" > ") || test.title || "Untitled Playwright test";
}

function serializeTest(test: TestLike): Record<string, unknown> {
  return {
    title: test.title,
    titlePath: test.titlePath?.(),
    location: test.location,
    outcome: test.outcome?.()
  };
}
