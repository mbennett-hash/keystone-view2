// Folder list — GET/POST /api/folders.
//
// A folder is just a name a chart's `folder` field can be set to (see
// app/api/charts/[slug]/route.js). Charts already carry their folder, so
// in principle the folder list could be inferred from them — but that
// loses a folder the moment its last chart is moved out or deleted, and
// stops you creating an empty folder ahead of time. So the list of
// folder names is kept separately, in one small blob.

import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";

const FOLDERS_PATH = "meta/folders.json";

async function readFolders() {
  try {
    const blob = await head(FOLDERS_PATH);
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.folders) ? data.folders : [];
  } catch {
    return [];
  }
}

async function writeFolders(folders) {
  await put(FOLDERS_PATH, JSON.stringify({ folders }, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function GET() {
  const folders = await readFolders();
  return NextResponse.json({ folders });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "folder name required" }, { status: 400 });

  const folders = await readFolders();
  if (!folders.includes(name)) {
    folders.push(name);
    try {
      await writeFolders(folders);
    } catch (err) {
      return NextResponse.json({ error: err.message || "save failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ folders });
}
