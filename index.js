/**
 * Process Recorder (Photoshop Generator plugin)
 * - Saves a frame every N stroke-like pixel changes (default: 3)
 * - User picks an output base folder on first run (stored in config.json)
 * - Frames go under: <base>/<PSD name or Untitled_ID>/
 * - If the PSD is later saved/renamed, the folder is renamed automatically
 * - On close (evt.closed === true), exports output.mp4 from frames via ffmpeg
 */

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

// ---- Settings ----
var THRESHOLD_STROKES = 3;
var FRAME_JPG_QUALITY = 80; // 0-100
var CAPTURE_SCALE = 0.5;    // 1.0 = full size, 0.5 = half size
var FPS = 12;

// Update if your ffmpeg is elsewhere
var FFMPEG = "C:\\ffmpeg\\bin\\ffmpeg.exe";
var configPath = path.join(__dirname, "config.json");

// ---- State ----
var outputFolder = null;          // user-chosen base folder
var docFolders = {};              // docId -> absolute folder path
var frameIndex = {};              // docId -> last written frame number
var lastHash = {};                // docId -> md5 of last saved pixmap
var changeCount = {};             // docId -> stroke counter

// ---- Helpers ----
function chooseFolder(callback) {
  // Windows-only folder picker via PowerShell
  var ps =
    "Add-Type -AssemblyName System.Windows.Forms;" +
    "$f = New-Object System.Windows.Forms.FolderBrowserDialog;" +
    "if($f.ShowDialog() -eq 'OK'){ $f.SelectedPath }";

  cp.exec('powershell -NoProfile -Command "' + ps + '"', function (err, stdout, stderr) {
    if (err) console.log("Folder picker error:", err);
    if (stderr) console.log("Folder picker stderr:", stderr);
    if (stdout) callback(stdout.replace(/\r?\n/g, ""));
  });
}

function loadConfig(cb) {
  try {
    if (fs.existsSync(configPath)) {
      var data = JSON.parse(fs.readFileSync(configPath, "utf8"));
      outputFolder = data && data.output ? data.output : null;
    }
  } catch (e) {
    console.log("Config read error:", e && e.stack ? e.stack : e);
  }

  if (outputFolder) {
    cb();
    return;
  }

  chooseFolder(function (folder) {
    if (!folder) {
      console.log("No folder selected. Recording disabled.");
      return;
    }

    outputFolder = folder;

    try {
      fs.writeFileSync(configPath, JSON.stringify({ output: folder }, null, 2), "utf8");
      console.log("Saved output folder:", folder);
    } catch (e) {
      console.log("Config write error:", e && e.stack ? e.stack : e);
    }

    cb();
  });
}

function ensureDir(dir) {
  if (!dir) return;
  if (fs.existsSync(dir)) return;

  ensureDir(path.dirname(dir));
  try { fs.mkdirSync(dir); } catch (e) { /* ignore */ }
}

