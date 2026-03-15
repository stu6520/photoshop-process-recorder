var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");
var PromiseCompat = typeof Promise !== "undefined" ? Promise : null;

// ---- Settings ----
var THRESHOLD_STROKES = 5;
var CAPTURE_SCALE = 0.5;    // 1.0 = full size, 0.5 = half size
var FPS = 12;
var MAX_WINDOWS_PATH = 240;
var DEFAULT_PPI = 72;
var JPG_QUALITY = 2;        // ffmpeg mjpeg quality, lower is better

// Update if your ffmpeg is elsewhere
var FFMPEG = "C:\\ffmpeg\\bin\\ffmpeg.exe";
var pluginDir = __dirname;
var activeConfigDir = null;
var configPath = null;

// ---- State ----
var outputFolder = null;          // user-chosen base folder
var docFolders = {};              // docId -> absolute folder path
var docResolutions = {};          // docId -> ppi
var docFrameSize = {};            // docId -> { width, height }
var frameIndex = {};              // docId -> last written frame number
var frameExtension = {};          // docId -> "jpg"
var lastHash = {};                // docId -> md5 of last saved pixmap
var changeCount = {};             // docId -> stroke counter
var exportingDocs = {};           // docId -> true while ffmpeg export is running
var conversionChains = {};        // docId -> promise chain for per-frame ffmpeg conversion
var pendingConversions = {};      // docId -> count of active conversions
var pendingExportFolders = {};    // docId -> folder awaiting export after conversion
var pendingExportSizes = {};      // docId -> { width, height } for final normalization/export
var docInitialized = {};          // docId -> first frame already attempted
var trackedWithoutCapture = {};    // docId -> existing frame folder tracked without new capture

// ---- Helpers ----
function ensureDir(dir) {
  if (!dir) return;
  if (fs.existsSync(dir)) return;

  ensureDir(path.dirname(dir));
  try { fs.mkdirSync(dir); } catch (e) { /* ignore */ }
}

function isAbsolutePath(targetPath) {
  if (!targetPath) return false;
  if (typeof path.isAbsolute === "function") return path.isAbsolute(targetPath);

  return /^[A-Za-z]:[\\\/]/.test(targetPath) || /^\\\\/.test(targetPath) || /^\//.test(targetPath);
}

function createResolvedPromise(value) {
  return {
    then: function (onFulfilled, onRejected) {
      try {
        if (typeof onFulfilled !== "function") {
          return adoptPromiseLike(value);
        }
        return adoptPromiseLike(onFulfilled(value));
      } catch (e) {
        return createRejectedPromise(e).then(null, onRejected);
      }
    },
    catch: function (onRejected) {
      return this.then(null, onRejected);
    }
  };
}

function createRejectedPromise(error) {
  return {
    then: function (onFulfilled, onRejected) {
      try {
        if (typeof onRejected === "function") {
          return adoptPromiseLike(onRejected(error));
        }
      } catch (e) {
        return createRejectedPromise(e);
      }
      return createRejectedPromise(error);
    },
    catch: function (onRejected) {
      return this.then(null, onRejected);
    }
  };
}

function createDeferredPromise() {
  var state = "pending";
  var settledValue;
  var queue = [];

  function flush() {
    while (queue.length) {
      queue.shift()();
    }
  }

  function settle(nextState, value) {
    if (state !== "pending") return;
    state = nextState;
    settledValue = value;
    flush();
  }

  return {
    promise: {
      then: function (onFulfilled, onRejected) {
        var next = createDeferredPromise();

        function run() {
          try {
            if (state === "fulfilled") {
              if (typeof onFulfilled === "function") {
                adoptPromiseLike(onFulfilled(settledValue)).then(next.resolve, next.reject);
              } else {
                next.resolve(settledValue);
              }
            } else if (state === "rejected") {
              if (typeof onRejected === "function") {
                adoptPromiseLike(onRejected(settledValue)).then(next.resolve, next.reject);
              } else {
                next.reject(settledValue);
              }
            }
          } catch (e) {
            next.reject(e);
          }
        }

        if (state === "pending") queue.push(run);
        else run();

        return next.promise;
      },
      catch: function (onRejected) {
        return this.then(null, onRejected);
      }
    },
    resolve: function (value) {
      if (value && typeof value.then === "function") {
        value.then(this.resolve, this.reject);
        return;
      }
      settle("fulfilled", value);
    },
    reject: function (error) {
      settle("rejected", error);
    }
  };
}

