const experiment = {
  times: [],
  timesDominant: [],
  timesNonDominant: [],
  maxTrials: 20,
  waitHnd: -1,
  started: false,
  ended: false,
  stimulusWait: false,
  stimulusShown: false,
  stimulusShownAt: -1,
  btnDisabled: false,
  trialPlan: [], // array of 'D' or 'N'
  currentHand: null, // 'D' or 'N'
  participantId: '',
  dominantSide: 'Right' // UI-provided dominant side
};

const btn = document.querySelector(".button-default");
const stimulus = document.querySelector(".circle");
const handCueEl = document.querySelector('#handCue');
const resultsEl = document.querySelector('#results');
const participantsTableEl = document.querySelector('#participantsTable');
const trialCounterEl = document.querySelector('#trialCounter');

const advanceTrial = function () {
  //reset stimulus
  updateStimulus("inactive");

  if (experiment.times.length < experiment.maxTrials) {
    //still need to run more trials
    experiment.stimulusShown = false; //reset
    setNextHandFromPlan();
    renderHandCue();
    renderTrialCounter();
    scheduleStimulus();
  } else {
    //experiment ended
    experiment.stimulusShown = false;
    endExperiment();
  }
};

const endExperiment = function () {
  console.info("INFO: Experiment ended. Await download of results");

  experiment.ended = true;

  //Update Button Styling
  experiment.btnDisabled = false;
  btn.classList.toggle("button-enabled");
  btn.classList.toggle("button-disabled");
  btn.textContent = "Download Data";

  // compute and render summary
  const statsD = computeStatistics(experiment.timesDominant);
  const statsN = computeStatistics(experiment.timesNonDominant);
  const diff = (statsD.mean - statsN.mean);
  resultsEl.innerHTML = (
    [
      'Dominant Mean: ', isFinite(statsD.mean)?statsD.mean.toFixed(2):'—',' ms',' &nbsp; ',
      'Non-dominant Mean: ', isFinite(statsN.mean)?statsN.mean.toFixed(2):'—',' ms',' &nbsp; ',
      'Difference (D - N): ', isFinite(diff)?diff.toFixed(2):'—',' ms'
    ].join('')
  );
  // render detailed per-trial table
  resultsEl.innerHTML += renderPerTrialTable();

  // persist participant summary and render comparison
  persistParticipantSummary({
    pid: experiment.participantId || randomPid(),
    modality: 'visual',
    dominantSide: experiment.dominantSide,
    meanD: statsD.mean,
    meanN: statsN.mean,
    diff: diff,
    cntD: statsD.cnt,
    cntN: statsN.cnt,
    ts: Date.now()
  });
  renderParticipantsTable();
};

const scheduleStimulus = function () {
  experiment.stimulusWait = true;
  const randomDelay = Math.floor(Math.random() * 4 + 2); // 2 - 5s
  experiment.waitHnd = window.setTimeout(showStimulus, randomDelay * 1000); //setTimeout runs in milliseconds
  console.info(
    "INFO: Trial",
    experiment.times.length,
    ". Random delay:",
    randomDelay
  );
};

const showStimulus = function () {
  experiment.stimulusShownAt = Date.now();
  console.info(
    "INFO: Trial",
    experiment.times.length,
    ". Stimulus shown",
    experiment.stimulusShownAt
  );
  updateStimulus("active");
  experiment.stimulusWait = false;
  experiment.stimulusShown = true;
};

const updateStimulus = function (state) {
  const otherState = state == "active" ? "inactive" : "active";

  stimulus.classList.add(state);
  stimulus.classList.remove(otherState);
};

const logReaction = function () {
  let userReactedAt = Date.now();
  console.info("INFO: User reaction captured.", userReactedAt);

  let deltaTime = userReactedAt - experiment.stimulusShownAt;
  experiment.times.push(deltaTime);
  if (experiment.currentHand === 'D') {
    experiment.timesDominant.push(deltaTime);
  } else if (experiment.currentHand === 'N') {
    experiment.timesNonDominant.push(deltaTime);
  }
  document.querySelector("#time").textContent = deltaTime + " ms";
};

const userReaction = function () {
  if (!experiment.started) {
    return;
  } //prior to start of experiment, ignore
  if (experiment.stimulusWait) {
    return;
  } //ignore false trigger reactions

  if (experiment.stimulusShown) {
    //stimulus is visible, capture
    logReaction();
    advanceTrial();
  }
};

