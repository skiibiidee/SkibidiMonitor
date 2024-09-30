import { cpus } from "node:os";

interface Screen {
  setText(
    position: { row: number; column: number; vertical?: boolean },
    text: string,
  ): void;
  data: string[][];
}

interface TerminalSize {
  rows: number;
  columns: number;
}

interface Point {
  texts: Array<{ row: number; column: number; text: string }>;
  display(): void;
}

interface CycleState {}

async function cycle(
  state: CycleState,
  getScreen: () => Screen,
  getTerminalSize: () => TerminalSize,
  changeNextScreenBuffer: (data: string[][]) => void,
): Promise<void> {
  const screen = getScreen();
  const { rows, columns } = getTerminalSize();

  const topbar = getPoint([1, 2], screen);
  topbar.texts.push({ row: 0, column: 0, text: `Host Name: ${hostname}` });
  topbar.texts.push({ row: 1, column: 0, text: `OS: ${os}` });
  topbar.texts.push({
    row: 2,
    column: 0,
    text: `OS Uptime: ${formatSeconds(osUptime)}`,
  });
  topbar.texts.push({ row: 3, column: 0, text: diskusage });
  topbar.texts.push({ row: 4, column: 0, text: getFormattedCpuInfo() });
  topbar.texts.push({
    row: 5,
    column: 0,
    text: `Device Memory: ${formatBytes(getTotalMemory())}`,
  });
  topbar.texts.push({
    row: 6,
    column: 0,
    text: `Process Memory Usage: ${formatBytes(getProcessUsedMemory())}`,
  });
  topbar.texts.push({ row: 7, column: 0, text: `Process PID: ${pid}` });
  topbar.texts.push({
    row: 8,
    column: 0,
    text: `Deno V8 Version: ${denoVersion}`,
  });
  topbar.texts.push({
    row: 9,
    column: 0,
    text: `Ping: ${pingerror ? "unknown" : responsetime} ms`,
  });

  const bottombar = getPoint([rows - 2, 2], screen);
  bottombar.texts.push({
    row: 0,
    column: 0,
    text: `Date Time: ${new Date().toISOString()}`,
  });
  bottombar.texts.push({
    row: -1,
    column: 0,
    text: `[${state === 0 ? "Text Color(1-9)" : "Background Color(1-8)"}]`,
  });
  bottombar.texts.push({ row: -2, column: 0, text: `Change State: [space]` });

  bottombar.display();
  topbar.display();
  addBorder(screen, { rows, columns });
  changeNextScreenBuffer(screen.data);
}

function formatSeconds(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;

  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;

  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  return `${days} day${days !== 1 ? "s" : ""}, ${hours} hour${
    hours !== 1 ? "s" : ""
  }, ${minutes} minute${minutes !== 1 ? "s" : ""}, ${seconds} second${
    seconds !== 1 ? "s" : ""
  }`;
}

function getFormattedCpuInfo(): string {
  const cpuInfo = cpus();

  if (cpuInfo.length === 0) {
    return "CPU: Unknown";
  }

  const speed = cpuInfo[0].speed;
  const processorCount = cpuInfo.length;
  const formattedSpeed = (speed / 1000).toFixed(2);

  return `CPU: ${processorCount} processors @ ${formattedSpeed} GHz`;
}

function getTotalMemory(): number {
  return Deno.systemMemoryInfo().total;
}

function getProcessUsedMemory(): number {
  const memoryUsage = Deno.memoryUsage();
  return memoryUsage.rss;
}

function getPoint(rc: [number, number], screen: Screen): Point {
  const pointrow = rc[0];
  const pointcolumn = rc[1];
  return {
    texts: [],
    display: function () {
      for (let i = 0; i < this.texts.length; i++) {
        screen.setText(
          {
            row: pointrow + this.texts[i].row,
            column: pointcolumn + this.texts[i].column,
          },
          this.texts[i].text,
        );
      }
    },
  };
}

function addBorder(screen: Screen, { rows, columns }: TerminalSize): void {
  screen.setText({ row: 0, column: 0 }, "╭");
  screen.setText({ row: 0, column: columns - 1 }, "╮");
  screen.setText({ row: rows - 1, column: columns - 1 }, "╯");
  screen.setText({ row: rows - 1, column: 0 }, "╰");

  screen.setText({ row: rows - 1, column: 1 }, "─".repeat(columns - 2));
  screen.setText({ row: 0, column: 1 }, "─".repeat(columns - 2));
  screen.setText({ row: 1, column: 0, vertical: true }, "│".repeat(rows - 2));
  screen.setText(
    { row: 1, column: columns - 1, vertical: true },
    "│".repeat(rows - 2),
  );
}

const hostname = Deno.hostname();
function formatBytes(bytes: number): string {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Bytes";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

let responsetime = 0;
let pingerror = false;
let diskusage = "Disk C: 0 GB free of 0 GB (0%)";

async function ping(host: string): Promise<void> {
  while (true) {
    const start = performance.now();

    try {
      await fetch(`http://${host}`);
      const end = performance.now();
      if (end) {
        responsetime = Math.floor(end - start);
        pingerror = false;
      }
    } catch (error) {
      pingerror = true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function getDiskUsage(): Promise<void> {
  while (true) {
    const process = Deno.run({
      cmd: ["wmic", "logicaldisk", "get", "caption,freespace,size"],
      stdout: "piped",
    });
    const output = await process.output();
    const decoder = new TextDecoder();
    const result = decoder.decode(output);
    process.close();

    const lines = result.trim().split("\n").slice(1);
    lines.forEach((line) => {
      const [caption, freeSpaceStr, totalSizeStr] = line.trim().split(/\s+/);
      const freeSpace = parseInt(freeSpaceStr, 10);
      const totalSize = parseInt(totalSizeStr, 10);

      if (caption && !isNaN(freeSpace) && !isNaN(totalSize)) {
        const usedSpace = totalSize - freeSpace;
        const formattedFree = formatBytes(freeSpace);
        const formattedTotal = formatBytes(totalSize);
        const usedPercentage = ((usedSpace / totalSize) * 100).toFixed(2);

        diskusage =
          `Disk ${caption} ${formattedFree} free of ${formattedTotal} (${usedPercentage}%)`;
      }
    });
  }
}

getDiskUsage();
ping("google.com");
const os = Deno.osRelease();
let osUptime = Deno.osUptime();
setInterval(() => osUptime = Deno.osUptime(), 1000);
const pid = Deno.pid;
const denoVersion = Deno.version.v8;

export default cycle;