function createPromise(executor) {
  if (PromiseCompat) return new PromiseCompat(executor);

  var deferred = createDeferredPromise();
  try {
    executor(deferred.resolve, deferred.reject);
  } catch (e) {
    deferred.reject(e);
  }
  return deferred.promise;
}

function adoptPromiseLike(value) {
  if (value && typeof value.then === "function") return value;
  if (PromiseCompat) return PromiseCompat.resolve(value);
  return createResolvedPromise(value);
}

function initializeConfigLocation() {
  var candidateRoots = [];
  var homeDir = null;
  var i;

  if (activeConfigDir && configPath) {
    ensureDir(activeConfigDir);
    return;
  }

  if (process.env.APPDATA) candidateRoots.push(process.env.APPDATA);
  if (process.env.LOCALAPPDATA) candidateRoots.push(process.env.LOCALAPPDATA);
  if (process.env.USERPROFILE) {
    candidateRoots.push(path.join(process.env.USERPROFILE, "AppData", "Roaming"));
    candidateRoots.push(path.join(process.env.USERPROFILE, "AppData", "Local"));
  }

  try {
    homeDir = os.homedir();
  } catch (e) {
    homeDir = null;
  }

  if (homeDir) {
    candidateRoots.push(path.join(homeDir, "AppData", "Roaming"));
    candidateRoots.push(path.join(homeDir, "AppData", "Local"));
  }

  candidateRoots.push(path.join(os.tmpdir(), "ProcessRecorderData"));

  for (i = 0; i < candidateRoots.length; i++) {
    var root = candidateRoots[i];
    var candidateDir;
    var probeFile;

    if (!root) continue;

    candidateDir = path.join(root, "ProcessRecorder");

    try {
      ensureDir(candidateDir);
      probeFile = path.join(candidateDir, ".write-test");
      fs.writeFileSync(probeFile, "ok", "utf8");
      fs.unlinkSync(probeFile);
      activeConfigDir = candidateDir;
      configPath = path.join(activeConfigDir, "config.json");
      return;
    } catch (e) {
      // try next candidate
    }
  }

  activeConfigDir = path.join(pluginDir, "ProcessRecorder");
  configPath = path.join(activeConfigDir, "config.json");
  ensureDir(activeConfigDir);
}

function log() {
  var parts = [];
  var i;

  for (i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value instanceof Error) {
      parts.push(value.stack || value.message || String(value));
    } else if (typeof value === "object" && value !== null) {
      try {
        parts.push(JSON.stringify(value));
      } catch (jsonErr) {
        parts.push(String(value));
      }
    } else {
      parts.push(String(value));
    }
  }

  console.log("[ProcessRecorder] " + parts.join(" "));
}

function getDefaultOutputFolder() {
  if (process.env.USERPROFILE) {
    return path.join(process.env.USERPROFILE, "Desktop", "ProcessRecorder");
  }

  return path.join(__dirname, "Recordings");
}

function canWriteToFolder(folder) {
  var probeFile;

  if (!folder) return false;

  try {
    ensureDir(folder);
    probeFile = path.join(folder, ".process-recorder-write-test");
    fs.writeFileSync(probeFile, "ok", "utf8");
    fs.unlinkSync(probeFile);
    return true;
  } catch (e) {
    log("Folder is not writable:", folder, e);
    return false;
  }
}

function toStoredOutputPath(folder) {
  if (!folder) return null;

  var relative = path.relative(pluginDir, folder);
  if (!isAbsolutePath(relative)) {
    return relative || ".";
  }

  return folder;
}

function fromStoredOutputPath(storedPath) {
  if (!storedPath) return null;
  if (isAbsolutePath(storedPath)) return storedPath;

  return path.resolve(pluginDir, storedPath);
}

function persistConfig(folder) {
  ensureDir(activeConfigDir);
  fs.writeFileSync(configPath, JSON.stringify({ output: toStoredOutputPath(folder) }, null, 2), "utf8");
}

function chooseFolder(callback) {
  var ps =
    "Add-Type -AssemblyName System.Windows.Forms;" +
    "$f = New-Object System.Windows.Forms.FolderBrowserDialog;" +
    "if($f.ShowDialog() -eq 'OK'){ $f.SelectedPath }";

  cp.exec('powershell -NoProfile -Command "' + ps + '"', function (err, stdout, stderr) {
    if (err) log("Folder picker error:", err);
    if (stderr) log("Folder picker stderr:", stderr);
    if (stdout) callback(stdout.replace(/\r?\n/g, ""));
  });
}