const startExperiment = function () {
  console.info("INFO: Experiment Started");
  stimulus.style = "background-color:'';";
  document.querySelector("#instructions").style.display = "none";
  readParticipantSettings();
  initTrialPlan();
  renderHandCue();
  renderTrialCounter();
  experiment.started = true;
  window.addEventListener("keypress", onKey); //add keylistener
  advanceTrial();
};

const btnAction = function () {
  console.debug("DBG:", "click");
  if(experiment.btnDisabled) return;
  if (!experiment.ended) {
    experiment.btnDisabled = true;
    btn.classList.toggle("button-enabled");
    btn.classList.toggle("button-disabled");
  }
  if (!experiment.started) {
    startExperiment();
  } else {
    if (experiment.ended) {
      exportExperimentLog();
      // Intentionally do not update #time with summary text after download
    } else {
      console.log("DBG: Should this occur?");
    }
  }
};

const computeStatistics = function (timeArr) {
  //to get mean, get sum of all trials and divide by number of trials m = sum(x)/cnt(x)
  const sums = timeArr.reduce((acc, num) => acc + num, 0);
  const meanDeltaTime = sums / timeArr.length;

  //standard deviation is  sqrt(sum(x-mean)^2/cnt(x))
  const squaredDiffs = timeArr.reduce(
    (acc, num) => (num - meanDeltaTime) ** 2 + acc,
    0
  );
  const standardDeviationTime = Math.sqrt(squaredDiffs / timeArr.length);

  return {
    sd: standardDeviationTime,
    mean: meanDeltaTime,
    cnt: timeArr.length,
  };
};

const exportExperimentLog = function () {
  let csvHeader = "pid,trial#,hand,dominantSide,reactionTime (ms)\n";
  let pid = experiment.participantId || randomPid();
  let csvData = experiment.times
    .map((time, idx) => [pid, idx, experiment.trialPlan[idx], experiment.dominantSide, time].join(","))
    .join("\n");
  exportData(csvHeader + csvData, "VisualReactionTestResults.csv");
};

const exportData = function (csvDataString, exportFileName) {
  // Create a Blob with the CSV data
  const blob = new Blob([csvDataString], { type: "text/csv" });

  // Create a temporary link element
  const a = document.createElement("a");
  a.href = window.URL.createObjectURL(blob);
  a.download = exportFileName;

  // Trigger the download
  document.body.appendChild(a);
  a.style.display = "none";
  a.click();

  // Clean up
  window.URL.revokeObjectURL(a.href);
  document.body.removeChild(a);
};

const onKey = function (evt) {
  if (evt == null) {
    evt = window.event;
  }
  switch (evt.which || evt.charCode || evt.keyCode) {
    case 32: //space
      userReaction();
      break;
    default:
      console.warn("WARN: Key:", evt, evt.which, evt.charCode, evt.keyCode);
  }
};

btn.addEventListener("click", btnAction);

// --- New helper functions for dominant/non-dominant protocol ---
function initTrialPlan() {
  const plan = Array(10).fill('D').concat(Array(10).fill('N'));
  // shuffle
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = plan[i];
    plan[i] = plan[j];
    plan[j] = tmp;
  }
  experiment.trialPlan = plan;
  experiment.currentHand = plan[0];
}

function setNextHandFromPlan() {
  const idx = experiment.times.length; // 0..19
  experiment.currentHand = experiment.trialPlan[idx] || null;
}

function renderHandCue() {
  if (!handCueEl) return;
  const label = experiment.currentHand === 'D' ? 'Use DOMINANT hand' : 'Use NON-DOMINANT hand';
  const side = experiment.currentHand === 'D' ? experiment.dominantSide : (experiment.dominantSide === 'Right' ? 'Left' : 'Right');
  handCueEl.textContent = experiment.currentHand ? (label + ` (${side})`) : '';
}

function readParticipantSettings() {
  const pidInput = document.querySelector('#participantId');
  experiment.participantId = pidInput && pidInput.value ? String(pidInput.value).trim() : '';
  const sideInput = document.querySelector('input[name="dominantSide"]:checked');
  experiment.dominantSide = sideInput ? sideInput.value : 'Right';
}

function persistParticipantSummary(row) {
  try {
    const key = 'reaction_visual_participants';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push(row);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    console.warn('WARN: persist failed', e);
  }
}

