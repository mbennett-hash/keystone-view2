// Lists every published chart — powers charts.html (the library).

import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export async function GET() {
  let blobs;
  try {
    ({ blobs } = await list({ prefix: "charts/" }));
  } catch (err) {
    return NextResponse.json({ error: err.message || "list failed" }, { status: 500 });
  }

  const charts = await Promise.all(
    blobs.map(async (b) => {
      const slug = b.pathname.replace(/^charts\//, "").replace(/\.json$/, "");
      try {
        const res = await fetch(b.url, { cache: "no-store" });
        const data = await res.json();
        return {
          slug,
          title: data.title || slug,
          theme: data.theme || null,
          chartType: data.chartType || null,
          folder: data.folder || null,
          createdAt: data.createdAt || b.uploadedAt,
          updatedAt: data.updatedAt || b.uploadedAt,
          changeCount: Array.isArray(data.changeLog) ? data.changeLog.length : 0,
        };
      } catch {
        return {
          slug,
          title: slug,
          theme: null,
          chartType: null,
          folder: null,
          createdAt: b.uploadedAt,
          updatedAt: b.uploadedAt,
          changeCount: 0,
        };
      }
    })
  );
  charts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return NextResponse.json({ charts });
}