function loadConfig(cb) {
  initializeConfigLocation();

  try {
    ensureDir(activeConfigDir);
    if (fs.existsSync(configPath)) {
      var data = JSON.parse(fs.readFileSync(configPath, "utf8"));
      outputFolder = data && data.output ? fromStoredOutputPath(data.output) : null;
    }
  } catch (e) {
    log("Config read error:", e);
  }

  if (outputFolder && canWriteToFolder(outputFolder)) {
    log("Using saved output folder:", outputFolder);
    cb();
    return;
  }

  if (outputFolder) {
    log("Saved output folder is unavailable, will prompt again:", outputFolder);
  } else {
    log("No saved output folder found, prompting user.");
  }

  chooseFolder(function (folder) {
    if (!folder) {
      log("No folder selected. Recording disabled.");
      return;
    }

    try {
      if (!canWriteToFolder(folder)) {
        log("Selected folder is not writable:", folder);
        return;
      }

      outputFolder = folder;
      persistConfig(folder);
      log("Saved output folder:", folder);
    } catch (e) {
      log("Config write error:", e);

      if (!outputFolder) {
        var defaultFolder = getDefaultOutputFolder();
        if (canWriteToFolder(defaultFolder)) {
          outputFolder = defaultFolder;
          log("Using default output folder after config failure:", outputFolder);
        }
      }
    }

    if (outputFolder) {
      cb();
    }
  });
}

