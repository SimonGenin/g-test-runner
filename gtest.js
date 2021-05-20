(function gTestInternal() {
  const domReady = new Promise((resolve) => {
    if (document.readyState !== "loading") {
      resolve();
    } else {
      document.addEventListener("DOMContentLoaded", resolve, false);
    }
  });

  class Bus extends EventTarget {
    trigger(name, payload) {
      this.dispatchEvent(new CustomEvent(name, { detail: payload }));
    }
  }

  const bus = new Bus();

  window.gTest = {
    __internal__: { bus, domReady },
  };
})();

(function gTestDebugging() {
  const bus = gTest.__internal__.bus;

  bus.addEventListener("suite-added", (ev) => {
    console.log("new suite", ev.detail);
  });

  bus.addEventListener("test-added", (ev) => {
    console.log("new test", ev.detail);
  });

  bus.addEventListener("before-all", () => {
    console.log("start");
  });

  bus.addEventListener("before-suite", (ev) => {
    const suite = ev.detail;
    console.log(`before-suite: ${suite.path}`, suite);
  });

  bus.addEventListener("before-test", (ev) => {
    const test = ev.detail;
    console.log(`before-test: ${test.description}`);
  });

  bus.addEventListener("after-test", (ev) => {
    const { test, suite } = ev.detail;
    console.log(`after-test: ${test.description}`, test, suite);
  });

  bus.addEventListener("after-suite", (ev) => {
    const suite = ev.detail;
    console.log(`after-suite: ${suite.path}`, suite);
  });

  bus.addEventListener("after-all", () => {
    console.log("after");
  });
})();

(function gTestRunner() {
  const state = gTest.__internal__;
  const { domReady, bus } = gTest.__internal__;

  const testSuites = [];
  const stack = [];
  let nextId = 1;
  let mutex = Promise.resolve();

  Object.assign(state, {
    suites: [],
    suiteNumber: 0,
    testNumber: 0,
    failedTestNumber: 0,
    doneTestNumber: 0,
    doneSuiteNumber: 0,
    started: false,
  });

  function describe(path, cb) {
    if (typeof cb === "string") {
      // nested describe definition
      let nestedArgs = Array.from(arguments).slice(1);

      return describe(path, () => {
        describe(...nestedArgs);
      });
    }
    // get correct suite, or create it
    const pathNames = stack.map((s) => s.path).concat(path);
    const fullPath = pathNames.join(" > ");

    const suite = {
      id: nextId++,
      fullPath,
      path,
      tests: [],
    };
    mutex = mutex.then(() => {
      // define content
      testSuites.push(suite); // testSuites will be modified in place
      state.suites.push(suite);
      stack.push(suite);
      bus.trigger("suite-added", suite);
      state.suiteNumber++;
      return cb();
    });
  }

  function test(description, cb) {
    const suite = stack[stack.length - 1];
    if (!suite) {
      throw new Error("Test defined outside of a suite");
    }
    const test = {
      description,
      cb,
      asserts: [],
      result: true,
    };
    suite.tests.push(test);
    bus.trigger("test-added", test);
    state.testNumber++;
  }

  class Assert {
    constructor(test) {
      this.test = test;
    }

    equal(left, right, descr) {
      const isOK = left === right;
      this.test.asserts.push({
        result: isOK,
        description: descr || "Equal values",
      });
      this.test.result = this.test.result && isOK;
    }
  }

  async function start() {
    await domReady; // may need dom for some tests

    state.started = true;
    bus.trigger("before-all");

    while (testSuites.length) {
      const suite = testSuites.shift();
      bus.trigger("before-suite", suite);
      for (let test of suite.tests) {
        const assert = new Assert(test);
        bus.trigger("before-test", test);

        await test.cb(assert);
        state.doneTestNumber++;
        if (!test.result) {
          state.failedTestNumber++;
        }

        bus.trigger("after-test", { test, suite });
      }
      state.doneSuiteNumber++;
      bus.trigger("after-suite", suite);
    }
    bus.trigger("after-all");
  }

  Object.assign(gTest, {
    describe,
    test,
    start,
  });
})();

