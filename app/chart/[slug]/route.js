// A standalone page for one published chart, served as a plain Route
// Handler rather than a React page. embed.js mutates the .ki-chart div's
// contents directly (it has to — it's designed to work on any page,
// including ones with no framework at all), and React's hydration wants
// to own that same node, so the two fight if this were a normal
// server-rendered page. Returning raw HTML sidesteps that entirely — this
// route works exactly like editor.html and test.html: static markup, no
// React in the loop.
export async function GET(request, { params }) {
  const { slug } = params;
  const safeSlug = encodeURIComponent(slug);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Keystone View — ${safeSlug}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f4f5f7;margin:0;padding:40px 20px;}
.wrap{max-width:900px;margin:0 auto;}</style>
</head>
<body>
<div class="wrap">
  <div class="ki-chart" data-src="chart/${safeSlug}"></div>
  <script src="/embed.js"></script>
</div>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