function getSafeName(name) {
  return String(name || "").replace(/[<>:"\/\\|?*]/g, "_");
}

function getFallbackFolder(docId) {
  return path.join(outputFolder, "Doc_" + String(docId));
}

function shouldUseFallbackPath(targetPath) {
  return !!targetPath && targetPath.length >= MAX_WINDOWS_PATH;
}

function switchToFallbackFolder(docId, currentFolder) {
  if (!outputFolder) return currentFolder;

  var fallbackFolder = getFallbackFolder(docId);
  if (currentFolder === fallbackFolder) return fallbackFolder;

  try {
    ensureDir(fallbackFolder);

    if (currentFolder && fs.existsSync(currentFolder)) {
      var items = fs.readdirSync(currentFolder);
      if (!items.length) {
        try { fs.rmdirSync(currentFolder); } catch (cleanupErr) { /* ignore */ }
      }
    }
  } catch (e) {
    log("Fallback folder switch error:", e);
  }

  docFolders[docId] = fallbackFolder;
  frameIndex[docId] = getMaxFrameIndex(fallbackFolder);
  return fallbackFolder;
}

function hashPixels(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function pad(num, size) {
  var s = String(num);
  while (s.length < size) s = "0" + s;
  return s;
}

function clearDocState(docId) {
  delete docFolders[docId];
  delete docResolutions[docId];
  delete docFrameSize[docId];
  delete frameIndex[docId];
  delete frameExtension[docId];
  delete lastHash[docId];
  delete changeCount[docId];
  delete conversionChains[docId];
  delete pendingConversions[docId];
  delete pendingExportFolders[docId];
  delete pendingExportSizes[docId];
  delete trackedWithoutCapture[docId];
  delete docInitialized[docId];
}

function getMaxFrameIndex(folder) {
  try {
    if (!fs.existsSync(folder)) return 0;

    var files = fs.readdirSync(folder);
    var max = 0;

    for (var i = 0; i < files.length; i++) {
      var m = /^frame_(\d{6})\.jpg$/i.exec(files[i]);
      if (!m) continue;

      var n = parseInt(m[1], 10);
      if (n > max) max = n;
    }

    return max;
  } catch (e) {
    return 0;
  }
}

function detectFrameExtension(folder) {
  try {
    if (!folder || !fs.existsSync(folder)) return "jpg";

    var files = fs.readdirSync(folder);
    for (var i = 0; i < files.length; i++) {
      if (/^frame_\d{6}\.jpg$/i.test(files[i])) return "jpg";
    }

  } catch (e) {
    /* ignore */
  }

  return "jpg";
}

function getDocName(info, docId) {
  var filePath = info && info.file ? info.file : null;
  var rawName = null;

  if (filePath) rawName = path.basename(filePath, path.extname(filePath));
  if (!rawName && info && info.name) rawName = String(info.name);
  if (!rawName && info && info.title) rawName = String(info.title);
  if (!rawName) rawName = "Untitled_" + docId;

  return getSafeName(rawName);
}

function getDocResolution(info) {
  var ppi = info && info.resolution;

  if (typeof ppi === "string") {
    ppi = parseFloat(ppi);
  }

  if (!isFinite(ppi) || ppi <= 0) {
    ppi = DEFAULT_PPI;
  }

  return ppi;
}

function isStrokeLikeEvent(evt) {
  if (!evt) return false;

  if (evt.layers && evt.layers.length) {
    for (var i = 0; i < evt.layers.length; i++) {
      if (evt.layers[i] && evt.layers[i].pixels) return true;
    }
  }

  return true;
}

function getEventDocId(evt) {
  if (!evt) return null;

  return evt.id ||
    evt.documentID ||
    evt.documentId ||
    (evt.document && (evt.document.id || evt.document.documentId)) ||
    null;
}

function updateDocFrameSize(docId, width, height) {
  var current = docFrameSize[docId];

  if (!current) {
    current = { width: width, height: height };
    docFrameSize[docId] = current;
    return {
      size: current,
      changed: true
    };
  }

  return {
    size: current,
    changed: false
  };
}

function buildFitFilter(inputWidth, inputHeight, targetWidth, targetHeight) {
  var scale = Math.min(targetWidth / inputWidth, targetHeight / inputHeight);
  var scaledWidth = Math.max(1, Math.round(inputWidth * scale));
  var scaledHeight = Math.max(1, Math.round(inputHeight * scale));

  return "scale=" + scaledWidth + ":" + scaledHeight + ",pad=" +
    targetWidth + ":" + targetHeight + ":(ow-iw)/2:(oh-ih)/2:black";
}

function buildNormalizeFilter(targetWidth, targetHeight) {
  return "scale=" + targetWidth + ":" + targetHeight +
    ":force_original_aspect_ratio=decrease,pad=" +
    targetWidth + ":" + targetHeight + ":(ow-iw)/2:(oh-ih)/2:black";
}

function replaceNormalizedFrames(folder) {
  var files = fs.readdirSync(folder);
  var i;
  var src;
  var dst;

  for (i = 0; i < files.length; i++) {
    if (/^normalized_\d{6}\.jpg$/i.test(files[i])) {
      dst = path.join(folder, files[i].replace(/^normalized_/i, "frame_"));
      src = path.join(folder, files[i]);
      if (fs.existsSync(dst)) {
        fs.unlinkSync(dst);
      }
      fs.renameSync(src, dst);
    }
  }
}

function getFrameFiles(folder) {
  try {
    return fs.readdirSync(folder).filter(function (name) {
      return /^frame_\d{6}\.jpg$/i.test(name);
    }).sort();
  } catch (e) {
    return [];
  }
}

function readJpegSize(filePath) {
  try {
    var buffer = fs.readFileSync(filePath);
    var offset = 2;

    if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null;

    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xFF) {
        offset += 1;
        continue;
      }

      var marker = buffer[offset + 1];
      if (marker === 0xD8 || marker === 0xD9) {
        offset += 2;
        continue;
      }

      if (offset + 4 > buffer.length) break;

      var length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) break;

      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5)
        };
      }

      offset += 2 + length;
    }
  } catch (e) {
    return null;
  }

  return null;
}

function getTargetFrameSize(folder, preferredSize) {
  if (preferredSize && preferredSize.width && preferredSize.height) return preferredSize;

  var frames = getFrameFiles(folder);
  if (!frames.length) return null;

  return readJpegSize(path.join(folder, frames[0]));
}

function getMismatchedFrameFiles(folder, targetSize) {
  var frames = getFrameFiles(folder);
  var mismatched = [];
  var i;

  for (i = 0; i < frames.length; i++) {
    var size = readJpegSize(path.join(folder, frames[i]));
    if (!size || size.width !== targetSize.width || size.height !== targetSize.height) {
      mismatched.push(frames[i]);
    }
  }

  return mismatched;
}

