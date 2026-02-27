# Photoshop Process Recorder

A Photoshop Generator plugin that records your drawing process and automatically exports a timelapse video when you close the document.

Designed for illustrators, concept artists, and digital painters who want an effortless way to capture their workflow.

---

## ✨ Features

• Automatically captures frames while you draw  
• Stroke-based capture, auto-pauses capturing when idle  
• Continues recording when reopening the same PSD  
• Renames output folder when the PSD is saved or renamed  
• Auto-exports a MP4 timelapse when the document is closed  
• Avoids duplicate frames to keep videos clean  
• Half-size canvas capture (roughly A4 canvas @ 300 DPI: ~80–250 KB per frame) 

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

## 🙌 Contributing

Improvements, compatibility updates, and workflow enhancements are welcome.

If you adapt this plugin for a different Photoshop version or platform, feel free to share your improvements.


