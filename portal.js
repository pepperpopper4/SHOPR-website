(function () {
  const SESSION_KEY = "shopr-portal-user";
  const DEMO_EMAIL = "owner@northside.shop";
  const DEMO_PASSWORD = "fleet";

  const WALL = [
    [70, 110],
    [1000, 110],
    [1000, 340],
    [860, 340],
    [860, 690],
    [200, 690],
    [70, 560],
  ];

  const AISLE_YS = [212, 336, 456, 580];
  const LEFT_X = 178;
  const RIGHT_X = 760;
  const DOOR_Y = 258;
  const STOCK_WALL_X = 860;
  const CHECKOUT_X = 480;
  const COUNTERS = [
    { x: 400, y: 616, w: 160, h: 42 },
    { x: 600, y: 616, w: 160, h: 42 },
  ];
  const CHARGE_PAD = { x: 900, y: 233, w: 70, h: 50 };
  const DECOR = [{ x: 530, y: 494, w: 190, h: 45, label: "HOT FOOD" }];

  const ACTION_COLORS = {
    picking: "#e0a14a",
    moving: "#6b9fd4",
    charging: "#3dbe8c",
    stocking: "#c084e0",
  };

  const ACTION_LABELS = {
    picking: "Picking",
    moving: "Moving",
    charging: "Charging",
    stocking: "Stocking",
  };

  function item(id, name, short, aliases) {
    return { id, name, short: short || name, aliases: aliases || [] };
  }

  const SHELVES = [
    {
      id: "coolers",
      label: "COOLERS",
      x: 230, y: 130, w: 530, h: 50,
      aisleY: 212,
      slots: [
        item("milk", "Milk"),
        item("oj", "Orange juice", "OJ", ["oj", "juice"]),
        item("energy", "Energy drink", "Energy", ["energy"]),
        item("water", "Water"),
        item("iced-tea", "Iced tea", "Tea", ["tea"]),
        item("yogurt", "Yogurt"),
      ],
    },
    {
      id: "snacks",
      label: "SNACKS",
      x: 230, y: 254, w: 490, h: 45,
      aisleY: 212,
      slots: [
        item("chips", "Chips"),
        item("candy", "Candy"),
        item("cookies", "Cookies"),
        item("crackers", "Crackers"),
        item("nuts", "Nuts"),
        item("bars", "Granola bars", "Bars", ["granola", "bars"]),
      ],
    },
    {
      id: "grocery",
      label: "GROCERY",
      x: 230, y: 374, w: 490, h: 45,
      aisleY: 336,
      slots: [
        item("soup", "Soup"),
        item("pasta", "Pasta"),
        item("sauce", "Pasta sauce", "Sauce", ["sauce"]),
        item("rice", "Rice"),
        item("beans", "Canned beans", "Beans", ["beans"]),
        item("tuna", "Tuna"),
      ],
    },
    {
      id: "bakery",
      label: "BAKERY",
      x: 230, y: 494, w: 250, h: 45,
      aisleY: 456,
      slots: [
        item("bread", "Bread"),
        item("bagels", "Bagels"),
        item("tortillas", "Tortillas", "Wraps", ["wraps"]),
      ],
    },
    {
      id: "produce",
      label: "PRODUCE",
      x: 78, y: 240, w: 50, h: 280,
      vertical: true,
      approachX: LEFT_X,
      slots: [
        item("bananas", "Bananas", "Banana"),
        item("apples", "Apples", "Apple"),
        item("oranges", "Oranges", "Orange"),
        item("avocados", "Avocados", "Avo", ["avocado"]),
      ],
    },
    {
      id: "freezer",
      label: "FREEZER",
      x: 805, y: 390, w: 50, h: 210,
      vertical: true,
      approachX: RIGHT_X,
      slots: [
        item("ice-cream", "Ice cream", "Cream", ["icecream"]),
        item("pizza", "Frozen pizza", "Pizza", ["pizza"]),
        item("meals", "Frozen meals", "Meals", ["meals"]),
        item("ice", "Ice"),
      ],
    },
  ];

  let NODES = {};
  let GRAPH = {};
  let BLOCKS = [];

  const loginView = document.getElementById("login-view");
  const appView = document.getElementById("app-view");
  const loginForm = document.getElementById("login-form");
  const loginEmail = document.getElementById("login-email");
  const loginPassword = document.getElementById("login-password");
  const loginError = document.getElementById("login-error");
  const floorSvg = document.getElementById("floor");
  const robotList = document.getElementById("robot-list");
  const cartForm = document.getElementById("cart-form");
  const cartInput = document.getElementById("cart-input");
  const cartMessage = document.getElementById("cart-message");
  const cartList = document.getElementById("cart-list");
  const suggestions = document.getElementById("suggestions");
  const slotReadout = document.getElementById("slot-readout");
  const mapTip = document.getElementById("map-tip");
  const storeNameEl = document.getElementById("store-name");
  const floorTitle = document.getElementById("floor-title");
  const signedInAs = document.getElementById("signed-in-as");
  const cameraDialog = document.getElementById("camera-dialog");
  const teleopDialog = document.getElementById("teleop-dialog");

  let robots = [];
  let cart = [];
  let cartSeq = 1;
  let selectedId = "r1";
  let cameraRobot = null;
  let manualRobot = null;
  let raf = 0;
  let lastTick = 0;
  let lastUi = 0;
  const held = new Set();

  function norm(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  }

  function allSlots() {
    return SHELVES.flatMap((shelf) => shelf.slots);
  }

  function getSlot(id) {
    return allSlots().find((slot) => slot.id === id) || null;
  }

  function getCart(id) {
    return cart.find((entry) => entry.id === id) || null;
  }

  function stockTone(slot) {
    const ratio = slot.stock / slot.capacity;
    if (ratio >= 0.67) return "ok";
    if (ratio >= 0.34) return "low";
    return "critical";
  }

  function stockLabel(slot) {
    const tone = stockTone(slot);
    if (tone === "ok") return "In stock";
    if (tone === "low") return "Low";
    return "Critical";
  }

  function layoutShelves() {
    SHELVES.forEach((shelf) => {
      const count = shelf.slots.length;
      const pad = 7;
      const gap = 5;
      shelf.slots.forEach((slot, index) => {
        slot.shelfId = shelf.id;
        slot.capacity = 12;
        if (shelf.vertical) {
          const slotH = (shelf.h - pad * 2 - gap * (count - 1)) / count;
          slot.ox = pad;
          slot.oy = pad + index * (slotH + gap);
          slot.w = shelf.w - pad * 2;
          slot.h = slotH;
        } else {
          const slotW = (shelf.w - pad * 2 - gap * (count - 1)) / count;
          slot.ox = pad + index * (slotW + gap);
          slot.oy = pad;
          slot.w = slotW;
          slot.h = shelf.h - pad * 2;
        }
      });
    });
  }

  function randomizeStock() {
    allSlots().forEach((slot) => {
      slot.stock = Math.floor(Math.random() * (slot.capacity + 1));
    });
  }

  function inside(x, y) {
    let hit = false;
    for (let i = 0, j = WALL.length - 1; i < WALL.length; j = i++) {
      const xi = WALL[i][0];
      const yi = WALL[i][1];
      const xj = WALL[j][0];
      const yj = WALL[j][1];
      const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) hit = !hit;
    }
    return hit;
  }

  function buildBlocks() {
    BLOCKS = SHELVES.map((shelf) => ({ x: shelf.x, y: shelf.y, w: shelf.w, h: shelf.h }));
    COUNTERS.forEach((counter) => BLOCKS.push(counter));
    DECOR.forEach((fixture) => BLOCKS.push(fixture));
    BLOCKS.push({ x: STOCK_WALL_X - 6, y: 110, w: 12, h: DOOR_Y - 138 });
    BLOCKS.push({ x: STOCK_WALL_X - 6, y: DOOR_Y + 28, w: 12, h: 340 - DOOR_Y - 28 });
  }

  function clear(x, y) {
    const body = 14;
    const onFloor = inside(x, y)
      && inside(x - body, y) && inside(x + body, y)
      && inside(x, y - body) && inside(x, y + body);
    if (!onFloor) return false;
    const pad = 11;
    return !BLOCKS.some((block) => {
      return x > block.x - pad && x < block.x + block.w + pad
        && y > block.y - pad && y < block.y + block.h + pad;
    });
  }

  function slotApproach(slot) {
    const shelf = SHELVES.find((entry) => entry.id === slot.shelfId);
    if (shelf.vertical) {
      return { x: shelf.approachX, y: shelf.y + slot.oy + slot.h / 2 };
    }
    return { x: shelf.x + slot.ox + slot.w / 2, y: shelf.aisleY };
  }

  // Aisles only connect at the two end corridors, so routes never cross a gondola.
  function buildGraph() {
    NODES = {};
    GRAPH = {};

    const add = (key, x, y) => {
      NODES[key] = { x, y };
      if (!GRAPH[key]) GRAPH[key] = [];
      return key;
    };
    const link = (a, b) => {
      if (a === b) return;
      GRAPH[a].push(b);
      GRAPH[b].push(a);
    };
    const chain = (keys) => {
      for (let i = 1; i < keys.length; i += 1) link(keys[i - 1], keys[i]);
    };

    AISLE_YS.forEach((y, index) => {
      add("aisleL" + index, LEFT_X, y);
      add("aisleR" + index, RIGHT_X, y);
      const stops = [];
      SHELVES.forEach((shelf) => {
        if (shelf.vertical || shelf.aisleY !== y) return;
        shelf.slots.forEach((slot) => {
          const point = slotApproach(slot);
          slot.node = add("slot-" + slot.id, point.x, point.y);
          stops.push({ key: slot.node, at: point.x });
        });
      });
      if (index === AISLE_YS.length - 1) {
        stops.push({ key: add("front", CHECKOUT_X, y), at: CHECKOUT_X });
      }
      stops.sort((a, b) => a.at - b.at);
      chain(["aisleL" + index].concat(stops.map((stop) => stop.key), ["aisleR" + index]));
    });

    const buildSide = (x, prefix, extras) => {
      const stops = AISLE_YS.map((y, index) => ({ key: prefix + index, at: y }));
      SHELVES.forEach((shelf) => {
        if (!shelf.vertical || shelf.approachX !== x) return;
        shelf.slots.forEach((slot) => {
          const point = slotApproach(slot);
          slot.node = add("slot-" + slot.id, point.x, point.y);
          stops.push({ key: slot.node, at: point.y });
        });
      });
      extras.forEach((extra) => stops.push(extra));
      stops.sort((a, b) => a.at - b.at);
      chain(stops.map((stop) => stop.key));
    };

    buildSide(LEFT_X, "aisleL", [{ key: add("entrance", LEFT_X, 625), at: 625 }]);
    buildSide(RIGHT_X, "aisleR", [{ key: add("gate", RIGHT_X, DOOR_Y), at: DOOR_Y }]);

    add("doorway", STOCK_WALL_X, DOOR_Y);
    add("dock", CHARGE_PAD.x + CHARGE_PAD.w / 2, DOOR_Y);
    link("gate", "doorway");
    link("doorway", "dock");

    add("checkout", CHECKOUT_X, COUNTERS[0].y - 18);
    link("front", "checkout");
  }

  function nearestNodeKey(x, y) {
    let best = "entrance";
    let bestDist = Infinity;
    Object.entries(NODES).forEach(([key, node]) => {
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist < bestDist) {
        best = key;
        bestDist = dist;
      }
    });
    return best;
  }

  function route(start, goal) {
    if (start === goal) return [start];
    const cost = { [start]: 0 };
    const prev = {};
    const settled = new Set();
    for (;;) {
      let current = null;
      let bestCost = Infinity;
      Object.keys(cost).forEach((key) => {
        if (!settled.has(key) && cost[key] < bestCost) {
          bestCost = cost[key];
          current = key;
        }
      });
      if (!current) return [start];
      if (current === goal) break;
      settled.add(current);
      GRAPH[current].forEach((next) => {
        const step = Math.hypot(NODES[next].x - NODES[current].x, NODES[next].y - NODES[current].y);
        if (cost[next] === undefined || cost[current] + step < cost[next]) {
          cost[next] = cost[current] + step;
          prev[next] = current;
        }
      });
    }
    const path = [goal];
    let cursor = prev[goal];
    while (cursor) {
      path.push(cursor);
      cursor = prev[cursor];
    }
    return path.reverse();
  }

  function buildPath(startKey, endKey, x, y) {
    const keys = route(startKey, endKey);
    const points = keys.map((key) => ({ x: NODES[key].x, y: NODES[key].y, key }));
    while (points.length && Math.hypot(points[0].x - x, points[0].y - y) < 10) points.shift();
    return points;
  }

  function pathToSlot(robot, slot) {
    return buildPath(nearestNodeKey(robot.x, robot.y), slot.node, robot.x, robot.y);
  }

  function pathToCheckout(robot) {
    return buildPath(nearestNodeKey(robot.x, robot.y), "checkout", robot.x, robot.y);
  }

  function deriveAction(robot) {
    if (robot.manual) return nearDock(robot) ? "charging" : "moving";
    if (robot.busy) return robot.busy;
    return "moving";
  }

  function nearDock(robot) {
    return Math.hypot(robot.x - NODES.dock.x, robot.y - NODES.dock.y) < 34;
  }

  function taskLine(robot) {
    if (robot.manual) return "Operator has control";
    if (robot.cartId) {
      const entry = getCart(robot.cartId);
      if (entry && entry.status === "picking") return "Picking " + entry.name;
      if (entry && entry.status === "returning") return "Taking " + entry.name + " to checkout";
      if (entry && entry.status === "enroute") return "Heading to " + entry.name;
    }
    const action = deriveAction(robot);
    if (action === "charging") return "Docked and charging";
    if (action === "stocking") {
      const slot = getSlot(robot.focusId);
      return slot ? "Restocking " + slot.name : "Restocking";
    }
    if (action === "picking") {
      const slot = getSlot(robot.focusId);
      return slot ? "Picking " + slot.name : "Picking";
    }
    if (robot.phase === "to-dock") return "Returning to the charger";
    if (robot.phase === "to-stock") {
      const slot = getSlot(robot.focusId);
      return slot ? "Heading to restock " + slot.name : "Heading to a shelf";
    }
    return "Patrolling the floor";
  }

  function createRobots() {
    const chips = getSlot("chips");
    const soup = getSlot("soup");
    const chipPoint = slotApproach(chips);
    const soupPoint = slotApproach(soup);
    return [
      {
        id: "r1", name: "SHOPR-01", color: "#7eb0e0",
        x: NODES.entrance.x, y: NODES.entrance.y, heading: -Math.PI / 2,
        battery: 86, speed: 108, busy: null, phase: null,
        path: buildPath("entrance", "slot-cookies", NODES.entrance.x, NODES.entrance.y),
        dwell: 0, cartId: null, focusId: null, manual: false,
      },
      {
        id: "r2", name: "SHOPR-02", color: "#e0a14a",
        x: chipPoint.x, y: chipPoint.y, heading: -Math.PI / 2,
        battery: 73, speed: 102, busy: "picking", phase: "ambient", path: [],
        dwell: 8, cartId: null, focusId: "chips", manual: false,
      },
      {
        id: "r3", name: "SHOPR-03", color: "#5dcaa0",
        x: soupPoint.x, y: soupPoint.y, heading: Math.PI / 2,
        battery: 64, speed: 98, busy: "stocking", phase: "stock", path: [],
        dwell: 9, cartId: null, focusId: "soup", manual: false,
      },
      {
        id: "r4", name: "SHOPR-04", color: "#e08ab0",
        x: NODES.dock.x, y: NODES.dock.y, heading: Math.PI,
        battery: 24, speed: 100, busy: "charging", phase: "charging", path: [],
        dwell: 0, cartId: null, focusId: null, manual: false,
      },
    ];
  }

  function ns(name) {
    return document.createElementNS("http://www.w3.org/2000/svg", name);
  }

  function drawFloor() {
    floorSvg.innerHTML = "";
    const defs = ns("defs");
    const pattern = ns("pattern");
    pattern.setAttribute("id", "floor-grid");
    pattern.setAttribute("width", "28");
    pattern.setAttribute("height", "28");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    const base = ns("rect");
    base.setAttribute("width", "28");
    base.setAttribute("height", "28");
    base.setAttribute("fill", "#15202c");
    const gridLine = ns("path");
    gridLine.setAttribute("d", "M 28 0 L 0 0 0 28");
    gridLine.setAttribute("fill", "none");
    gridLine.setAttribute("stroke", "rgba(143,163,188,0.13)");
    gridLine.setAttribute("stroke-width", "1");
    pattern.append(base, gridLine);
    defs.append(pattern);
    floorSvg.append(defs);

    const points = WALL.map((pair) => pair.join(",")).join(" ");
    const curb = ns("polygon");
    curb.setAttribute("points", points);
    curb.setAttribute("fill", "#15202c");
    curb.setAttribute("stroke", "#0c1218");
    curb.setAttribute("stroke-width", "26");
    curb.setAttribute("stroke-linejoin", "miter");
    const floor = ns("polygon");
    floor.setAttribute("points", points);
    floor.setAttribute("fill", "url(#floor-grid)");
    floor.setAttribute("stroke", "#8fb4dc");
    floor.setAttribute("stroke-width", "4");
    floor.setAttribute("stroke-linejoin", "miter");
    floorSvg.append(curb, floor);

    const doorA = lerpPoint(WALL[5], WALL[6], 0.3);
    const doorB = lerpPoint(WALL[5], WALL[6], 0.72);
    const door = ns("line");
    door.setAttribute("x1", doorA[0]);
    door.setAttribute("y1", doorA[1]);
    door.setAttribute("x2", doorB[0]);
    door.setAttribute("y2", doorB[1]);
    door.setAttribute("stroke", "#15202c");
    door.setAttribute("stroke-width", "8");
    door.setAttribute("stroke-linecap", "butt");
    floorSvg.append(door);

    drawWall(STOCK_WALL_X, 110, STOCK_WALL_X, DOOR_Y - 28);
    drawWall(STOCK_WALL_X, DOOR_Y + 28, STOCK_WALL_X, 340);

    COUNTERS.forEach((counter) => {
      const rect = ns("rect");
      rect.setAttribute("x", counter.x);
      rect.setAttribute("y", counter.y);
      rect.setAttribute("width", counter.w);
      rect.setAttribute("height", counter.h);
      rect.setAttribute("rx", "5");
      rect.setAttribute("fill", "#1b2c3d");
      rect.setAttribute("stroke", "#3d5a7a");
      floorSvg.append(rect);
    });
    addLabel("CHECKOUT", COUNTERS[1].x + COUNTERS[1].w / 2, COUNTERS[1].y + 26, true);
    addLabel("ENTRANCE", 312, 672, true);

    DECOR.forEach((fixture) => {
      const rect = ns("rect");
      rect.setAttribute("x", fixture.x);
      rect.setAttribute("y", fixture.y);
      rect.setAttribute("width", fixture.w);
      rect.setAttribute("height", fixture.h);
      rect.setAttribute("rx", "5");
      rect.setAttribute("fill", "#1a2836");
      rect.setAttribute("stroke", "#31485f");
      floorSvg.append(rect);
      addLabel(fixture.label, fixture.x + fixture.w / 2, fixture.y - 8, true);
    });

    const pad = ns("rect");
    pad.setAttribute("x", CHARGE_PAD.x);
    pad.setAttribute("y", CHARGE_PAD.y);
    pad.setAttribute("width", CHARGE_PAD.w);
    pad.setAttribute("height", CHARGE_PAD.h);
    pad.setAttribute("rx", "8");
    pad.setAttribute("fill", "#123028");
    pad.setAttribute("stroke", "#3dbe8c");
    floorSvg.append(pad);
    addLabel("STOCK ROOM", 930, 170, true);

    const drawn = new Set();
    Object.keys(GRAPH).forEach((from) => {
      GRAPH[from].forEach((to) => {
        const pairKey = from < to ? from + "|" + to : to + "|" + from;
        if (drawn.has(pairKey)) return;
        drawn.add(pairKey);
        const line = ns("line");
        line.setAttribute("x1", NODES[from].x);
        line.setAttribute("y1", NODES[from].y);
        line.setAttribute("x2", NODES[to].x);
        line.setAttribute("y2", NODES[to].y);
        line.setAttribute("stroke", "rgba(143,163,188,0.08)");
        line.setAttribute("stroke-width", "10");
        line.setAttribute("stroke-linecap", "round");
        floorSvg.append(line);
      });
    });

    const routes = ns("g");
    routes.setAttribute("id", "routes");
    floorSvg.append(routes);

    SHELVES.forEach(drawShelf);

    const robotLayer = ns("g");
    robotLayer.setAttribute("id", "robots");
    robots.forEach((robot) => {
      const group = ns("g");
      group.setAttribute("class", "robot");
      group.setAttribute("data-id", robot.id);
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      group.setAttribute("aria-label", robot.name);
      const ring = ns("circle");
      ring.setAttribute("class", "robot-ring");
      ring.setAttribute("r", "17");
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke-width", "2");
      const body = ns("circle");
      body.setAttribute("class", "robot-body");
      body.setAttribute("r", "13");
      body.setAttribute("fill", robot.color);
      const heading = ns("line");
      heading.setAttribute("class", "robot-heading");
      heading.setAttribute("x1", "0");
      heading.setAttribute("y1", "0");
      heading.setAttribute("x2", "18");
      heading.setAttribute("y2", "0");
      heading.setAttribute("stroke", "#f4f7fb");
      heading.setAttribute("stroke-width", "2");
      heading.setAttribute("stroke-linecap", "round");
      const num = ns("text");
      num.setAttribute("class", "robot-num");
      num.textContent = robot.name.slice(-1);
      const pill = ns("g");
      pill.setAttribute("class", "robot-pill");
      const pillRect = ns("rect");
      pillRect.setAttribute("width", "74");
      pillRect.setAttribute("height", "18");
      pillRect.setAttribute("rx", "9");
      const pillText = ns("text");
      pillText.setAttribute("x", "37");
      pillText.setAttribute("y", "13");
      pill.append(pillRect, pillText);
      group.append(ring, body, heading, num, pill);
      group.addEventListener("click", () => selectRobot(robot.id));
      group.addEventListener("dblclick", () => openCamera(robot.id));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRobot(robot.id);
        }
      });
      robotLayer.append(group);
    });
    floorSvg.append(robotLayer);
  }

  function lerpPoint(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function drawWall(x1, y1, x2, y2) {
    const line = ns("line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "#8fb4dc");
    line.setAttribute("stroke-width", "4");
    line.setAttribute("stroke-linecap", "round");
    floorSvg.append(line);
  }

  function addLabel(text, x, y, center) {
    const node = ns("text");
    node.setAttribute("class", "zone-label");
    node.setAttribute("x", x);
    node.setAttribute("y", y);
    if (center) node.setAttribute("text-anchor", "middle");
    node.textContent = text;
    floorSvg.append(node);
  }

  function drawShelf(shelf) {
    const rect = ns("rect");
    rect.setAttribute("x", shelf.x);
    rect.setAttribute("y", shelf.y);
    rect.setAttribute("width", shelf.w);
    rect.setAttribute("height", shelf.h);
    rect.setAttribute("rx", "6");
    rect.setAttribute("fill", "#1a2836");
    rect.setAttribute("stroke", "#31485f");
    floorSvg.append(rect);
    const label = ns("text");
    label.setAttribute("class", "zone-label");
    label.setAttribute("x", shelf.x + shelf.w / 2);
    label.setAttribute("y", shelf.y - 8);
    label.setAttribute("text-anchor", "middle");
    label.textContent = shelf.label;
    floorSvg.append(label);

    shelf.slots.forEach((slot) => {
      const group = ns("g");
      group.setAttribute("class", "slot");
      group.setAttribute("data-id", slot.id);
      group.setAttribute("transform", "translate(" + (shelf.x + slot.ox) + " " + (shelf.y + slot.oy) + ")");
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      const hit = ns("rect");
      hit.setAttribute("class", "slot-hit");
      hit.setAttribute("width", slot.w);
      hit.setAttribute("height", slot.h);
      hit.setAttribute("rx", "4");
      hit.setAttribute("fill", "transparent");
      const pip = ns("rect");
      pip.setAttribute("class", "pip");
      pip.setAttribute("width", slot.w);
      pip.setAttribute("height", shelf.vertical ? Math.min(16, slot.h - 4) : 14);
      pip.setAttribute("rx", "3");
      const count = ns("text");
      count.setAttribute("class", "pip-count");
      count.setAttribute("x", slot.w / 2);
      count.setAttribute("y", shelf.vertical ? 12 : 11);
      const title = ns("title");
      title.textContent = slot.name;
      group.setAttribute("aria-label", slot.name);
      group.append(hit, pip, count, title);
      const name = ns("text");
      name.setAttribute("class", "slot-name");
      name.setAttribute("x", "1");
      name.setAttribute("y", shelf.vertical ? "26" : "28");
      if (shelf.vertical) name.setAttribute("font-size", "8");
      name.textContent = slot.short;
      group.append(name);
      group.addEventListener("pointerenter", (event) => showTip(event, slot));
      group.addEventListener("pointermove", moveTip);
      group.addEventListener("pointerleave", hideTip);
      group.addEventListener("click", () => selectSlot(slot));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectSlot(slot);
        }
      });
      floorSvg.append(group);
    });
  }

  function paintSlots() {
    const hot = new Set();
    robots.forEach((robot) => {
      if (robot.cartId) {
        const entry = getCart(robot.cartId);
        if (entry && entry.status !== "delivered" && entry.status !== "cancelled") hot.add(entry.itemId);
      } else if (robot.focusId && (robot.busy === "stocking" || robot.busy === "picking" || robot.phase === "to-stock")) {
        hot.add(robot.focusId);
      }
    });
    allSlots().forEach((slot) => {
      const group = floorSvg.querySelector('.slot[data-id="' + slot.id + '"]');
      if (!group) return;
      const tone = stockTone(slot);
      const pip = group.querySelector(".pip");
      pip.setAttribute("class", "pip pip--" + tone);
      const count = group.querySelector(".pip-count");
      count.textContent = String(slot.stock);
      count.setAttribute("fill", tone === "critical" ? "#fff" : "#102018");
      group.classList.toggle("is-hot", hot.has(slot.id));
    });
  }

  function showTip(event, slot) {
    mapTip.hidden = false;
    mapTip.textContent = slot.name + " · " + slot.stock + "/" + slot.capacity + " · " + stockLabel(slot);
    moveTip(event);
  }

  function moveTip(event) {
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + 200 > window.innerWidth) x = event.clientX - 180;
    if (y + 40 > window.innerHeight) y = event.clientY - 36;
    mapTip.style.left = x + "px";
    mapTip.style.top = y + "px";
  }

  function hideTip() {
    mapTip.hidden = true;
  }

  function selectSlot(slot) {
    floorSvg.querySelectorAll(".slot").forEach((node) => {
      node.classList.toggle("is-selected", node.getAttribute("data-id") === slot.id);
    });
    slotReadout.textContent = slot.name + " · " + slot.stock + " of " + slot.capacity + " · " + stockLabel(slot);
  }

  function renderFleet() {
    robotList.innerHTML = "";
    robots.forEach((robot) => {
      const card = document.createElement("article");
      card.className = "robot-card";
      card.dataset.id = robot.id;
      card.innerHTML =
        '<header><span class="robot-id"><i class="robot-swatch"></i><span class="robot-name"></span></span><span class="action"></span></header>' +
        '<p class="robot-task"></p>' +
        '<div class="battery"><div class="battery-top"><span>Battery</span><span class="battery-pct"></span></div><div class="battery-track"><div class="battery-fill"></div></div></div>' +
        '<div class="robot-buttons"><button type="button" class="btn btn-ghost btn-sm" data-camera>Camera</button><button type="button" class="btn btn-ghost btn-sm" data-teleop>Teleop</button></div>';
      card.querySelector(".robot-swatch").style.background = robot.color;
      card.querySelector(".robot-name").textContent = robot.name;
      card.querySelector("[data-camera]").addEventListener("click", () => openCamera(robot.id));
      card.querySelector("[data-teleop]").addEventListener("click", () => openTeleop(robot.id));
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        selectRobot(robot.id);
      });
      robotList.append(card);
    });
    syncFleet();
  }

  function syncFleet() {
    robots.forEach((robot) => {
      const card = robotList.querySelector('[data-id="' + robot.id + '"]');
      if (!card) return;
      const action = deriveAction(robot);
      const badge = card.querySelector(".action");
      badge.textContent = ACTION_LABELS[action];
      badge.className = "action action--" + action;
      card.classList.toggle("is-selected", robot.id === selectedId);
      const task = card.querySelector(".robot-task");
      task.textContent = taskLine(robot);
      if (robot.manual) {
        const flag = document.createElement("span");
        flag.className = "manual-flag";
        flag.textContent = "Manual";
        task.append(flag);
      }
      const pct = Math.round(robot.battery);
      card.querySelector(".battery-pct").textContent = pct + "%";
      const fill = card.querySelector(".battery-fill");
      fill.style.width = pct + "%";
      fill.classList.toggle("is-low", pct < 40 && pct >= 18);
      fill.classList.toggle("is-critical", pct < 18);
    });
    paintSlots();
    syncCamera();
    syncTeleop();
  }

  function syncMap() {
    robots.forEach((robot) => {
      const group = floorSvg.querySelector('.robot[data-id="' + robot.id + '"]');
      if (!group) return;
      group.setAttribute("transform", "translate(" + robot.x.toFixed(1) + " " + robot.y.toFixed(1) + ")");
      group.classList.toggle("is-selected", robot.id === selectedId);
      const action = deriveAction(robot);
      const ring = group.querySelector(".robot-ring");
      ring.setAttribute("stroke", ACTION_COLORS[action]);
      ring.setAttribute("class", "robot-ring is-" + action);
      const heading = group.querySelector(".robot-heading");
      heading.setAttribute("transform", "rotate(" + (robot.heading * 180 / Math.PI) + ")");
      const pill = group.querySelector(".robot-pill");
      const pillAbove = robot.y > 200;
      const pillX = robot.x > 880 ? -86 : 16;
      pill.setAttribute("transform", "translate(" + pillX + " " + (pillAbove ? -34 : 16) + ")");
      const pillRect = pill.querySelector("rect");
      pillRect.setAttribute("stroke", ACTION_COLORS[action]);
      pill.querySelector("text").textContent = ACTION_LABELS[action];

      let route = floorSvg.querySelector('#routes [data-id="' + robot.id + '"]');
      if (!route) {
        route = ns("polyline");
        route.setAttribute("data-id", robot.id);
        route.setAttribute("fill", "none");
        route.setAttribute("stroke-width", "2.5");
        route.setAttribute("stroke-dasharray", "6 6");
        route.setAttribute("stroke-linecap", "round");
        floorSvg.querySelector("#routes").append(route);
      }
      if (robot.path.length && !robot.manual) {
        const pts = [{ x: robot.x, y: robot.y }].concat(robot.path);
        route.setAttribute("points", pts.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" "));
        route.setAttribute("stroke", robot.color);
        route.setAttribute("opacity", "0.9");
      } else {
        route.setAttribute("points", "");
      }
    });
  }

  function selectRobot(id) {
    selectedId = id;
    const card = robotList.querySelector('[data-id="' + id + '"]');
    if (card) card.scrollIntoView({ block: "nearest" });
    syncFleet();
  }

  function findItem(raw) {
    const query = norm(raw);
    if (!query) return { error: "empty" };
    const slots = allSlots();
    const matches = (slot, test) => test(norm(slot.name)) || test(norm(slot.short)) || slot.aliases.some((alias) => test(norm(alias)));
    const exact = slots.filter((slot) => matches(slot, (value) => value === query));
    if (exact.length === 1) return { item: exact[0] };
    if (exact.length > 1) return { error: "ambiguous", options: exact };
    const starts = slots.filter((slot) => matches(slot, (value) => value.startsWith(query)));
    if (starts.length === 1) return { item: starts[0] };
    if (starts.length > 1) return { error: "ambiguous", options: starts };
    const partial = slots.filter((slot) => matches(slot, (value) => value.includes(query)));
    if (partial.length === 1) return { item: partial[0] };
    if (partial.length > 1) return { error: "ambiguous", options: partial };
    return { error: "missing" };
  }

  function eligible(robot) {
    if (robot.manual || robot.cartId) return false;
    if (robot.phase === "charging" && robot.battery < 50) return false;
    if (robot.phase === "to-dock" && robot.battery < 20) return false;
    return true;
  }

  function chooseRobot(slot) {
    const approach = slotApproach(slot);
    const ready = robots.filter(eligible);
    ready.sort((a, b) => {
      const busyA = a.busy ? 1 : 0;
      const busyB = b.busy ? 1 : 0;
      if (busyA !== busyB) return busyA - busyB;
      return Math.hypot(a.x - approach.x, a.y - approach.y) - Math.hypot(b.x - approach.x, b.y - approach.y);
    });
    return ready[0] || null;
  }

  function assignRobot(robot, entry) {
    robot.dwell = 0;
    robot.busy = null;
    robot.focusId = entry.itemId;
    robot.cartId = entry.id;
    robot.phase = "to-item";
    entry.robotId = robot.id;
    entry.status = "enroute";
    const slot = getSlot(entry.itemId);
    robot.path = pathToSlot(robot, slot);
    if (!robot.path.length) arrive(robot);
  }

  function tryDispatch(robot) {
    const waiting = cart.find((entry) => entry.status === "queued");
    if (!waiting) return false;
    const target = robot && eligible(robot) ? robot : chooseRobot(getSlot(waiting.itemId));
    if (!target) return false;
    assignRobot(target, waiting);
    return true;
  }

  function onRobotFreed(robot) {
    if (tryDispatch(robot)) return;
    if (robot.battery < 18) {
      goDock(robot);
      return;
    }
    startPatrol(robot);
  }

  function startPatrol(robot) {
    const keys = Object.keys(NODES).filter((key) => key !== "dock" && key !== "doorway");
    const start = nearestNodeKey(robot.x, robot.y);
    let dest = keys[Math.floor(Math.random() * keys.length)];
    if (dest === start) dest = keys[(keys.indexOf(dest) + 3) % keys.length];
    robot.cartId = null;
    robot.focusId = null;
    robot.busy = null;
    robot.phase = null;
    robot.dwell = 0;
    robot.path = buildPath(start, dest, robot.x, robot.y);
  }

  function goDock(robot) {
    if (robot.cartId) {
      const entry = getCart(robot.cartId);
      if (entry && entry.status !== "delivered") {
        entry.status = "queued";
        entry.robotId = null;
      }
      robot.cartId = null;
    }
    robot.busy = null;
    robot.focusId = null;
    robot.phase = "to-dock";
    robot.dwell = 0;
    robot.path = buildPath(nearestNodeKey(robot.x, robot.y), "dock", robot.x, robot.y);
    if (!robot.path.length) arrive(robot);
  }

  function tryStock(robot) {
    const low = allSlots().filter((slot) => slot.stock <= 4);
    if (!low.length) {
      startPatrol(robot);
      return;
    }
    const slot = low[Math.floor(Math.random() * low.length)];
    robot.focusId = slot.id;
    robot.phase = "to-stock";
    robot.busy = null;
    robot.dwell = 0;
    robot.path = pathToSlot(robot, slot);
  }

  function arrive(robot) {
    if (robot.cartId && robot.phase === "to-item") {
      robot.busy = "picking";
      robot.phase = "pick";
      robot.dwell = 2.3;
      const entry = getCart(robot.cartId);
      if (entry) entry.status = "picking";
      return;
    }
    if (robot.cartId && robot.phase === "return") {
      const entry = getCart(robot.cartId);
      if (entry) entry.status = "delivered";
      robot.cartId = null;
      robot.phase = null;
      robot.busy = null;
      onRobotFreed(robot);
      return;
    }
    if (robot.phase === "to-stock") {
      robot.busy = "stocking";
      robot.phase = "stock";
      robot.dwell = 3;
      return;
    }
    if (robot.phase === "to-dock") {
      robot.x = NODES.dock.x;
      robot.y = NODES.dock.y;
      robot.busy = "charging";
      robot.phase = "charging";
      robot.path = [];
      return;
    }
    robot.phase = "patrol-pause";
    robot.busy = null;
    robot.dwell = 0.35 + Math.random() * 0.7;
  }

  function completeDwell(robot) {
    robot.dwell = 0;
    if (robot.cartId && robot.phase === "pick") {
      const entry = getCart(robot.cartId);
      const slot = entry ? getSlot(entry.itemId) : null;
      if (slot && slot.stock > 0) slot.stock -= 1;
      if (entry) entry.status = "returning";
      robot.busy = null;
      robot.phase = "return";
      robot.path = pathToCheckout(robot);
      if (!robot.path.length) arrive(robot);
      return;
    }
    if (robot.phase === "stock") {
      const slot = getSlot(robot.focusId);
      if (slot) slot.stock = Math.min(slot.capacity, slot.stock + 3);
      robot.focusId = null;
      robot.busy = null;
      robot.phase = null;
      onRobotFreed(robot);
      return;
    }
    if (robot.phase === "ambient") {
      const slot = getSlot(robot.focusId);
      if (slot && slot.stock > 0) slot.stock -= 1;
      robot.focusId = null;
      robot.busy = null;
      robot.phase = null;
      onRobotFreed(robot);
      return;
    }
    if (robot.phase === "patrol-pause") {
      robot.phase = null;
      if (tryDispatch(robot)) return;
      if (Math.random() < 0.28) tryStock(robot);
      else startPatrol(robot);
    }
  }

  function updateBattery(robot, dt) {
    const action = deriveAction(robot);
    let rate = -0.16;
    if (action === "charging") rate = 0.9;
    else if (action === "picking") rate = -0.07;
    else if (action === "stocking") rate = -0.1;
    else if (robot.manual) rate = -0.32;
    robot.battery = Math.max(0, Math.min(100, robot.battery + rate * dt));
  }

  function stepRobot(robot, dt) {
    if (robot.manual) {
      let vx = 0;
      let vy = 0;
      if (held.has("left") || held.has("a")) vx -= 1;
      if (held.has("right") || held.has("d")) vx += 1;
      if (held.has("up") || held.has("w")) vy -= 1;
      if (held.has("down") || held.has("s")) vy += 1;
      const length = Math.hypot(vx, vy);
      if (length) {
        const speed = 170;
        const nx = robot.x + (vx / length) * speed * dt;
        const ny = robot.y + (vy / length) * speed * dt;
        if (clear(nx, ny)) {
          robot.x = nx;
          robot.y = ny;
        } else {
          if (clear(nx, robot.y)) robot.x = nx;
          else if (clear(robot.x, ny)) robot.y = ny;
        }
        robot.heading = Math.atan2(vy, vx);
      }
      if (nearDock(robot)) robot.busy = "charging";
      else robot.busy = null;
      updateBattery(robot, dt);
      return;
    }

    if (robot.phase === "charging") {
      updateBattery(robot, dt);
      const queued = cart.some((entry) => entry.status === "queued");
      if ((queued && robot.battery >= 50) || robot.battery >= 100) {
        robot.busy = null;
        robot.phase = null;
        if (!tryDispatch(robot)) startPatrol(robot);
      }
      return;
    }

    if (robot.dwell > 0) {
      robot.dwell -= dt;
      updateBattery(robot, dt);
      if (robot.dwell <= 0) completeDwell(robot);
      return;
    }

    if (robot.path.length) {
      const target = robot.path[0];
      const dx = target.x - robot.x;
      const dy = target.y - robot.y;
      const dist = Math.hypot(dx, dy);
      const step = robot.speed * dt;
      if (dist <= step || dist === 0) {
        robot.x = target.x;
        robot.y = target.y;
        robot.path.shift();
        if (!robot.path.length) arrive(robot);
      } else {
        robot.x += (dx / dist) * step;
        robot.y += (dy / dist) * step;
        robot.heading = Math.atan2(dy, dx);
      }
      updateBattery(robot, dt);
      if (robot.battery <= 6 && robot.phase !== "to-dock" && robot.phase !== "charging") goDock(robot);
      return;
    }

    updateBattery(robot, dt);
    if (robot.battery <= 6 && robot.phase !== "to-dock" && robot.phase !== "charging") {
      goDock(robot);
      return;
    }
    if (!robot.busy && !robot.phase) startPatrol(robot);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastTick) / 1000 || 0);
    lastTick = now;
    robots.forEach((robot) => stepRobot(robot, dt));
    syncMap();
    if (now - lastUi > 180) {
      syncFleet();
      renderCart();
      syncOrderNote();
      lastUi = now;
    }
    raf = requestAnimationFrame(loop);
  }

  function syncOrderNote() {
    if (!cart.length || cartMessage.classList.contains("is-error")) return;
    const active = cart.some((entry) => entry.status === "queued" || entry.status === "enroute" || entry.status === "picking" || entry.status === "returning");
    if (!active && cart.some((entry) => entry.status === "delivered") && cartMessage.textContent !== "Delivered to checkout.") {
      setCartMessage("Delivered to checkout.", false);
    }
  }

  function statusText(entry) {
    if (entry.status === "queued") return "Queued";
    if (entry.status === "delivered") return "Delivered";
    if (entry.status === "cancelled") return "Cancelled";
    const robot = robots.find((unit) => unit.id === entry.robotId);
    const name = robot ? robot.name : "Robot";
    if (entry.status === "picking") return name + " · picking";
    if (entry.status === "returning") return name + " · to checkout";
    return name + " · moving";
  }

  let cartSignature = "";

  function renderCart() {
    const signature = cart.map((entry) => entry.id + entry.status + entry.robotId).join("|");
    if (signature === cartSignature) return;
    cartSignature = signature;
    cartList.innerHTML = "";
    cart.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "cart-chip" + (entry.status === "delivered" ? " is-delivered" : "");
      const name = document.createElement("strong");
      name.textContent = entry.name;
      const status = document.createElement("span");
      status.textContent = statusText(entry);
      li.append(name, status);
      if (entry.status !== "delivered" && entry.status !== "cancelled") {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.setAttribute("aria-label", "Cancel " + entry.name);
        remove.textContent = "×";
        remove.addEventListener("click", () => cancelCart(entry.id));
        li.append(remove);
      }
      cartList.append(li);
    });
  }

  function cancelCart(id) {
    const entry = getCart(id);
    if (!entry) return;
    entry.status = "cancelled";
    const robot = robots.find((unit) => unit.cartId === id);
    if (robot) {
      robot.cartId = null;
      robot.dwell = 0;
      robot.busy = null;
      robot.phase = null;
      onRobotFreed(robot);
    }
    renderCart();
  }

  function setCartMessage(text, isError) {
    cartMessage.textContent = text;
    cartMessage.classList.toggle("is-error", Boolean(isError));
  }

  function currentToken() {
    const parts = cartInput.value.split(",");
    return parts[parts.length - 1].trim();
  }

  function showSuggestions() {
    const token = norm(currentToken());
    suggestions.innerHTML = "";
    if (!token) {
      suggestions.hidden = true;
      return;
    }
    const matches = allSlots().filter((slot) => {
      return norm(slot.name).includes(token) || norm(slot.short).includes(token) || slot.aliases.some((alias) => norm(alias).includes(token));
    }).slice(0, 6);
    if (!matches.length) {
      suggestions.hidden = true;
      return;
    }
    matches.forEach((slot) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = slot.name;
      button.addEventListener("click", () => {
        const parts = cartInput.value.split(",");
        parts[parts.length - 1] = " " + slot.name;
        cartInput.value = parts.join(",").replace(/^,\s*/, "").trim();
        suggestions.hidden = true;
        cartInput.focus();
      });
      li.append(button);
      suggestions.append(li);
    });
    suggestions.hidden = false;
  }

  function submitCart(event) {
    event.preventDefault();
    const parts = cartInput.value.split(",").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) {
      setCartMessage("Type an item to send a robot.", true);
      return;
    }
    const notes = [];
    let added = 0;
    parts.forEach((part) => {
      const found = findItem(part);
      if (found.error === "missing") {
        notes.push(part + " isn’t on this floor.");
        return;
      }
      if (found.error === "ambiguous") {
        notes.push("Did you mean " + found.options.map((slot) => slot.name).slice(0, 3).join(", ") + "?");
        return;
      }
      const entry = {
        id: "c" + cartSeq++,
        itemId: found.item.id,
        name: found.item.name,
        status: "queued",
        robotId: null,
      };
      cart.push(entry);
      added += 1;
      tryDispatch(null);
    });
    if (added) {
      cartInput.value = "";
      suggestions.hidden = true;
      const queued = cart.filter((entry) => entry.status === "queued").length;
      setCartMessage(queued ? "Sent. A free robot will take anything still waiting." : "A robot is on the way.", false);
    } else {
      setCartMessage(notes[0] || "Nothing matched.", true);
    }
    if (notes.length && added) setCartMessage(notes[0], true);
    renderCart();
    syncFleet();
  }

  function openCamera(id) {
    cameraRobot = robots.find((robot) => robot.id === id) || null;
    if (!cameraRobot) return;
    selectRobot(id);
    if (!cameraDialog.open) cameraDialog.showModal();
    syncCamera();
  }

  function syncCamera() {
    if (!cameraDialog.open || !cameraRobot) return;
    document.getElementById("camera-title").textContent = cameraRobot.name;
    document.getElementById("cam-caption").textContent = taskLine(cameraRobot) + " · battery " + Math.round(cameraRobot.battery) + "%";
    document.getElementById("cam-clock").textContent = new Date().toLocaleTimeString();
  }

  function openTeleop(id) {
    const robot = robots.find((unit) => unit.id === id);
    if (!robot) return;
    if (manualRobot && manualRobot !== robot) releaseManual(manualRobot);
    manualRobot = robot;
    robot.manual = true;
    robot.path = [];
    robot.dwell = 0;
    selectRobot(id);
    if (!teleopDialog.open) teleopDialog.showModal();
    syncTeleop();
  }

  function syncTeleop() {
    if (!teleopDialog.open || !manualRobot) return;
    document.getElementById("teleop-title").textContent = manualRobot.name;
    document.getElementById("teleop-task").textContent = taskLine(manualRobot) + " · battery " + Math.round(manualRobot.battery) + "%";
  }

  function releaseManual(robot) {
    robot.manual = false;
    robot.vx = 0;
    robot.vy = 0;
    held.clear();
    document.querySelectorAll("#dpad button").forEach((button) => button.classList.remove("is-held"));
    if (robot.cartId) {
      const entry = getCart(robot.cartId);
      if (entry && (entry.status === "enroute" || entry.status === "picking")) {
        entry.status = "enroute";
        robot.busy = null;
        robot.phase = "to-item";
        robot.path = pathToSlot(robot, getSlot(entry.itemId));
        return;
      }
      if (entry && entry.status === "returning") {
        robot.busy = null;
        robot.phase = "return";
        robot.path = pathToCheckout(robot);
        return;
      }
    }
    if (nearDock(robot) && robot.battery < 99) {
      robot.busy = "charging";
      robot.phase = "charging";
      robot.path = [];
      return;
    }
    if (robot.battery < 15) {
      goDock(robot);
      return;
    }
    onRobotFreed(robot);
  }

  function closeTeleop() {
    if (manualRobot) {
      const robot = manualRobot;
      manualRobot = null;
      releaseManual(robot);
    }
    held.clear();
    if (teleopDialog.open) teleopDialog.close();
  }

  function boot(email) {
    cancelAnimationFrame(raf);
    cart = [];
    cartSeq = 1;
    selectedId = "r1";
    cameraRobot = null;
    manualRobot = null;
    held.clear();
    layoutShelves();
    buildGraph();
    buildBlocks();
    randomizeStock();
    robots = createRobots();
    const store = email === DEMO_EMAIL ? "Northside Convenience" : "Your store";
    storeNameEl.textContent = store;
    floorTitle.textContent = store;
    signedInAs.textContent = email;
    slotReadout.textContent = "Click a shelf for stock detail. Levels are random for this preview.";
    setCartMessage("", false);
    cartList.innerHTML = "";
    drawFloor();
    renderFleet();
    syncMap();
    lastTick = performance.now();
    lastUi = 0;
    raf = requestAnimationFrame(loop);
  }

  function showApp(email) {
    sessionStorage.setItem(SESSION_KEY, email);
    loginView.hidden = true;
    appView.hidden = false;
    document.body.classList.add("is-authed");
    boot(email);
  }

  function showLogin() {
    cancelAnimationFrame(raf);
    if (cameraDialog.open) cameraDialog.close();
    if (teleopDialog.open) teleopDialog.close();
    manualRobot = null;
    appView.hidden = true;
    loginView.hidden = false;
    document.body.classList.remove("is-authed");
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email.includes("@") || !email.includes(".")) {
      loginError.hidden = false;
      loginError.textContent = "Enter a valid email.";
      return;
    }
    if (password.length < 4) {
      loginError.hidden = false;
      loginError.textContent = "Password needs at least 4 characters.";
      return;
    }
    loginError.hidden = true;
    showApp(email);
  });

  document.getElementById("fill-demo").addEventListener("click", () => {
    loginEmail.value = DEMO_EMAIL;
    loginPassword.value = DEMO_PASSWORD;
    loginError.hidden = true;
    showApp(DEMO_EMAIL);
  });

  document.getElementById("sign-out").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  });

  cartForm.addEventListener("submit", submitCart);
  cartInput.addEventListener("input", showSuggestions);
  cartInput.addEventListener("blur", () => {
    setTimeout(() => { suggestions.hidden = true; }, 160);
  });

  document.getElementById("close-camera").addEventListener("click", () => cameraDialog.close());
  document.getElementById("close-teleop").addEventListener("click", closeTeleop);
  document.getElementById("release-teleop").addEventListener("click", closeTeleop);
  teleopDialog.addEventListener("close", () => {
    if (manualRobot) {
      const robot = manualRobot;
      manualRobot = null;
      releaseManual(robot);
    }
  });

  document.querySelectorAll("#dpad button").forEach((button) => {
    const dir = button.dataset.dir;
    const press = (event) => {
      event.preventDefault();
      try {
        button.setPointerCapture(event.pointerId);
      } catch (error) {
        // pointer capture is a convenience; dragging off the button still works without it
      }
      held.add(dir);
      button.classList.add("is-held");
    };
    const release = () => {
      held.delete(dir);
      button.classList.remove("is-held");
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
  });

  window.addEventListener("keydown", (event) => {
    if (!teleopDialog.open) return;
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      if (key === "arrowup") held.add("up");
      else if (key === "arrowdown") held.add("down");
      else if (key === "arrowleft") held.add("left");
      else if (key === "arrowright") held.add("right");
      else held.add(key);
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowup") held.delete("up");
    else if (key === "arrowdown") held.delete("down");
    else if (key === "arrowleft") held.delete("left");
    else if (key === "arrowright") held.delete("right");
    else held.delete(key);
  });

  layoutShelves();
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) showApp(existing);
  else loginEmail.focus();
})();
