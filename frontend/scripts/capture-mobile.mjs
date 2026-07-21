import { writeFile } from "node:fs/promises";

const [url, output, widthArg = "390", heightArg = "844", portArg = "9339", clickText = ""] = process.argv.slice(2);
if (!url || !output) throw new Error("usage: node scripts/capture-mobile.mjs <url> <output> [width] [height] [port]");

const width = Number(widthArg);
const height = Number(heightArg);
const port = Number(portArg);
const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const waiting = new Map();
let sequence = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = waiting.get(message.id);
  if (!request) return;
  waiting.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width <= 680,
  screenWidth: width,
  screenHeight: height,
  screenOrientation: { type: "portraitPrimary", angle: 0 },
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Page.navigate", { url });
await new Promise((resolve) => setTimeout(resolve, 2800));

if (clickText) {
  await send("Runtime.evaluate", {
    expression: `(() => {
      const candidates = [...document.querySelectorAll('button, a')];
      const target = candidates.find((element) => element.textContent?.trim() === ${JSON.stringify(clickText)})
        ?? candidates.find((element) => element.textContent?.includes(${JSON.stringify(clickText)}));
      if (!target) return false;
      target.click();
      return true;
    })()`,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

const layout = await send("Runtime.evaluate", {
  expression: `({
    pathname: window.location.pathname,
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    selectedBranch: document.querySelector('select')?.value ?? null,
    mobileScreen: document.querySelector('[data-mobile-screen]')?.getAttribute('data-mobile-screen')
  })`,
  returnByValue: true,
});
const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
await writeFile(output, Buffer.from(screenshot.data, "base64"));
console.log(JSON.stringify(layout.result.value));
socket.close();
