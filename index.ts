import cycle from "./cycle.ts";
import process from "node:process";

const refreshRateMs = 1000 / 100;
const stdin = process.stdin;
const escape = "\u001b";

interface ColorCodes {
  [key: number]: {
    [key: string]: string;
  };
}

const colorCodes: ColorCodes = {
  0: {
    "1": `${escape}[30m`,
    "2": `${escape}[31m`,
    "3": `${escape}[32m`,
    "4": `${escape}[33m`,
    "5": `${escape}[34m`,
    "6": `${escape}[35m`,
    "7": `${escape}[36m`,
    "8": `${escape}[37m`,
    "9": `${escape}[0m`,
  },
  1: {
    "1": `${escape}[40m`,
    "2": `${escape}[41m`,
    "3": `${escape}[42m`,
    "4": `${escape}[43m`,
    "5": `${escape}[44m`,
    "6": `${escape}[45m`,
    "7": `${escape}[46m`,
    "8": `${escape}[47m`,
  },
};

let state = 0;
let bgtextcode: { [key: number]: string } = { 0: "", 1: "" };

let screenBuffer: string[][] | undefined;
let nextScreenBuffer: string[][] | undefined;

stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding("utf8");

stdin.on("data", async function (key: string) {
  if (key === "\u0003" || key === "k") {
    process.exit(0);
  }
  if (key === " ") {
    state = state === 1 ? 0 : state + 1;
    return;
  }

  if (Object.keys(colorCodes[state]).includes(String(key))) {
    bgtextcode[state] = colorCodes[state][String(key)];
  }
});

interface Screen {
  data: string[][];
  setText(position: { row: number; column: number; vertical?: boolean }, text: string): void;
  setChar(position: { row: number; column: number }, escapecode?: string, char?: string): void;
}

function getScreen(): Screen {
  const template: string[][] = [];
  const { columns, rows } = getTerminalSize();

  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    const columnsArray = new Array(columns).fill(" ");
    template.push(columnsArray);
  }

  return {
    data: template,
    setText: function (
      { row, column, vertical }: { row: number; column: number; vertical?: boolean },
      textdirty: string,
    ) {
      const text = textdirty.replace(/\x1B\[[0-9;]*[mK]/g, "");
      if (!this.data || this.data.length === 0) return;
      if (!(this.data.length > row && this.data[0].length > column)) return;

      if (!text) {
        throw new Error(`Text "${text}" is undefined.`);
      }

      if (text.length === 0) {
        throw new Error(`Text is ""`);
      }

      let position = 0;

      while (position < text.length) {
        const currentChar = text[position];
        if (vertical) {
          this.setChar({ row: row + position, column }, undefined, currentChar);
        } else {
          this.setChar({ row, column: column + position }, undefined, currentChar);
        }
        position++;
      }
    },
    setChar: function (
      { row, column }: { row: number; column: number },
      escapecode?: string,
      char?: string,
    ) {
      if (!this.data || this.data.length === 0) return;
      if (this.data.length > row && this.data[0].length > column) {
        if (char === undefined) {
          throw new Error(`Character "${char}" is undefined.`);
        }

        if (char.length !== 1) {
          throw new Error(`Character "${char}" is not length of one.`);
        }

        if (this.data[row]) {
          if (this.data[row][column]) {
            this.data[row][column] = escapecode ? escapecode + char : char;
            return;
          }
        }
      }
    },
  };
}

function display(screen: string[][]): void {
  const screenBuffer = screen.map((row) => row.join("")).join("\n");
  clear();
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[3J"));
  Deno.stdout.writeSync(new TextEncoder().encode(bgtextcode[0]));
  Deno.stdout.writeSync(new TextEncoder().encode(bgtextcode[1]));
  Deno.stdout.writeSync(new TextEncoder().encode(screenBuffer));
}

interface TerminalSize {
  columns: number;
  rows: number;
}

function getTerminalSize(): TerminalSize {
  const { columns, rows } = Deno.consoleSize();
  return { columns, rows };
}

function hideCursor(): void {
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));
}

async function run(): Promise<void> {
  setInterval(() => {
    const screenarray = screenBuffer || nextScreenBuffer 
    if (screenarray) {
      display(screenarray);
      screenBuffer = nextScreenBuffer;
    }
    runCycle();
  }, refreshRateMs);
}

function changeNextScreenBuffer(screen: string[][]): void {
  nextScreenBuffer = screen;
}

function runCycle(): void {
  if (getTerminalSize().rows <= 15) {
    console.clear();
    Deno.stdout.writeSync(new TextEncoder().encode("Please increase height of terminal"));
    nextScreenBuffer = undefined;
    return;
  } else {
    cycle(state, getScreen, getTerminalSize, changeNextScreenBuffer);
  }
}

function clear(): void {
  Deno.stdout.writeSync(new TextEncoder().encode("\u001b[H"));
}

function main(): void {
  clear();
  hideCursor();
  Deno.stdout.writeSync(new TextEncoder().encode("\u001b]0;Skibidi Moniter\u0007"));
  run();
}

main();