function getSafeName(name) {
  return String(name || "").replace(/[<>:"\/\\|?*]/g, "_");
}

function hashPixels(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function pad(num, size) {
  var s = String(num);
  while (s.length < size) s = "0" + s;
  return s;
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

function isStrokeLikeEvent(evt) {
  if (!evt) return false;

  // Prefer pixel-change signals from generator-assets
  if (evt.layers && evt.layers.length) {
    for (var i = 0; i < evt.layers.length; i++) {
      if (evt.layers[i] && evt.layers[i].pixels) return true;
    }
  }

  // Fallback: treat as a change (keeps behavior consistent across builds)
  return true;
}

// ---- Folder resolution / rename-on-save ----
function getOrCreateDocFolder(generator, docId) {
  if (!outputFolder) return Promise.resolve(null);

  return generator.getDocumentInfo(docId).then(function (info) {
    var filePath = info && info.file ? info.file : null;

    var docName = filePath
      ? path.basename(filePath, path.extname(filePath))
      : null;

    if (docName) docName = getSafeName(docName);

    var existing = docFolders[docId];

    // First time: create folder
    if (!existing) {
      var firstName = docName || ("Untitled_" + docId);
      var firstFolder = path.join(outputFolder, firstName);

      ensureDir(firstFolder);
      docFolders[docId] = firstFolder;

      // Continue numbering if folder already has frames
      frameIndex[docId] = getMaxFrameIndex(firstFolder);
      existing = firstFolder;
    }

    // If later saved/renamed: rename folder
    if (docName) {
      var correctFolder = path.join(outputFolder, docName);

      if (existing !== correctFolder) {
        try {
          if (!fs.existsSync(correctFolder)) {
            fs.renameSync(existing, correctFolder);
          }
        } catch (e) {
          console.log("Folder rename error:", e && e.stack ? e.stack : e);
        }

        docFolders[docId] = correctFolder;
        existing = correctFolder;

        // Re-scan frames in the new location
        frameIndex[docId] = getMaxFrameIndex(existing);
      }
    }

    return existing;
  }).catch(function (e) {
    console.log("getOrCreateDocFolder error:", e && e.stack ? e.stack : e);
    return null;
  });
}

// ---- Capture frames ----
function saveFrame(generator, docId) {
  if (!outputFolder) return Promise.resolve();

  return getOrCreateDocFolder(generator, docId).then(function (folder) {
    if (!folder) return;

    return generator.getDocumentPixmap(docId, {
      scaleX: CAPTURE_SCALE,
      scaleY: CAPTURE_SCALE,
      clipToDocumentBounds: true
    }).then(function (pixmap) {
      if (!pixmap || !pixmap.pixels) {
        console.log("No pixmap returned for doc:", docId);
        return;
      }

      // Skip identical frames
      var h = hashPixels(pixmap.pixels);
      if (lastHash[docId] === h) return;
      lastHash[docId] = h;

      var next = (frameIndex[docId] || 0) + 1;
      frameIndex[docId] = next;

      var filename = "frame_" + pad(next, 6) + ".jpg";
      var out = path.join(folder, filename);

      return generator.savePixmap(pixmap, out, {
        format: "jpg",
        quality: FRAME_JPG_QUALITY
      }).catch(function (e) {
        console.log("savePixmap error:", e && e.stack ? e.stack : e);
      });
    }).catch(function (e) {
      console.log("getDocumentPixmap error:", e && e.stack ? e.stack : e);
    });
  });
}

// ---- Export video ----
function exportVideo(folder) {
  if (!folder || !fs.existsSync(folder)) return;

  // Confirm frames exist
  var hasFrames = false;
  try {
    var list = fs.readdirSync(folder);
    for (var i = 0; i < list.length; i++) {
      if (/^frame_\d{6}\.jpg$/i.test(list[i])) { hasFrames = true; break; }
    }
  } catch (e) { /* ignore */ }

  if (!hasFrames) return;

  console.log("Exporting video:", folder);

  // Crop by 0 or 1 pixel to ensure even width/height (H.264 yuv420p requirement)
  var cmd =
    '"' + FFMPEG + '"' +
    ' -y' +
    ' -framerate ' + FPS +
    ' -start_number 1' +
    ' -i frame_%06d.jpg' +
    ' -vf "crop=iw-mod(iw\\,2):ih-mod(ih\\,2)"' +
    ' -c:v libx264' +
    ' -preset slow' +
    ' -crf 18' +
    ' -pix_fmt yuv420p' +
    ' -movflags +faststart' +
    ' output.mp4';

  cp.exec(cmd, { cwd: folder }, function (err, stdout, stderr) {
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
    if (err) console.log("Export error:", err);
    else console.log("Video exported ✔", path.join(folder, "output.mp4"));
  });
}

// ---- Plugin entry ----
function init(generator) {
  console.log("Process Recorder started");

  loadConfig(function () {
    function onChanged(evt) {
      try {
        var docId = evt && (evt.id || evt.documentID || evt.documentId);
        if (!docId) return;

        // Reliable close detection for PS 15.2.2: generator-assets change payload
        if (evt.closed === true) {
          var folder = docFolders[docId];
          if (folder) exportVideo(folder);

          // cleanup (optional)
          delete changeCount[docId];
          delete lastHash[docId];
          return;
        }

        if (!isStrokeLikeEvent(evt)) return;

        changeCount[docId] = (changeCount[docId] || 0) + 1;
        if (changeCount[docId] < THRESHOLD_STROKES) return;
        changeCount[docId] = 0;

        console.log("Saving frame for doc:", docId);
        saveFrame(generator, docId);
      } catch (e) {
        console.log("change handler error:", e && e.stack ? e.stack : e);
      }
    }

    generator.onPhotoshopEvent("imageChanged", onChanged);
    generator.onPhotoshopEvent("documentChanged", onChanged);
  });
}

exports.init = init;
