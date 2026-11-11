import { Camoufox } from "camoufox-js"

// Prevent crash when Firefox page errors have no location (CF/captcha JS errors)
process.on("uncaughtException", (err) => {
  if (err instanceof TypeError && err.message.includes("undefined is not an object")) return
  console.error("[uncaught]", err.message)
  process.exit(1)
})

async function main() {
  const browser = await Camoufox({
    headless: true,
    geoip: true,
    humanize: true,
    disable_coop: true,
    block_webrtc: true,
    iKnowWhatImDoing: true,
  })
  const ctx = await browser.newContext({ viewport: null })
  const page = await ctx.newPage()

  console.log("[1] example.com...")
  await page
    .goto("https://example.com", { waitUntil: "networkidle", timeout: 15000 })
    .catch((e) => console.log("err:", e.message))
  console.log(
    "[1] content:",
    (await page.content().catch(() => "")).length,
    "title:",
    await page.title().catch(() => "?"),
  )

  const page2 = await ctx.newPage()
  console.log("[2] nopecha.com...")
  await page2
    .goto("https://nopecha.com", { waitUntil: "domcontentloaded", timeout: 15000 })
    .catch((e) => console.log("err:", e.message))
  await new Promise((r) => setTimeout(r, 3000))
  console.log(
    "[2] content:",
    (await page2.content().catch(() => "")).length,
    "title:",
    await page2.title().catch(() => "?"),
  )

  console.log("[3] nopecha.com/demo/cloudflare...")
  await page2
    .goto("https://nopecha.com/demo/cloudflare", { waitUntil: "domcontentloaded", timeout: 30000 })
    .catch((e) => console.log("err:", e.message))
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const html = await page2.content().catch(() => "")
    const title = await page2.title().catch(() => "?")
    const url = page2.url()
    console.log(`[3.${i}] len=${html.length} title="${title}" url=${url.slice(0, 80)}`)
    if (!/Just a moment/i.test(title) && html.length > 200) break
  }

  const cookies = await ctx.cookies()
  console.log(
    "[3] cf_clearance:",
    cookies.some((c) => c.name === "cf_clearance"),
  )

  await browser.close()
}

main().catch((e) => {
  console.error("FAIL:", e.message)
  process.exit(1)
})
