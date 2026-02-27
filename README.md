# Photoshop Process Recorder

<p align="left">
  <img src="assets/preview.gif" width="300">
</p>

A lightweight Photoshop Generator plugin that records your drawing process and automatically exports a timelapse video when you close the file.

It uses minimal RAM, and it's optimised for older setups and legacy Photoshop versions.

Designed for illustrators and digital painters who want an effortless way to capture their workflow.

---

## ✨ Features

- Records the canvas only when you draw (idle time is skipped)
- Continues recording when you reopen the same PSD
- Automatically exports an MP4 timelapse when the file is closed
- Keeps adding to the same timelapse each time you reopen and close the file
- Renames the output folder if the PSD is saved or renamed
- Supports recording multiple open files at the same time
- Runs quietly in the background with no pop-ups or UI
- Optional half-size capture to reduce storage use (A4 @ 300 DPI ≈ ~40–250 KB per frame)

---

## Compatibility

Tested and verified with:

• Adobe Photoshop CC 2014  
• Windows 10  

The plugin uses Photoshop Generator and may work on other CC versions.  
Compatibility may vary depending on Generator behavior and installation type.

---

## 🔧 Enable Generator in Photoshop

1. Open Photoshop  
2. Press **Ctrl + K**  
3. Go to **Plug-ins**  
4. ✔ Enable **Generator**  
5. Restart Photoshop  


---

## 📦 Installation

### 1️⃣ Install the plugin

Copy the plugin folder to:

💡 The exact path varies by Photoshop version and installation type, if you don't already have  **Generator** folder, please create one.
```bash
C:\Program Files\Adobe\Adobe Photoshop CC\Required\Plug-Ins\Generator\
```
or
```bash
C:\Program Files\Adobe\Adobe Photoshop CC\Plug-Ins\Generator\
```
Final structure:
```bash
Generator/
└── ProcessRecorder/
    ├── index.js
    └── package.json
```


---

### 2️⃣ Install FFmpeg

Download FFmpeg:

https://www.gyan.dev/ffmpeg/builds/

Download:

**ffmpeg-release-essentials.zip**

Extract to:
```bash
C:\ffmpeg\
```
You should have:
```bash
C:\ffmpeg\bin\ffmpeg.exe
```
This matches the plugin configuration.


---

## ▶️ Usage

1. Open or create a PSD  
2. Start drawing  
3. On first run, choose an output folder  
4. Close the document  
5. The timelapse video is exported automatically  

---

## 📁 Output Structure
```bash
YourChosenFolder/
└── ArtworkName/
    ├──frame_000001.jpg
    ├──frame_000002.jpg
    └── output.mp4
```

---

## No UI / How to confirm it's running

This is a Photoshop Generator plugin. It runs in the background and does not show an in-app UI.

To confirm it is working:
- On first run, you will be asked to choose an output folder.
- After drawing a few strokes, frames will appear in the output folder.

---

## 🙌 Contributing

Improvements, compatibility updates, and workflow enhancements are welcome.

If you adapt this plugin for a different Photoshop version or platform, feel free to share your improvements.


