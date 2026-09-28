(() => {
  "use strict";

  const API_BASE = "https://mental-health-prediction-w9ft.onrender.com";
  const REQUEST_TIMEOUT_MS = 60000; // free Render servers can take a while to wake up

  // ---------------------------------------------------------
  // Element references
  // ---------------------------------------------------------
  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");

  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");
  const gaugeFill = document.getElementById("gauge-fill");
  const gaugeNeedle = document.getElementById("gauge-needle");
  const insightsList = document.getElementById("insights-list");
  const errorLabelEl = document.getElementById("error-label");
  const errorCopyEl = document.getElementById("error-copy");

  const loadingLabelEl = document.getElementById("loading-label");
  const loadingCopyEl = document.getElementById("loading-copy");

  const progressFill = document.getElementById("progress-fill");
  const progressCount = document.getElementById("progress-count");
  const progressTrack = document.getElementById("progress-track");

  const GAUGE_ARC_LENGTH = 314; // approx pi * r(100)
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------
  // Draw tick marks on the gauges (0..10, every 2 units)
  // ---------------------------------------------------------
  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((g) => {
      g.innerHTML = "";
      const cx = 120, cy = 140, rOuter = 100, rInner = 90;
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", (cx + rOuter * Math.cos(angle)).toFixed(1));
        line.setAttribute("y1", (cy - rOuter * Math.sin(angle)).toFixed(1));
        line.setAttribute("x2", (cx + rInner * Math.cos(angle)).toFixed(1));
        line.setAttribute("y2", (cy - rInner * Math.sin(angle)).toFixed(1));
        g.appendChild(line);
      }
    });
  }
  drawTicks();

  // ---------------------------------------------------------
  // Segmented control (stress_level)
  // ---------------------------------------------------------
  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stressHiddenInput.value = btn.dataset.value;
      clearFieldError(stressHiddenInput);
      updateProgress();
    });
  });

  // ---------------------------------------------------------
  // Form completion progress
  // ---------------------------------------------------------
  const FIELD_IDS = [
    "age", "gender", "country",
    "academic_level", "most_used_platform", "purpose_of_use",
    "avg_daily_usage_hours", "daily_unlocks",
    "study_hours", "physical_activity_hours", "sleep_hours_per_night",
    "stress_level",
  ];

  function updateProgress() {
    const done = FIELD_IDS.filter((id) => {
      const el = document.getElementById(id);
      return el && String(el.value).trim() !== "";
    }).length;
    progressFill.style.width = `${(done / FIELD_IDS.length) * 100}%`;
    progressCount.textContent = `${done} of ${FIELD_IDS.length} completed`;
    progressTrack.setAttribute("aria-valuenow", String(done));
  }
  updateProgress();

  // ---------------------------------------------------------
  // Field-level error helpers
  // ---------------------------------------------------------
  function fieldWrapper(input) { return input.closest(".field"); }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  // ---------------------------------------------------------
  // Client-side validation mirroring the StudentData model
  // ---------------------------------------------------------
  function validate(payload) {
    const errors = [];

    const numericChecks = [
      ["age", 10, 100],
      ["avg_daily_usage_hours", 0, 24],
      ["daily_unlocks", 0, Infinity],
      ["study_hours", 0, 24],
      ["physical_activity_hours", 0, 24],
      ["sleep_hours_per_night", 0, 24],
    ];

    numericChecks.forEach(([key, min, max]) => {
      const input = document.getElementById(key);
      const val = payload[key];
      if (val === "" || val === null || Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max === Infinity ? "0+" : max}.`]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.stress_level) {
      errors.push([stressHiddenInput, "Pick a stress level."]);
    }

    return errors;
  }

  // ---------------------------------------------------------
  // Gather form data into the exact StudentData shape
  // ---------------------------------------------------------
  function collectPayload() {
    const fd = new FormData(form);
    const num = (k, parser) => (fd.get(k) === "" ? NaN : parser(fd.get(k)));
    return {
      age: num("age", (v) => parseInt(v, 10)),
      gender: fd.get("gender") || "",
      country: (fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level") || "",
      most_used_platform: fd.get("most_used_platform") || "",
      purpose_of_use: fd.get("purpose_of_use") || "",
      avg_daily_usage_hours: num("avg_daily_usage_hours", parseFloat),
      daily_unlocks: num("daily_unlocks", (v) => parseInt(v, 10)),
      study_hours: num("study_hours", parseFloat),
      physical_activity_hours: num("physical_activity_hours", parseFloat),
      sleep_hours_per_night: num("sleep_hours_per_night", parseFloat),
      stress_level: fd.get("stress_level") || "",
    };
  }

  // ---------------------------------------------------------
  // Loading animation — runs ONLY while a request is in flight
  // ---------------------------------------------------------
  const LOADING_STEPS = [
    ["Reading the signal…", "Running your habits through the model."],
    ["Checking sleep rhythm…", "Comparing your nights with typical patterns."],
    ["Weighing screen time…", "Looking at usage, unlocks, and purpose."],
    ["Balancing stress…", "Combining lifestyle and stress inputs."],
    ["Calibrating your score…", "Almost there — finalising the read."],
  ];
  let loadingTimer = null;
  let slowTimer = null;
  let loadingIndex = 0;

  function startLoadingMessages() {
    stopLoadingMessages();
    loadingIndex = 0;
    setLoadingText(LOADING_STEPS[0]);
    loadingTimer = setInterval(() => {
      loadingIndex = (loadingIndex + 1) % LOADING_STEPS.length;
      setLoadingText(LOADING_STEPS[loadingIndex]);
    }, 1800);
    // Free-tier servers sleep when idle; tell the user why it is slow.
    slowTimer = setTimeout(() => {
      clearInterval(loadingTimer);
      loadingTimer = null;
      setLoadingText(["Waking up the server…", "The first request can take up to a minute. Thanks for waiting."]);
    }, 9000);
  }

  function stopLoadingMessages() {
    if (loadingTimer) clearInterval(loadingTimer);
    if (slowTimer) clearTimeout(slowTimer);
    loadingTimer = slowTimer = null;
  }

  function setLoadingText([label, copy]) {
    loadingLabelEl.textContent = label;
    loadingCopyEl.textContent = copy;
  }

  // ---------------------------------------------------------
  // UI state switching
  // ---------------------------------------------------------
  const STATES = { idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError };

  function showState(name) {
    Object.values(STATES).forEach((el) => (el.hidden = true));
    STATES[name].hidden = false;
    if (name === "loading") startLoadingMessages();
    else stopLoadingMessages();
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  // ---------------------------------------------------------
  // Result rendering
  // ---------------------------------------------------------
  function bandFor(score) {
    if (score < 4) {
      return {
        label: "Signal: strained",
        context: "Your responses suggest elevated strain right now. Small shifts in sleep or screen time can go a long way.",
      };
    }
    if (score < 7) {
      return {
        label: "Signal: balanced",
        context: "Your rhythm looks fairly steady, with some room to recover and reset.",
      };
    }
    return {
      label: "Signal: strong",
      context: "Your habits point to a well-supported, resilient baseline. Keep it up.",
    };
  }

  // Simple, transparent read-outs of the user's own inputs
  function buildInsights(p) {
    const rows = [];

    rows.push(["Sleep", `${p.sleep_hours_per_night} hrs`,
      p.sleep_hours_per_night < 6 ? "warn" : p.sleep_hours_per_night <= 9 ? "good" : "mid"]);

    rows.push(["Screen", `${p.avg_daily_usage_hours} hrs/day`,
      p.avg_daily_usage_hours > 6 ? "warn" : p.avg_daily_usage_hours <= 4 ? "good" : "mid"]);

    rows.push(["Activity", `${p.physical_activity_hours} hrs/day`,
      p.physical_activity_hours < 0.5 ? "warn" : p.physical_activity_hours >= 1 ? "good" : "mid"]);

    rows.push(["Stress", p.stress_level,
      p.stress_level === "Low" ? "good" : p.stress_level === "Medium" ? "mid" : "warn"]);

    return rows;
  }

  function renderInsights(payload) {
    insightsList.innerHTML = "";
    buildInsights(payload).forEach(([key, value, tone]) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = `dot ${tone}`;
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = key;
      const v = document.createElement("span");
      v.className = "v";
      v.textContent = value;
      li.append(dot, k, v);
      insightsList.appendChild(li);
    });
  }

  let rafId = null;

  // One animation drives the arc, the needle, and the number together
  function animateGauge(score) {
    const clamped = Math.max(0, Math.min(10, score));
    if (rafId) cancelAnimationFrame(rafId);

    const apply = (progress) => {
      const current = clamped * progress;
      gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH * (1 - current / 10));
      gaugeNeedle.setAttribute("transform", `rotate(${(current / 10) * 180} 120 140)`);
      scoreNumberEl.textContent = (score * progress).toFixed(2);
    };

    if (prefersReducedMotion) { apply(1); return; }

    apply(0);
    const duration = 1400;
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / duration);
      apply(1 - Math.pow(1 - t, 3)); // ease-out cubic
      if (t < 1) rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  function renderResult(score, payload) {
    const { label, context } = bandFor(Math.max(0, Math.min(10, score)));
    scoreBandEl.textContent = label;
    scoreContextEl.textContent = context;
    renderInsights(payload);
    showState("result");
    animateGauge(score);
  }

  function renderError(label, copy) {
    errorLabelEl.textContent = label;
    errorCopyEl.textContent = copy;
    showState("error");
  }

  // ---------------------------------------------------------
  // Parse FastAPI / Pydantic 422 responses into field errors
  // ---------------------------------------------------------
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      const target = field === "stress_level" ? stressHiddenInput : (field ? document.getElementById(field) : null);
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  // ---------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const payload = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      clientErrors[0][0]?.focus?.();
      return;
    }

    setSubmitting(true);
    showState("loading");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          "Check your inputs",
          matched
            ? "A few fields were rejected. They are marked on the form."
            : "This submission was rejected. Please review your inputs."
        );
        return;
      }

      if (!res.ok) {
        let detailMsg = `The server responded with status ${res.status}.`;
        const body = await res.json().catch(() => null);
        if (body && typeof body.detail === "string") detailMsg = body.detail;
        renderError("Prediction failed", detailMsg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("Unexpected response", "The server replied, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score, payload);
    } catch (err) {
      const timedOut = err && err.name === "AbortError";
      renderError(
        timedOut ? "Taking too long" : "Can't reach the server",
        timedOut
          ? "The server did not answer in time. It may still be waking up."
          : "We couldn't connect to the prediction server. Check your internet connection."
      );
    } finally {
      clearTimeout(timeoutId);
      setSubmitting(false);
    }
  });

  // ---------------------------------------------------------
  // Live updates while the user edits
  // ---------------------------------------------------------
  form.querySelectorAll("input, select").forEach((el) => {
    const handler = () => { clearFieldError(el); updateProgress(); };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });

  // ---------------------------------------------------------
  // "Run another read" — clears everything and gets you ready
  // ---------------------------------------------------------
  resetBtn.addEventListener("click", () => {
    if (rafId) cancelAnimationFrame(rafId);
    form.reset();
    segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
    stressHiddenInput.value = "";
    clearAllErrors();
    updateProgress();
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
    gaugeNeedle.setAttribute("transform", "rotate(0 120 140)");
    showState("idle");

    // On phones the form is above the panel, so bring it back into view
    document.getElementById("predict-form").scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    document.getElementById("age").focus({ preventScroll: true });
  });

  showState("idle");
})();