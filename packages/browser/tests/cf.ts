import { launchOptions } from "camoufox-js"
import { firefox } from "patchright"

process.on("uncaughtException", (err) => {
  if (err instanceof TypeError && /pageError|location/.test(err.message)) return
  console.error("[uncaught]", err.message)
  process.exit(1)
})

async function main() {
  const opts = await launchOptions({
    headless: true,
    geoip: true,
    humanize: true,
    disable_coop: true,
    block_webrtc: true,
    i_know_what_im_doing: true,
  })

  const browser = await firefox.launch(opts)
  const ctx = await browser.newContext({ viewport: null })
  const page = await ctx.newPage()

  console.log("[test] visiting nopecha.com/demo/cloudflare...")
  await page
    .goto("https://nopecha.com/demo/cloudflare", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
    .catch((error: unknown) => {
      console.log("[test] goto error:", error instanceof Error ? error.message.slice(0, 80) : String(error))
    })

  await new Promise((r) => setTimeout(r, 8000))
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})

  // Try both ways of getting HTML
  const htmlFromContent = await page.content().catch(() => "")
  const htmlFromEval = await page.evaluate(() => document.documentElement?.outerHTML ?? "").catch(() => "")

  console.log("[test] page.content() length:", htmlFromContent.length)
  console.log("[test] page.evaluate() length:", htmlFromEval.length)
  console.log("[test] URL:", page.url())
  console.log("[test] Title:", await page.title().catch(() => "?"))

  if (htmlFromEval.length > 100) {
    console.log("[test] HTML snippet:", htmlFromEval.slice(0, 300))
  }

  const cookies = await ctx.cookies()
  console.log("[test] cookies:", cookies.map((c) => c.name).join(", "))

  await browser.close()
}

main().catch((e) => {
  console.error("[test] FAIL:", e.message)
  process.exit(1)
})
