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
- Auto renames the output folder if the PSD is saved or renamed
- Supports recording multiple open files at the same time
- Runs quietly in the background with no pop-ups or UI

---

## Compatibility

Tested and verified with:

• Adobe Photoshop CC 2014 / 2026

• Windows 10 / 11  

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

Copy the **ProcessRecorder** folder to:

💡 The exact path varies by Photoshop version and installation type, if you don't already have  **Generator** folder, please create one.

`C:\Program Files\Adobe\Adobe Photoshop 20xx\Plug-Ins\Generator\`

or

`C:\Program Files\Adobe\Adobe Photoshop 20xx\Required\Plug-Ins\Generator\`

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
`C:\`

You should have:

`C:\ffmpeg\bin\ffmpeg.exe`

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

## Customization

You can customize the recorder by editing the settings at the top of `index.js`.

### Main settings


- `var THRESHOLD_STROKES = 5;`

  Controls how often a frame is captured.
  
  Lower values capture more often and create smoother timelapses, but generate more frames and larger output.
- `var CAPTURE_SCALE = 0.5;`

  Controls the capture size before frame conversion.
  
  `1.0` = full-size capture.
  
  `0.5 `= half-size capture.
  
  Lower values reduce file size and processing time.
- `var FPS = 12;`
  
  Controls the frame rate of the exported MP4.

  Higher values make the final video play faster/smoother.
- `var FFMPEG = "C:\\ffmpeg\\bin\\ffmpeg.exe";`
  
  Full path to your ffmpeg.exe.

  Update this if ffmpeg is installed in a different location.

### Changing the Output Folder

The plugin saves your selected output folder in a config file, so you normally only need to choose it once, if you want to select a different output folder, edit the plugin’s config file and restart Photoshop.

Typical config file location:

`%APPDATA%\ProcessRecorder\config.json`

  or
  
`%LOCALAPPDATA%\ProcessRecorder\config.json`

What the config file contains:

```json
{
  "output": "C:\\Users\\YourName\\Desktop\\ProcessRecorder"
}
```

---

## 🙌 Contributing

Improvements, compatibility updates, and workflow enhancements are welcome.

If you adapt this plugin for a different Photoshop version or platform, feel free to share your improvements.


