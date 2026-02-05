const stepsFileInput = document.getElementById("stepsFile");
const prevBtn = document.getElementById("prevBtn");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const nextBtn = document.getElementById("nextBtn");
const liveBtn = document.getElementById("liveBtn");
const statusText = document.getElementById("statusText");
const mapSvg = document.getElementById("mapSvg");

const stepValue = document.getElementById("stepValue");
const timeValue = document.getElementById("timeValue");
const actionValue = document.getElementById("actionValue");
const stateValue = document.getElementById("stateValue");

let steps = [];
let currentIndex = 0;
let isPlaying = false;
let playTimer = null;
let isLive = false;
let pollTimer = null;
let seenLines = 0;
let nodePositions = {};
let roverElement = null;
let roverLabel = null;

function updateStatus(message) {
  statusText.textContent = message;
}

function render() {
  if (!steps.length) {
    stepValue.textContent = "-";
    timeValue.textContent = "-";
    actionValue.textContent = "-";
    stateValue.textContent = "-";
    updateStatus("No data loaded");
    return;
  }

  const step = steps[currentIndex];
  stepValue.textContent = step.step ?? "-";
  timeValue.textContent = step.time ?? "-";
  actionValue.textContent = step.action ?? "-";
  stateValue.textContent = step.state ?? "-";

  const target = getTargetFromAction(step.action);
  if (target && nodePositions[target] && roverElement && roverLabel) {
    const { x, y } = nodePositions[target];
    roverElement.setAttribute("cx", x);
    roverElement.setAttribute("cy", y - 26);
    roverLabel.setAttribute("x", x);
    roverLabel.setAttribute("y", y - 34);
  }

  const liveTag = isLive ? " • Live" : "";
  updateStatus(`Step ${currentIndex + 1} of ${steps.length}${liveTag}`);
}

function stopPlayback() {
  isPlaying = false;
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  playBtn.disabled = false;
  pauseBtn.disabled = true;
}

function stopLive() {
  isLive = false;
  liveBtn.textContent = "Live";
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function clearSvg() {
  while (mapSvg.firstChild) {
    mapSvg.removeChild(mapSvg.firstChild);
  }
}

function createSvgElement(tag) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

function collectNodesFromSteps(stepList) {
  const nodes = new Set();
  const pattern = /\b([sxo]\d+)\b/g;
  stepList.forEach((step) => {
    const text = `${step.state ?? ""} ${step.action ?? ""}`;
    let match = pattern.exec(text);
    while (match) {
      nodes.add(match[1]);
      match = pattern.exec(text);
    }
  });
  return Array.from(nodes);
}

function layoutNodes(nodes) {
  const groups = { s: [], x: [], o: [] };
  nodes.forEach((node) => {
    const prefix = node[0];
    if (groups[prefix]) groups[prefix].push(node);
  });
  Object.values(groups).forEach((list) => list.sort());

  const positions = {};
  const layoutRow = (list, y) => {
    if (!list.length) return;
    const spacing = 520 / Math.max(list.length - 1, 1);
    list.forEach((name, index) => {
      positions[name] = {
        x: 40 + spacing * index,
        y,
      };
    });
  };

  layoutRow(groups.s, 60);
  layoutRow(groups.x, 140);
  layoutRow(groups.o, 220);
  return positions;
}

function drawMap() {
  clearSvg();
  const nodes = collectNodesFromSteps(steps);
  nodePositions = layoutNodes(nodes);

  Object.entries(nodePositions).forEach(([name, pos]) => {
    const circle = createSvgElement("circle");
    circle.setAttribute("cx", pos.x);
    circle.setAttribute("cy", pos.y);
    circle.setAttribute("r", 16);
    circle.setAttribute("fill", "#1e293b");
    circle.setAttribute("stroke", "#475569");
    circle.setAttribute("stroke-width", "2");
    mapSvg.appendChild(circle);

    const label = createSvgElement("text");
    label.setAttribute("x", pos.x);
    label.setAttribute("y", pos.y + 5);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "#e2e8f0");
    label.setAttribute("font-size", "12");
    label.textContent = name;
    mapSvg.appendChild(label);
  });

  roverElement = createSvgElement("circle");
  roverElement.setAttribute("r", "10");
  roverElement.setAttribute("fill", "#38bdf8");
  roverElement.setAttribute("stroke", "#0ea5e9");
  roverElement.setAttribute("stroke-width", "2");
  mapSvg.appendChild(roverElement);

  roverLabel = createSvgElement("text");
  roverLabel.setAttribute("text-anchor", "middle");
  roverLabel.setAttribute("fill", "#38bdf8");
  roverLabel.setAttribute("font-size", "12");
  roverLabel.textContent = "r0";
  mapSvg.appendChild(roverLabel);

  const defaultTarget = nodes.find((node) => node.startsWith("s")) || nodes[0];
  if (defaultTarget && nodePositions[defaultTarget]) {
    const { x, y } = nodePositions[defaultTarget];
    roverElement.setAttribute("cx", x);
    roverElement.setAttribute("cy", y - 26);
    roverLabel.setAttribute("x", x);
    roverLabel.setAttribute("y", y - 34);
  }
}

function getTargetFromAction(action) {
  if (!action) return null;
  const match = action.match(/_(s\d+|x\d+|o\d+)/);
  return match ? match[1] : null;
}

async function pollSteps() {
  try {
    const response = await fetch(`./steps.jsonl?ts=${Date.now()}`);
    if (!response.ok) {
      updateStatus("Live: waiting for steps.jsonl");
      return;
    }
    const text = await response.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length <= seenLines) return;

    for (let i = seenLines; i < lines.length; i += 1) {
      try {
        const entry = JSON.parse(lines[i]);
        steps.push(entry);
      } catch (error) {
        // ignore partial JSON lines while the file is being written
      }
    }

    seenLines = lines.length;
    if (!isPlaying) {
      currentIndex = Math.max(steps.length - 1, 0);
    }
    drawMap();
    render();
  } catch (error) {
    updateStatus("Live: unable to fetch steps.jsonl");
  }
}

function startLive() {
  stopPlayback();
  isLive = true;
  liveBtn.textContent = "Stop Live";
  pollSteps();
  pollTimer = setInterval(pollSteps, 600);
}

function startPlayback() {
  if (!steps.length) return;
  isPlaying = true;
  playBtn.disabled = true;
  pauseBtn.disabled = false;
  playTimer = setInterval(() => {
    if (currentIndex < steps.length - 1) {
      currentIndex += 1;
      render();
    } else {
      stopPlayback();
    }
  }, 600);
}

function move(delta) {
  if (!steps.length) return;
  currentIndex = Math.min(
    Math.max(currentIndex + delta, 0),
    steps.length - 1
  );
  render();
}

function parseText(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  return trimmed
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function loadFile(file) {
  stopLive();
  const text = await file.text();
  steps = parseText(text);
  seenLines = steps.length;
  currentIndex = 0;
  drawMap();
  render();
}

stepsFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  stopPlayback();
  loadFile(file);
});

prevBtn.addEventListener("click", () => move(-1));
nextBtn.addEventListener("click", () => move(1));
playBtn.addEventListener("click", startPlayback);
pauseBtn.addEventListener("click", stopPlayback);
liveBtn.addEventListener("click", () => {
  if (isLive) {
    stopLive();
    render();
  } else {
    steps = [];
    currentIndex = 0;
    seenLines = 0;
    drawMap();
    startLive();
  }
});

render();
