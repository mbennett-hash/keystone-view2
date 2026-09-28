// Chart storage — GET/POST/PATCH /api/charts/<slug>.
//
// Backed by Vercel Blob. Each published chart is one JSON blob at
// charts/<slug>.json — publishing overwrites that same blob (not a new
// one each time), so a slug always resolves to whatever was last
// published under it. This replaced an earlier local-disk version that
// worked fine with `npm run dev` but failed on Vercel: its serverless
// functions run on a read-only filesystem, so writing a file there threw
// EROFS. Blob storage isn't tied to any one server, so it works the same
// way locally and in production, as long as BLOB_READ_WRITE_TOKEN is
// available (see README — Vercel sets this automatically once you've
// created a Blob store for the project; for local dev you pull it with
// `vercel env pull .env.local`).
//
// A record on disk looks like:
//   {
//     ...every field the editor's `state` object has (title, data, theme, etc),
//     slug, folder,
//     createdAt,           // set once, on the very first publish, never touched again
//     updatedAt,           // stamped on every publish
//     changeLog: [ { author, note, at } ],  // newest last
//   }

import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";

function blobPath(slug) {
  // Guard against path traversal — a slug is a filename, nothing else.
  const safe = String(slug).replace(/[^a-zA-Z0-9-_]/g, "");
  if (!safe) throw new Error("invalid slug");
  return `charts/${safe}.json`;
}

async function readExisting(slug) {
  try {
    const blob = await head(blobPath(slug));
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // no existing blob — this slug hasn't been published before
  }
}

export async function GET(request, { params }) {
  const existing = await readExisting(params.slug);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(existing, {
    headers: {
      // Test page and embed.js both fetch this on every load right now —
      // fine for a proof of concept, worth caching once this is real.
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function POST(request, { params }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // authorName/changeNote describe THIS publish and go into changeLog, not
  // into the chart's own fields.
  const { authorName, changeNote, ...chartFields } = body;

  const existing = await readExisting(params.slug);
  const now = new Date().toISOString();

  const changeLog = Array.isArray(existing?.changeLog) ? existing.changeLog.slice() : [];
  changeLog.push({
    author: (authorName || "").trim() || "Unknown",
    note: (changeNote || "").trim(),
    at: now,
  });

  const record = {
    ...chartFields,
    slug: params.slug,
    folder: chartFields.folder ?? existing?.folder ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    changeLog,
  };

  try {
    await put(blobPath(params.slug), JSON.stringify(record, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true, // republishing the same slug must replace it, not pile up
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "publish failed" }, { status: 500 });
  }
  return NextResponse.json(record);
}

// Folder moves (drag-and-drop in the chart library) don't touch the
// chart's content or its change log — just where it's filed.
export async function PATCH(request, { params }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const existing = await readExisting(params.slug);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const record = {
    ...existing,
    folder: "folder" in body ? body.folder || null : existing.folder,
  };

  try {
    await put(blobPath(params.slug), JSON.stringify(record, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "move failed" }, { status: 500 });
  }
  return NextResponse.json(record);
}
