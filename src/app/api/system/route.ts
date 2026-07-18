import { NextRequest, NextResponse } from "next/server";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

// Kontrol proses untuk operator awam: Restart & Update via systemd (mirip
// shopee-automation). Bedanya app ini jalan mode PRODUKSI, jadi keduanya harus
// build ulang sebelum restart bermakna. "Update" menarik kode dari GitHub dulu.
// "Restart" build dari kode yang sudah ada di komputer server dipakai selama
// coding masih dilakukan langsung di mesin server (belum lewat GitHub). Kedua
// aksi selalu dieksekusi di mesin server, dari perangkat mana pun tombolnya
// diklik.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pExecFile = promisify(execFile);

const SERVICE = process.env.AFFILIATE_ADS_SERVICE || "affiliate-ads";
const CWD = process.cwd();
const GIT = "/usr/bin/git";
const NPM = "/usr/bin/npm";

type StepResult = { ok: boolean; out: string };

async function run(
  cmd: string,
  args: string[],
  envOverride?: Record<string, string>
): Promise<StepResult> {
  try {
    const { stdout, stderr } = await pExecFile(cmd, args, {
      cwd: CWD,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
      env: envOverride ? { ...process.env, ...envOverride } : process.env,
    });
    return { ok: true, out: [stdout, stderr].filter(Boolean).join("\n").trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const out = [err.stdout, err.stderr, err.message]
      .filter(Boolean)
      .join("\n")
      .trim();
    return { ok: false, out };
  }
}

// Picu restart SETELAH response terkirim. Proses ini akan dibunuh saat service
// di-stop, maka: detach + `sleep 1` (beri waktu response flush) + `--no-block`
// (job restart cukup diterima manager; systemctl boleh mati setelahnya).
function triggerRestart(): void {
  const child = spawn(
    "bash",
    ["-c", `sleep 1; systemctl --user restart --no-block ${SERVICE}`],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action;

  if (action === "restart") {
    // Build dari source lokal (tanpa git pull / npm install). Jika build
    // gagal, JANGAN restart biar versi lama tetap jalan.
    const log: string[] = [];
    const build = await run(NPM, ["run", "build"]);
    log.push("$ npm run build\n" + build.out);
    if (!build.ok) {
      return NextResponse.json(
        { ok: false, step: "build", log: log.join("\n\n") },
        { status: 500 }
      );
    }
    triggerRestart();
    return NextResponse.json({
      ok: true,
      message: "Build selesai. Server restart untuk memuat versi terbaru.",
      log: log.join("\n\n"),
    });
  }

  if (action === "update") {
    const log: string[] = [];

    // 1) Tarik kode terbaru dari GitHub (fast-forward saja hindari merge tak terduga).
    const pull = await run(GIT, ["pull", "--ff-only"]);
    log.push("$ git pull --ff-only\n" + pull.out);
    if (!pull.ok) {
      return NextResponse.json(
        { ok: false, step: "git pull", log: log.join("\n\n") },
        { status: 500 }
      );
    }

    // 2) Sinkronkan dependency. Paksa sertakan devDependencies service jalan
    //    NODE_ENV=production yang secara default membuang dev deps (typescript,
    //    tailwind) sehingga build gagal.
    const install = await run(
      NPM,
      ["install", "--no-audit", "--no-fund", "--include=dev"],
      { NODE_ENV: "development" }
    );
    log.push("$ npm install --include=dev\n" + install.out);
    if (!install.ok) {
      return NextResponse.json(
        { ok: false, step: "npm install", log: log.join("\n\n") },
        { status: 500 }
      );
    }

    // 3) Build produksi. Jika gagal, JANGAN restart biar versi lama tetap jalan.
    const build = await run(NPM, ["run", "build"]);
    log.push("$ npm run build\n" + build.out);
    if (!build.ok) {
      return NextResponse.json(
        { ok: false, step: "build", log: log.join("\n\n") },
        { status: 500 }
      );
    }

    // 4) Restart untuk memuat build baru.
    triggerRestart();
    return NextResponse.json({
      ok: true,
      message: "Update selesai. Server restart untuk memuat versi terbaru.",
      log: log.join("\n\n"),
    });
  }

  return NextResponse.json(
    { error: "action tidak dikenal (gunakan 'restart' atau 'update')" },
    { status: 400 }
  );
}