function normalizeSingleFrame(docId, folder, frameName, targetSize) {
  return createPromise(function (resolve) {
    var outputName = 'normalized_' + frameName;
    var args = [
      '-y',
      '-loglevel', 'error',
      '-i', frameName,
      '-vf', buildNormalizeFilter(targetSize.width, targetSize.height),
      '-q:v', String(JPG_QUALITY),
      outputName
    ];
    var child = cp.spawn(FFMPEG, args, { cwd: folder, windowsHide: true });
    var stderr = '';

    child.stderr.on('data', function (chunk) {
      stderr += chunk.toString();
    });

    child.on('error', function (err) {
      log('Frame normalization spawn error:', JSON.stringify({ docId: docId, frame: frameName, error: String(err) }));
      resolve();
    });

    child.on('close', function (code) {
      if (code !== 0) {
        log('Frame normalization error:', JSON.stringify({ docId: docId, frame: frameName, code: code, stderr: stderr.trim() }));
        resolve();
        return;
      }

      try {
        var src = path.join(folder, outputName);
        var dst = path.join(folder, frameName);
        if (fs.existsSync(dst)) fs.unlinkSync(dst);
        fs.renameSync(src, dst);
      } catch (e) {
        log('Frame normalization finalize error:', e);
      }

      resolve();
    });
  });
}

function normalizeSelectedFrames(docId, folder, targetSize, frameNames) {
  var chain = adoptPromiseLike();
  var i;

  for (i = 0; i < frameNames.length; i++) {
    (function (frameName) {
      chain = chain.then(function () {
        return normalizeSingleFrame(docId, folder, frameName, targetSize);
      });
    }(frameNames[i]));
  }

  return chain;
}

function normalizeFrames(docId, folder, targetSize) {
  return createPromise(function (resolve) {
    var effectiveTarget = getTargetFrameSize(folder, targetSize);
    var mismatchedFrames;

    if (!effectiveTarget || !effectiveTarget.width || !effectiveTarget.height) {
      resolve();
      return;
    }

    if (!fs.existsSync(FFMPEG)) {
      resolve();
      return;
    }

    mismatchedFrames = getMismatchedFrameFiles(folder, effectiveTarget);
    if (!mismatchedFrames.length) {
      resolve();
      return;
    }

    normalizeSelectedFrames(docId, folder, effectiveTarget, mismatchedFrames).then(function () {
      resolve();
    }).catch(function (e) {
      log('Frame normalization queue error:', e);
      resolve();
    });
  });
}

function maybeExportAfterConversions(docId) {
  var folder = pendingExportFolders[docId];
  var targetSize = pendingExportSizes[docId];
  if (!folder) return;
  if (pendingConversions[docId] > 0) return;

  delete pendingExportFolders[docId];
  exportVideo(folder, targetSize, function () {
    clearDocState(docId);
    delete exportingDocs[docId];
  });
}

function convertPixmapToJpg(docId, folder, pixmap, outPath, targetSize) {
  return createPromise(function (resolve) {
    var args = [
      "-y",
      "-loglevel", "error",
      "-f", "rawvideo",
      "-pixel_format", "argb",
      "-video_size", pixmap.width + "x" + pixmap.height,
      "-i", "-",
      "-frames:v", "1",
      "-vf", buildFitFilter(pixmap.width, pixmap.height, targetSize.width, targetSize.height),
      "-q:v", String(JPG_QUALITY),
      path.basename(outPath)
    ];
    var child = cp.spawn(FFMPEG, args, { cwd: folder, windowsHide: true });
    var stderr = "";

    child.stderr.on("data", function (chunk) {
      stderr += chunk.toString();
    });

    child.on("error", function (err) {
      log("Frame conversion spawn error:", JSON.stringify({ docId: docId, output: outPath, error: String(err) }));
      resolve(false);
    });

    child.on("close", function (code) {
      if (code !== 0 || !fs.existsSync(outPath)) {
        log("Frame conversion error:", JSON.stringify({ docId: docId, output: outPath, code: code, stderr: stderr.trim() }));
        resolve(false);
        return;
      }

      resolve(true);
    });

    child.stdin.on("error", function (err) {
      log("Frame conversion stdin error:", JSON.stringify({ docId: docId, output: outPath, error: String(err) }));
    });

    child.stdin.end(pixmap.pixels);
  });
}

