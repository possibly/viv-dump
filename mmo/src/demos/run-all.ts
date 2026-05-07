// Run all demos sequentially. Each demo is a self-contained file that exits 1 on failure.
// Aggregates pass/fail counts and elapsed time.

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runOne(file: string): Promise<{ name: string; ok: boolean; output: string }> {
    return new Promise((res) => {
        const child = spawn("npx", ["tsx", "--tsconfig", "tsconfig.json", file], {
            cwd: resolve(__dirname, "..", ".."),
            env: process.env,
        });
        let out = "";
        child.stdout.on("data", (d) => { out += d.toString(); });
        child.stderr.on("data", (d) => { out += d.toString(); });
        child.on("close", (code) => {
            res({ name: file, ok: code === 0, output: out.trim() });
        });
    });
}

async function main(): Promise<void> {
    const files = readdirSync(__dirname)
        .filter(f => /^\d+.+\.ts$/.test(f))
        .sort()
        .map(f => resolve(__dirname, f));

    console.log(`=== Running ${files.length} demos ===\n`);
    const start = Date.now();
    let pass = 0;
    let fail = 0;
    for (const file of files) {
        const r = await runOne(file);
        console.log(r.output);
        if (r.ok) pass += 1; else fail += 1;
    }
    const elapsed = Date.now() - start;
    console.log(`\n=== ${pass} passed, ${fail} failed in ${elapsed}ms ===`);
    if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
