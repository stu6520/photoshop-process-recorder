# Photoshop Process Recorder

A Photoshop Generator plugin that records your drawing process and automatically exports a timelapse video when you close the document.

Designed for illustrators, concept artists, and digital painters who want an effortless way to capture their workflow.

---

## ✨ Features

• Automatically captures frames while you draw  
• Saves frames every few strokes to reduce storage usage  
• Continues recording when reopening the same PSD  
• Renames output folder when the PSD is saved or renamed  
• Exports a high-quality MP4 timelapse when the document is closed  
• Avoids duplicate frames to keep videos clean  
• Optimized for performance on large canvases  

---

## 🖥 Requirements

- Adobe Photoshop CC (Generator enabled)  
- Windows  
- FFmpeg  

---

## 🔧 Enable Generator in Photoshop

1. Open Photoshop  
2. Press **Ctrl + K**  
3. Go to **Plug-ins**  
4. ✔ Enable **Generator**  
5. Restart Photoshop  

To confirm it is active:

**File → Generate → Image Assets**

---

## 📦 Installation

### 1️⃣ Install the plugin

Copy the plugin folder to:
```bash
C:\Program Files\Adobe\Adobe Photoshop CC\Required\Plug-Ins\Generator\
```

Final structure:
```bash
Generator/
└── ProcessRecorder/
    ├── index.js
    └── package.json
```
Restart Photoshop.

If successful, the Generator log will show:
```bash
Plugin loaded: process-recorder
Process Recorder started
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

## ⚙️ Customization

Inside `index.js` you can adjust:
```bash
THRESHOLD_STROKES // capture frequency
CAPTURE_SCALE // 1 = full size, 0.5 = half size
FPS // video frame rate
CRF value // video quality (lower = better)
```

---

## ⚠️ Known Limitations

- Windows only (folder picker uses PowerShell)
- Requires Photoshop Generator support
- Very large documents may produce large frame sets

---

## 📜 License

This project is free for **personal and non-commercial use**.

You may:

✔ use the plugin  
✔ modify it for your workflow or Photoshop version  
✔ share modified versions  

You may NOT:

✘ sell this software  
✘ include it in paid products or services  
✘ use it for commercial purposes  

For commercial licensing inquiries, please contact the author.

---

## 🙌 Contributing

Improvements, compatibility updates, and workflow enhancements are welcome.

If you adapt this plugin for a different Photoshop version or platform, feel free to share your improvements.

---

## ⭐ Support

If this tool improves your workflow, consider starring the repository.