function queueFrameConversion(docId, folder, pixmap, outPath) {
  var sizeResult = updateDocFrameSize(docId, pixmap.width, pixmap.height);
  var targetSize = sizeResult.size;
  var shouldNormalizeExisting = sizeResult.changed && frameIndex[docId] > 1;

  if (!fs.existsSync(FFMPEG)) {
    log("ffmpeg missing; frame conversion skipped:", FFMPEG);
    return;
  }

  pendingConversions[docId] = (pendingConversions[docId] || 0) + 1;
  conversionChains[docId] = adoptPromiseLike(conversionChains[docId]).then(function () {
    if (shouldNormalizeExisting) {
      return normalizeFrames(docId, folder, targetSize).then(function () {
        return convertPixmapToJpg(docId, folder, pixmap, outPath, targetSize);
      });
    }

    return convertPixmapToJpg(docId, folder, pixmap, outPath, targetSize);
  }).then(function (success) {
    if (success) {
      frameExtension[docId] = "jpg";
    }

    pendingConversions[docId] = Math.max((pendingConversions[docId] || 1) - 1, 0);
    maybeExportAfterConversions(docId);
  }).catch(function (e) {
    pendingConversions[docId] = Math.max((pendingConversions[docId] || 1) - 1, 0);
    log("Frame conversion queue error:", e);
    maybeExportAfterConversions(docId);
  });
}


function getOrCreateDocFolder(generator, docId, allowCreate) {
  if (!outputFolder) return adoptPromiseLike(null);
  if (typeof allowCreate === "undefined") allowCreate = true;

  return adoptPromiseLike(generator.getDocumentInfo(docId)).catch(function (e) {
    log("getDocumentInfo error, using fallback document name:", docId, e);
    return null;
  }).then(function (info) {
    var docName = getDocName(info, docId);
    var existing = docFolders[docId];
    var firstFolder;
    var firstFrameSize;

    docResolutions[docId] = getDocResolution(info);

    if (!existing) {
      firstFolder = path.join(outputFolder, docName);

      if (shouldUseFallbackPath(path.join(firstFolder, "frame_000001.jpg"))) {
        firstFolder = getFallbackFolder(docId);
      }

      if (!allowCreate && !fs.existsSync(firstFolder)) {
        return null;
      }

      if (allowCreate || fs.existsSync(firstFolder)) {
        ensureDir(firstFolder);
        docFolders[docId] = firstFolder;
        frameIndex[docId] = getMaxFrameIndex(firstFolder);
        existing = firstFolder;
      }
    }

    if (!existing) return null;

    if (!docFrameSize[docId]) {
      firstFrameSize = getTargetFrameSize(existing, null);
      if (firstFrameSize) {
        docFrameSize[docId] = firstFrameSize;
      }
    }

    if (docName) {
      var correctFolder = path.join(outputFolder, docName);
      if (shouldUseFallbackPath(path.join(correctFolder, "frame_000001.jpg"))) {
        correctFolder = getFallbackFolder(docId);
      }

      if (existing !== correctFolder) {
        try {
          if (fs.existsSync(correctFolder)) {
            docFolders[docId] = correctFolder;
            existing = correctFolder;
            frameIndex[docId] = getMaxFrameIndex(existing);
          } else if (allowCreate) {
            fs.renameSync(existing, correctFolder);
            docFolders[docId] = correctFolder;
            existing = correctFolder;
            frameIndex[docId] = getMaxFrameIndex(existing);
          }
        } catch (e) {
          log("Folder rename error:", e);
        }
      }
    }

    trackedWithoutCapture[docId] = frameIndex[docId] > 0;
    return existing;
  }).catch(function (e) {
    log("getOrCreateDocFolder error:", e);
    return null;
  });
}

function exportAndCleanup(docId) {
  var folder = docFolders[docId];
  var targetSize = getTargetFrameSize(folder, docFrameSize[docId]);
  if (!folder || exportingDocs[docId]) return;

  exportingDocs[docId] = true;
  pendingExportSizes[docId] = targetSize;

  if (pendingConversions[docId] > 0) {
    pendingExportFolders[docId] = folder;
    return;
  }

  exportVideo(folder, targetSize, function () {
    clearDocState(docId);
    delete exportingDocs[docId];
  });
}