(async function ui() {
  const { domReady, bus } = gTest.__internal__;
  const state = gTest.__internal__;

  // capture RAF in case some testing code decides to modify it
  const requestAnimationFrame = window.requestAnimationFrame;

  // initial UI
  const html = `
    <div class="gtest-runner">
      <div class="gtest-panel">
        <div class="gtest-panel-top">
          <span class="gtest-logo">gTest</span>
        </div>
        <div class="gtest-panel-main">
          <button class="gtest-btn gtest-start">Start</button>
          <button class="gtest-btn" disabled="disabled">Abort</button>
          <button class="gtest-btn">Rerun all</button>
        </div>
        <div class="gtest-status">
        </div>
      </div>
      <div class="gtest-reporting"></div>
    </div>`;

  const style = `
    body {
        margin: 0
    }
    .gtest-runner {
      font-family: sans-serif;
    }
    .gtest-panel {
        background-color: #eeeeee;
    }
    .gtest-panel-top {
      height: 45px;
      padding-left: 8px;
      padding-top: 4px;
    }
    .gtest-logo {
      font-size: 30px;
      font-weight: bold;
      font-family: sans-serif;
      color: #444444;
      margin-left: 4px;
    }

    .gtest-btn {
      height: 30px;
      background-color:#768d87;
      border-radius:4px;
      border:1px solid #566963;
      display:inline-block;
      cursor:pointer;
      color:#ffffff;
      font-size:15px;
      font-weight:bold;
      padding:6px 12px;
      text-decoration:none;
      text-shadow:0px 1px 0px #2b665e;
    }
    .gtest-btn:hover {
      background-color:#6c7c7c;
    }
    .gtest-btn:active {
      position:relative;
      top:1px;
    }

    .gtest-btn:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
    
    .gtest-panel-main {
      height: 45px;
      line-height: 45px;
      padding-left: 8px;
    }
    .gtest-status {
      background-color: #D2E0E6;
      height: 30px;
      line-height: 30px;
      font-size: 14px;
      padding-left: 12px;
    }

    .gtest-circle {
      display: inline-block;
      height: 16px;
      width: 16px;
      border-radius: 8px;
      position: relative;
      top: 2px;
    }

    .gtest-red {
        background-color: darkred;
    }

    .gtest-green {
        background-color: darkgreen;
    }

    .gtest-reporting {
      padding-top: 5px;
      padding-left: 10px;
      font-size: 14px;
    }

    .gtest-result {
      border-bottom: 1px solid lightgray;
    }
    .gtest-result-line {
      margin: 5px;
    }

    .gtest-result-success {
      color: darkgreen;
    }

    .gtest-result-fail {
      color: darkred;
    }

    .gtest-result-header {
      padding: 4px 12px;
      cursor: default;
    }

    .gtest-result-detail {
      padding-left: 60px;
    }

    .gtest-cell {
        padding: 5px;
    }`;

  await domReady;

  // initial rendering
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.prepend(div.firstElementChild);

  const sheet = document.createElement("style");
  sheet.innerHTML = style;
  document.head.appendChild(sheet);

  // key dom elements
  const statusPanel = document.getElementsByClassName("gtest-status")[0];
  const startBtn = document.getElementsByClassName("gtest-start")[0];
  const reporting = document.getElementsByClassName("gtest-reporting")[0];

  // UI update functions
  function setStatusContent(content) {
    statusPanel.innerHTML = content;
  }

  function disableStartButton() {
    startBtn.setAttribute("disabled", "disabled");
  }

  function addTestResult(test, suite) {
    // header
    const header = document.createElement("div");
    header.classList.add("gtest-result-header");

    const result = document.createElement("span");
    result.classList.add("gtest-circle");
    result.classList.add(test.result ? "gtest-green" : "gtest-red");
    header.innerHTML = `<span class="gtest-cell">${suite.fullPath}:</span><span class="gtest-cell">${test.description}</span>`;
    header.prepend(result);

    // test result div
    const div = document.createElement("div");
    div.classList.add("gtest-result");
    div.prepend(header);

    // detailed test result
    header.addEventListener(
      "click",
      () => {
        const results = document.createElement("div");
        results.classList.add("gtest-result-detail");
        let i = 1;
        for (let assert of test.asserts) {
          const div = document.createElement("div");
          div.classList.add("gtest-result-line");
          const lineCls = assert.result
            ? "gtest-result-success"
            : "gtest-result-fail";
          div.classList.add(lineCls);
          div.innerText = `${i++}. ${assert.description}`;
          results.appendChild(div);
        }
        div.appendChild(results);
      },
      { once: true }
    );

    reporting.appendChild(div);
  }

  // generic listeners
  bus.addEventListener("before-all", disableStartButton);

  bus.addEventListener("before-test", (ev) => {
    const description = ev.detail.description;
    setStatusContent(`Running: ${description}`);
  });

  bus.addEventListener("after-test", (ev) => {
    const { test, suite } = ev.detail;
    addTestResult(test, suite);
  });

  bus.addEventListener("after-all", () => {
    const statusCls =
      state.failedTestNumber === 0 ? "gtest-green" : "gtest-red";
    const status = `<span class="gtest-circle ${statusCls}" ></span> ${state.doneTestNumber} tests completed, with ${state.failedTestNumber} failed`;
    setStatusContent(status);
  });

  startBtn.addEventListener("click", () => {
    gTest.start();
  });

  // initial status update before started
  let started = state.started;
  let status = "";
  bus.addEventListener("before-all", () => (started = true));

  function updateIdleStatus() {
    if (!started) {
      const { suiteNumber, testNumber } = state;
      const newStatus = `${suiteNumber} suites, with ${testNumber} tests`;
      if (newStatus !== status) {
        status = newStatus;
        setStatusContent(status);
      }
      requestAnimationFrame(updateIdleStatus);
    }
  }

  requestAnimationFrame(updateIdleStatus);
})();