function renderParticipantsTable() {
  if (!participantsTableEl) return;
  const key = 'reaction_visual_participants';
  let rows = [];
  try {
    rows = JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) { rows = []; }
  if (!rows.length) { participantsTableEl.innerHTML = '<div>No prior participants.</div>'; return; }
  const header = ['PID','Dominant','D mean (ms)','N mean (ms)','Δ (D-N) (ms)','Trials'];
  const html = [
    '<table style="width:100%;border-collapse:collapse;">',
    '<thead><tr>' + header.map(h=>`<th style="border-bottom:1px solid #ddd;text-align:left;padding:4px;">${h}</th>`).join('') + '</tr></thead>',
    '<tbody>',
    rows.map(r => (
      '<tr>' + [
        r.pid,
        r.dominantSide,
        isFinite(r.meanD)?r.meanD.toFixed(2):'—',
        isFinite(r.meanN)?r.meanN.toFixed(2):'—',
        isFinite(r.diff)?r.diff.toFixed(2):'—',
        `${r.cntD||0}+${r.cntN||0}`
      ].map(v=>`<td style=\"padding:4px;border-bottom:1px solid #f0f0f0;\">${v}</td>`).join('') + '</tr>'
    )).join(''),
    '</tbody></table>'
  ].join('');
  participantsTableEl.innerHTML = html;
}

function randomPid(){
  return Math.floor(Math.random() * 900000) + 100000;
}

function renderPerTrialTable(){
  const d = experiment.timesDominant.slice(0,10);
  const n = experiment.timesNonDominant.slice(0,10);
  const maxRows = Math.max(d.length, n.length, 10);
  const header = ['Trial','D (ms)','N (ms)'];
  const rowsHtml = [];
  for(let i=0;i<maxRows;i++){
    const dVal = d[i];
    const nVal = n[i];
    rowsHtml.push(
      '<tr>'+
        `<td style="padding:4px;border-bottom:1px solid #f0f0f0;">${i+1}</td>`+
        `<td style="padding:4px;border-bottom:1px solid #f0f0f0;text-align:center;">${isFinite(dVal)?dVal: ''}</td>`+
        `<td style="padding:4px;border-bottom:1px solid #f0f0f0;text-align:center;">${isFinite(nVal)?nVal: ''}</td>`+
      '</tr>'
    );
  }
  const statsD = computeStatistics(d.length?d:[NaN]);
  const statsN = computeStatistics(n.length?n:[NaN]);
  const meanRow = (
    '<tr>'+
      `<td style="padding:4px;border-top:2px solid #ddd;font-weight:bold;">Mean</td>`+
      `<td style="padding:4px;border-top:2px solid #ddd;text-align:center;font-weight:bold;">${isFinite(statsD.mean)?statsD.mean.toFixed(1):'—'}</td>`+
      `<td style="padding:4px;border-top:2px solid #ddd;text-align:center;font-weight:bold;">${isFinite(statsN.mean)?statsN.mean.toFixed(1):'—'}</td>`+
    '</tr>'
  );
  const sdRow = (
    '<tr>'+
      `<td style="padding:4px;font-weight:bold;">SD</td>`+
      `<td style="padding:4px;text-align:center;font-weight:bold;">${isFinite(statsD.sd)?statsD.sd.toFixed(1):'—'}</td>`+
      `<td style="padding:4px;text-align:center;font-weight:bold;">${isFinite(statsN.sd)?statsN.sd.toFixed(1):'—'}</td>`+
    '</tr>'
  );
  const table = (
    '<div style="margin-top:10px;">'+
      '<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px;">'+
        '<thead><tr>'+
          header.map(h=>`<th style=\"border-bottom:1px solid #ddd;text-align:${h==='Trial'?'left':'center'};padding:4px;\">${h}</th>`).join('')+
        '</tr></thead>'+
        '<tbody>'+ rowsHtml.join('') + meanRow + sdRow + '</tbody>'+
      '</table>'+
    '</div>'
  );
  return table;
}

function renderTrialCounter(){
  if(!trialCounterEl) return;
  const current = Math.min(experiment.times.length + 1, experiment.maxTrials);
  if (experiment.ended) {
    trialCounterEl.textContent = '';
  } else {
    trialCounterEl.textContent = `Trial ${current} / ${experiment.maxTrials}`;
  }
}