function exportVideo(folder, targetSize, done) {
  if (!folder || !fs.existsSync(folder)) {
    if (done) done();
    return;
  }

  var hasFrames = false;
  var frameExt = detectFrameExtension(folder);
  try {
    var list = fs.readdirSync(folder);
    for (var i = 0; i < list.length; i++) {
      if (new RegExp("^frame_\\d{6}\\." + frameExt + "$", "i").test(list[i])) { hasFrames = true; break; }
    }
  } catch (e) { /* ignore */ }

  if (!hasFrames) {
    if (done) done();
    return;
  }

  if (!fs.existsSync(FFMPEG)) {
    log("Skipping video export because ffmpeg was not found:", FFMPEG);
    if (done) done();
    return;
  }

  function runExport() {
    log("Exporting video:", JSON.stringify({ folder: folder, ext: frameExt }));

    var cmd =
      '"' + FFMPEG + '"' +
      ' -y' +
      ' -framerate ' + FPS +
      ' -start_number 1' +
      ' -i frame_%06d.' + frameExt +
      ' -vf "crop=iw-mod(iw\\,2):ih-mod(ih\\,2)"' +
      ' -c:v libx264' +
      ' -preset slow' +
      ' -crf 18' +
      ' -pix_fmt yuv420p' +
      ' -movflags +faststart' +
      ' output.mp4';

    cp.exec(cmd, { cwd: folder }, function (err, stdout, stderr) {
      if (stdout) log(stdout);
      if (stderr) log(stderr);
      if (err) {
        log("Export error:", err);
      } else {
        log("Video exported:", path.join(folder, "output.mp4"));
      }
      if (done) done();
    });
  }

  if (frameExt === "jpg" && targetSize && targetSize.width && targetSize.height) {
    normalizeFrames("export", folder, targetSize).then(function () {
      runExport();
    }).catch(function (e) {
      log("Final frame normalization error:", e);
      runExport();
    });
    return;
  }

  runExport();
}

function checkClosedDocuments(generator) {
  if (!generator || typeof generator.getOpenDocumentIDs !== "function") {
    return adoptPromiseLike();
  }

  return generator.getOpenDocumentIDs().then(function (openDocIds) {
    var stillOpen = {};
    var i;

    for (i = 0; i < openDocIds.length; i++) {
      stillOpen[String(openDocIds[i])] = true;
      getOrCreateDocFolder(generator, openDocIds[i], false);
    }

    var trackedIds = Object.keys(docFolders);
    for (i = 0; i < trackedIds.length; i++) {
      if (!stillOpen[trackedIds[i]]) {
        log("Detected closed document:", trackedIds[i]);
        exportAndCleanup(trackedIds[i]);
      }
    }
  }).catch(function (e) {
    log("getOpenDocumentIDs error:", e);
  });
}

function init(generator) {
  log("Process Recorder started");

  loadConfig(function () {
    function onChanged(evt) {
      try {
        var docId = getEventDocId(evt);
        var shouldCapture;

        if (!docId) {
          checkClosedDocuments(generator);
          return;
        }

        if (evt && evt.closed === true) {
          exportAndCleanup(docId);
          checkClosedDocuments(generator);
          return;
        }
        getOrCreateDocFolder(generator, docId, false);

        if (evt && evt.metaDataOnly === true) {
          checkClosedDocuments(generator);
          return;
        }

        if (!isStrokeLikeEvent(evt)) {
          checkClosedDocuments(generator);
          return;
        }

        if (!docInitialized[docId]) {
          if (trackedWithoutCapture[docId] && frameIndex[docId] > 0) {
            changeCount[docId] = 0;
            checkClosedDocuments(generator);
            return;
          }

          docInitialized[docId] = true;
          trackedWithoutCapture[docId] = false;
          changeCount[docId] = 0;
          saveFrame(generator, docId);
          checkClosedDocuments(generator);
          return;
        }

        changeCount[docId] = (changeCount[docId] || 0) + 1;
        shouldCapture = changeCount[docId] >= THRESHOLD_STROKES;
        if (!shouldCapture) {
          checkClosedDocuments(generator);
          return;
        }
        changeCount[docId] = 0;

        saveFrame(generator, docId);
      } catch (e) {
        log("change handler error:", e);
      }

      checkClosedDocuments(generator);
    }

    generator.onPhotoshopEvent("imageChanged", onChanged);
    generator.onPhotoshopEvent("documentChanged", onChanged);
    generator.onPhotoshopEvent("currentDocumentChanged", function (evt) {
      var docId = getEventDocId(evt);
      if (docId) {
        getOrCreateDocFolder(generator, docId, false);
      }
      checkClosedDocuments(generator);
    });
    checkClosedDocuments(generator);
    setInterval(function () {
      checkClosedDocuments(generator);
    }, 2000);
  });
}

exports.init = init;






