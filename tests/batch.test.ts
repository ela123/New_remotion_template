import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkOutputCollisions, findVideos, parseBatchArgs, processVideo, type VideoJob } from "../scripts/batch";

describe("batch script options parsing", () => {
  it("uses sensible defaults when no flags are passed", () => {
    const opts = parseBatchArgs([]);
    expect(opts.force).toBe(false);
    expect(opts.model).toBe("small.en");
    expect(opts.inputDir).toBe("input");
    expect(opts.outDir).toBe("out");
    expect(opts.workDir).toBe("work");
  });

  it("parses --force, --model, and custom paths", () => {
    const opts = parseBatchArgs([
      "--force",
      "--model",
      "base.en",
      "--input-dir",
      "my-input",
      "--out-dir",
      "my-out",
      "--work-dir",
      "my-work",
    ]);
    expect(opts.force).toBe(true);
    expect(opts.model).toBe("base.en");
    expect(opts.inputDir).toBe("my-input");
    expect(opts.outDir).toBe("my-out");
    expect(opts.workDir).toBe("my-work");
  });
});

describe("batch video discovery", () => {
  const testDir = path.resolve("tmp-batch-test");
  const testInput = path.resolve(testDir, "input");
  const testOut = path.resolve(testDir, "out");

  beforeEach(() => {
    mkdirSync(testInput, { recursive: true });
    mkdirSync(testOut, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("returns empty array if input folder has no videos", () => {
    const jobs = findVideos(testInput, testOut);
    expect(jobs).toEqual([]);
  });

  it("finds all supported video formats (.mp4, .mov, .mkv, .webm) and ignores unsupported files", () => {
    writeFileSync(path.join(testInput, "interview3.mov"), "");
    writeFileSync(path.join(testInput, "interview1.mp4"), "");
    writeFileSync(path.join(testInput, "interview4.webm"), "");
    writeFileSync(path.join(testInput, "interview2.mkv"), "");
    writeFileSync(path.join(testInput, "notes.txt"), "some notes");
    writeFileSync(path.join(testInput, "image.png"), "");
    mkdirSync(path.join(testInput, "subfolder"), { recursive: true });
    writeFileSync(path.join(testInput, "subfolder", "nested.mp4"), "");

    const jobs = findVideos(testInput, testOut);
    expect(jobs).toHaveLength(4);

    // Sorted alphabetically
    expect(jobs.map((j) => j.filename)).toEqual([
      "interview1.mp4",
      "interview2.mkv",
      "interview3.mov",
      "interview4.webm",
    ]);

    expect(jobs[0]?.outputFilename).toBe("interview1.mp4");
    expect(jobs[1]?.outputFilename).toBe("interview2.mp4");
    expect(jobs[2]?.outputFilename).toBe("interview3.mp4");
    expect(jobs[3]?.outputFilename).toBe("interview4.mp4");
  });

  it("handles case-insensitive extensions (.MP4, .MOV)", () => {
    writeFileSync(path.join(testInput, "clip_upper.MP4"), "");
    writeFileSync(path.join(testInput, "clip_mov.MOV"), "");

    const jobs = findVideos(testInput, testOut);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.outputFilename)).toEqual(["clip_mov.mp4", "clip_upper.mp4"]);
  });
});

describe("batch collision detection", () => {
  it("detects when two different extensions produce the same output name", () => {
    const jobs: VideoJob[] = [
      {
        filename: "interview1.mp4",
        inputPath: "/input/interview1.mp4",
        baseName: "interview1",
        outputFilename: "interview1.mp4",
        finalOutputPath: "/out/interview1.mp4",
      },
      {
        filename: "interview1.mov",
        inputPath: "/input/interview1.mov",
        baseName: "interview1",
        outputFilename: "interview1.mp4",
        finalOutputPath: "/out/interview1.mp4",
      },
      {
        filename: "interview2.mp4",
        inputPath: "/input/interview2.mp4",
        baseName: "interview2",
        outputFilename: "interview2.mp4",
        finalOutputPath: "/out/interview2.mp4",
      },
    ];

    const collisions = checkOutputCollisions(jobs);
    expect(collisions.size).toBe(1);
    expect(collisions.get("interview1.mp4")).toEqual(["interview1.mp4", "interview1.mov"]);
  });

  it("returns empty map when all output names are unique", () => {
    const jobs: VideoJob[] = [
      {
        filename: "a.mp4",
        inputPath: "/input/a.mp4",
        baseName: "a",
        outputFilename: "a.mp4",
        finalOutputPath: "/out/a.mp4",
      },
      {
        filename: "b.mov",
        inputPath: "/input/b.mov",
        baseName: "b",
        outputFilename: "b.mp4",
        finalOutputPath: "/out/b.mp4",
      },
    ];

    const collisions = checkOutputCollisions(jobs);
    expect(collisions.size).toBe(0);
  });
});

describe("batch video processing workflow & isolation", () => {
  const testDir = path.resolve("tmp-batch-proc-test");
  const testInput = path.resolve(testDir, "input");
  const testOut = path.resolve(testDir, "out");
  const testWork = path.resolve(testDir, "work");

  beforeEach(() => {
    mkdirSync(testInput, { recursive: true });
    mkdirSync(testOut, { recursive: true });
    mkdirSync(testWork, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("skips videos whose output already exists when force is false", async () => {
    const existingOut = path.join(testOut, "existing.mp4");
    writeFileSync(existingOut, "dummy-mp4-data");

    const job: VideoJob = {
      filename: "existing.mp4",
      inputPath: path.join(testInput, "existing.mp4"),
      baseName: "existing",
      outputFilename: "existing.mp4",
      finalOutputPath: existingOut,
    };

    const status = await processVideo(
      job,
      0,
      1,
      { force: false, model: "small.en", inputDir: testInput, outDir: testOut, workDir: testWork },
      { tsxCli: "mock-tsx", remotionCli: "mock-remotion" },
    );

    expect(status).toBe("skipped");
  });

  it("fails gracefully and cleans up temp files when a step throws an error", async () => {
    const job: VideoJob = {
      filename: "broken.mp4",
      inputPath: path.join(testInput, "broken.mp4"),
      baseName: "broken",
      outputFilename: "broken.mp4",
      finalOutputPath: path.join(testOut, "broken.mp4"),
    };
    writeFileSync(job.inputPath, "not-a-real-video");

    const status = await processVideo(
      job,
      0,
      1,
      { force: true, model: "small.en", inputDir: testInput, outDir: testOut, workDir: testWork },
      { tsxCli: "non-existent-tsx-path", remotionCli: "mock-remotion" },
    );

    expect(status).toBe("failed");
    expect(existsSync(path.join(testOut, ".broken.tmp.mp4"))).toBe(false);
  });
});
